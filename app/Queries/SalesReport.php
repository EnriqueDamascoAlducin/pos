<?php

namespace App\Queries;

use App\Enums\SaleStatus;
use App\Support\Decimal;
use Carbon\CarbonImmutable;
use Carbon\CarbonPeriod;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Reporte de ventas de un periodo.
 *
 * Utilidad = importe vendido − costo de lo vendido (el costo se guarda en cada partida
 * al momento de vender, así que los cambios de precio posteriores no alteran el reporte).
 * Ambos importes son tal como se capturan (con IVA si el precio lo incluye).
 */
class SalesReport
{
    public function __construct(
        public readonly CarbonImmutable $from,
        public readonly CarbonImmutable $to,
        public readonly ?int $branchId = null,
        public readonly ?int $userId = null,
    ) {}

    /**
     * @return array<string, int|string|null>
     */
    public function summary(): array
    {
        $row = $this->sales()->selectRaw(
            'COUNT(*) as count, COALESCE(SUM(total), 0) as total, COALESCE(SUM(subtotal), 0) as subtotal, '.
            'COALESCE(SUM(tax), 0) as tax, COALESCE(SUM(discount), 0) as discount, COALESCE(SUM(cost_total), 0) as cost'
        )->first();

        $cancelled = $this->sales(SaleStatus::Cancelled)->selectRaw('COUNT(*) as count, COALESCE(SUM(total), 0) as total')->first();

        $total = Decimal::round((string) $row->total);
        $cost = Decimal::round((string) $row->cost);
        $profit = Decimal::sub($total, $cost);
        $count = (int) $row->count;

        return [
            'count' => $count,
            'total' => $total,
            'subtotal' => Decimal::round((string) $row->subtotal),
            'tax' => Decimal::round((string) $row->tax),
            'discount' => Decimal::round((string) $row->discount),
            'cost' => $cost,
            'profit' => $profit,
            'margin' => Decimal::gt($total, '0') ? bcmul(bcdiv($profit, $total, 6), '100', 1) : null,
            'average_ticket' => $count > 0 ? Decimal::round(bcdiv($total, (string) $count, 6)) : '0.00',
            'cancelled_count' => (int) $cancelled->count,
            'cancelled_total' => Decimal::round((string) $cancelled->total),
        ];
    }

    /**
     * Ventas por día, incluyendo días sin ventas (para que la gráfica no salte días).
     *
     * @return list<array{date: string, count: int, total: string, profit: string}>
     */
    public function byDay(): array
    {
        $rows = $this->sales()
            ->selectRaw('DATE(created_at) as day, COUNT(*) as count, SUM(total) as total, SUM(total - cost_total) as profit')
            ->groupByRaw('DATE(created_at)')
            ->get()
            ->keyBy('day');

        $days = [];
        foreach (CarbonPeriod::create($this->from->startOfDay(), $this->to->startOfDay()) as $day) {
            $key = $day->toDateString();
            $row = $rows->get($key);
            $days[] = [
                'date' => $key,
                'count' => (int) ($row->count ?? 0),
                'total' => Decimal::round((string) ($row->total ?? 0)),
                'profit' => Decimal::round((string) ($row->profit ?? 0)),
            ];
        }

        return $days;
    }

    /**
     * @return list<array{method: string, count: int, total: string}>
     */
    public function byPaymentMethod(): array
    {
        return DB::table('sale_payments')
            ->joinSub($this->sales()->select('id'), 's', 's.id', '=', 'sale_payments.sale_id')
            ->selectRaw('method, COUNT(*) as count, SUM(amount) as total')
            ->groupBy('method')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($r) => ['method' => $r->method, 'count' => (int) $r->count, 'total' => Decimal::round((string) $r->total)])
            ->all();
    }

    /**
     * @return list<array{user: string, count: int, total: string, profit: string}>
     */
    public function byCashier(): array
    {
        return $this->sales()
            ->join('users', 'users.id', '=', 'sales.user_id')
            ->selectRaw('users.name as user, COUNT(*) as count, SUM(sales.total) as total, SUM(sales.total - sales.cost_total) as profit')
            ->groupBy('users.id', 'users.name')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($r) => [
                'user' => $r->user,
                'count' => (int) $r->count,
                'total' => Decimal::round((string) $r->total),
                'profit' => Decimal::round((string) $r->profit),
            ])
            ->all();
    }

    /**
     * Productos más vendidos por importe.
     *
     * @return list<array{product_id: int, name: string, code: string|null, quantity: string, total: string, cost: string, profit: string}>
     */
    public function products(?int $limit = 20): array
    {
        return $this->items()
            ->join('products', 'products.id', '=', 'sale_items.product_id')
            ->selectRaw(
                'products.id as product_id, products.name, COALESCE(products.sku, products.barcode) as code, '.
                'SUM(sale_items.quantity) as quantity, SUM(sale_items.total) as total, '.
                'SUM(sale_items.cost * sale_items.quantity) as cost'
            )
            ->groupBy('products.id', 'products.name', 'products.sku', 'products.barcode')
            ->orderByDesc('total')
            ->when($limit, fn ($q) => $q->limit($limit))
            ->get()
            ->map(function ($r) {
                $total = Decimal::round((string) $r->total);
                $cost = Decimal::round((string) $r->cost);

                return [
                    'product_id' => (int) $r->product_id,
                    'name' => $r->name,
                    'code' => $r->code,
                    'quantity' => Decimal::round((string) $r->quantity, 3),
                    'total' => $total,
                    'cost' => $cost,
                    'profit' => Decimal::sub($total, $cost),
                ];
            })
            ->all();
    }

    /**
     * @return list<array{category: string, quantity: string, total: string, profit: string}>
     */
    public function byCategory(): array
    {
        return $this->items()
            ->join('products', 'products.id', '=', 'sale_items.product_id')
            ->leftJoin('categories', 'categories.id', '=', 'products.category_id')
            ->selectRaw(
                "COALESCE(categories.name, 'Sin categoría') as category, SUM(sale_items.quantity) as quantity, ".
                'SUM(sale_items.total) as total, SUM(sale_items.total - sale_items.cost * sale_items.quantity) as profit'
            )
            ->groupBy('categories.name')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($r) => [
                'category' => $r->category,
                'quantity' => Decimal::round((string) $r->quantity, 3),
                'total' => Decimal::round((string) $r->total),
                'profit' => Decimal::round((string) $r->profit),
            ])
            ->all();
    }

    /**
     * Ventas del periodo filtradas (por defecto solo las completadas).
     */
    public function sales(SaleStatus $status = SaleStatus::Completed): Builder
    {
        return DB::table('sales')
            ->where('sales.status', $status->value)
            ->whereBetween('sales.created_at', [$this->from->startOfDay(), $this->to->endOfDay()])
            ->when($this->branchId, fn ($q) => $q->where('sales.branch_id', $this->branchId))
            ->when($this->userId, fn ($q) => $q->where('sales.user_id', $this->userId));
    }

    private function items(): Builder
    {
        return DB::table('sale_items')->joinSub($this->sales()->select('id'), 's', 's.id', '=', 'sale_items.sale_id');
    }
}
