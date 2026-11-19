<?php

namespace App\Http\Controllers;

use App\Enums\PaymentMethod;
use App\Models\Branch;
use App\Models\CashSession;
use App\Models\User;
use App\Queries\InventoryValuation;
use App\Queries\SalesReport;
use App\Support\Decimal;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportController extends Controller
{
    /** Máximo de días por consulta, para que el reporte no se vuelva pesado. */
    private const MAX_DAYS = 366;

    /**
     * Valor del inventario en bodega, a precio de compra y a precio de venta.
     */
    public function inventoryValue(Request $request): Response
    {
        $filters = $request->validate([
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
        ]);

        $valuation = new InventoryValuation($filters['branch_id'] ?? null);

        return Inertia::render('reports/inventory-value', [
            'totals' => $valuation->totals(),
            'byCategory' => $valuation->byCategory(),
            'products' => $valuation->products()
                ->with('category:id,name', 'unit:id,abbreviation')
                ->where('tracks_inventory', true)
                ->whereRaw('COALESCE(st.quantity, 0) > 0')
                ->orderByDesc('stock_cost_value')
                ->limit(500)
                ->get(),
            'branches' => Branch::orderBy('name')->get(['id', 'name']),
            'filters' => $filters,
        ]);
    }

    /**
     * Reporte de ventas por periodo: resumen, por día, forma de pago, cajero, producto y categoría.
     */
    public function sales(Request $request): Response
    {
        $report = $this->salesReport($request);

        return Inertia::render('reports/sales', [
            'summary' => $report->summary(),
            'byDay' => $report->byDay(),
            'byPaymentMethod' => array_map(
                fn ($r) => $r + ['label' => PaymentMethod::from($r['method'])->label()],
                $report->byPaymentMethod(),
            ),
            'byCashier' => $report->byCashier(),
            'byCategory' => $report->byCategory(),
            'topProducts' => $report->products(20),
            'filters' => [
                'from' => $report->from->toDateString(),
                'to' => $report->to->toDateString(),
                'branch_id' => $report->branchId,
                'user_id' => $report->userId,
            ],
            'branches' => Branch::orderBy('name')->get(['id', 'name']),
            'users' => User::orderBy('name')->get(['id', 'name']),
        ]);
    }

    /**
     * Exporta a CSV (abre directo en Excel): detalle de ventas o ventas por producto.
     */
    public function exportSales(Request $request): StreamedResponse
    {
        $report = $this->salesReport($request);
        $type = $request->query('type') === 'products' ? 'products' : 'sales';
        $label = $type === 'products' ? 'por-producto' : 'detalle';
        $filename = "ventas-{$label}-{$report->from->toDateString()}-al-{$report->to->toDateString()}.csv";

        return response()->streamDownload(function () use ($report, $type) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF"); // BOM para que Excel respete acentos

            if ($type === 'products') {
                fputcsv($out, ['Código', 'Producto', 'Cantidad', 'Importe', 'Costo', 'Utilidad']);
                foreach ($report->products(null) as $p) {
                    fputcsv($out, [$p['code'], $p['name'], $p['quantity'], $p['total'], $p['cost'], $p['profit']]);
                }
            } else {
                fputcsv($out, ['Folio', 'Fecha', 'Cajero', 'Cliente', 'Subtotal', 'Descuento', 'IVA', 'Total', 'Costo', 'Utilidad', 'Formas de pago']);

                $payments = DB::table('sale_payments')
                    ->joinSub($report->sales()->select('id'), 's', 's.id', '=', 'sale_payments.sale_id')
                    ->get(['sale_id', 'method'])
                    ->groupBy('sale_id')
                    ->map(fn ($rows) => $rows->map(fn ($r) => PaymentMethod::from($r->method)->label())->unique()->implode(' + '));

                $report->sales()
                    ->leftJoin('users', 'users.id', '=', 'sales.user_id')
                    ->leftJoin('customers', 'customers.id', '=', 'sales.customer_id')
                    ->orderBy('sales.id')
                    ->select('sales.*', 'users.name as user_name', 'customers.name as customer_name')
                    ->chunk(500, function ($sales) use ($out, $payments) {
                        foreach ($sales as $s) {
                            fputcsv($out, [
                                $s->folio, $s->created_at, $s->user_name, $s->customer_name ?? 'Público en general',
                                ...array_map(
                                    fn ($v) => Decimal::round((string) $v),
                                    [$s->subtotal, $s->discount, $s->tax, $s->total, $s->cost_total],
                                ),
                                Decimal::sub((string) $s->total, (string) $s->cost_total),
                                $payments[$s->id] ?? '',
                            ]);
                        }
                    });
            }

            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /**
     * Historial de cortes de caja con sus diferencias.
     */
    public function cashSessions(Request $request): Response
    {
        [$from, $to] = $this->period($request);

        $sessions = CashSession::query()
            ->with('cashRegister:id,name,branch_id', 'cashRegister.branch:id,name', 'user:id,name')
            ->whereBetween('opened_at', [$from->startOfDay(), $to->endOfDay()])
            ->latest('opened_at')
            ->paginate(50)
            ->withQueryString()
            ->through(fn (CashSession $s) => [
                'id' => $s->id,
                'register' => $s->cashRegister->name,
                'branch' => $s->cashRegister->branch->name,
                'user' => $s->user->name,
                'opened_at' => $s->opened_at,
                'closed_at' => $s->closed_at,
                'opening_amount' => (string) $s->opening_amount,
                'expected_amount' => $s->expected_amount !== null ? (string) $s->expected_amount : null,
                'counted_amount' => $s->counted_amount !== null ? (string) $s->counted_amount : null,
                'difference' => $s->difference !== null ? (string) $s->difference : null,
            ]);

        $closed = CashSession::query()->whereNotNull('closed_at')->whereBetween('opened_at', [$from->startOfDay(), $to->endOfDay()]);

        return Inertia::render('reports/cash-sessions', [
            'sessions' => $sessions,
            'totals' => [
                'shortage' => Decimal::round((string) (clone $closed)->where('difference', '<', 0)->sum('difference')),
                'surplus' => Decimal::round((string) (clone $closed)->where('difference', '>', 0)->sum('difference')),
                'with_difference' => (clone $closed)->where('difference', '!=', 0)->count(),
            ],
            'filters' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
        ]);
    }

    private function salesReport(Request $request): SalesReport
    {
        [$from, $to] = $this->period($request);

        $data = $request->validate([
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'user_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        return new SalesReport($from, $to, $data['branch_id'] ?? null, $data['user_id'] ?? null);
    }

    /**
     * Periodo pedido; por omisión, del día 1 del mes a hoy.
     *
     * @return array{0: CarbonImmutable, 1: CarbonImmutable}
     */
    private function period(Request $request): array
    {
        $data = $request->validate([
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
        ], attributes: ['from' => 'fecha inicial', 'to' => 'fecha final']);

        $to = isset($data['to']) ? CarbonImmutable::parse($data['to']) : CarbonImmutable::today();
        $from = isset($data['from']) ? CarbonImmutable::parse($data['from']) : $to->startOfMonth();

        if ($from->diffInDays($to) > self::MAX_DAYS) {
            $from = $to->subDays(self::MAX_DAYS);
        }

        return [$from, $to];
    }
}
