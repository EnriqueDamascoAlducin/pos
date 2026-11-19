<?php

namespace App\Queries;

use App\Models\Product;
use App\Models\Stock;
use App\Support\Decimal;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Support\Facades\DB;

/**
 * Valor del inventario en bodega:
 *   valor a costo = existencia × precio de compra
 *   valor a venta = existencia × precio de venta
 *
 * Ej.: 3 piezas, compra $30, venta $40 → $90 a costo y $120 a venta.
 */
class InventoryValuation
{
    public function __construct(private ?int $branchId = null) {}

    /**
     * Productos con columnas calculadas: stock, stock_cost_value, stock_sale_value, stock_profit.
     *
     * @return Builder<Product>
     */
    public function products(): Builder
    {
        return Product::query()
            ->leftJoinSub($this->stockTotals(), 'st', 'st.product_id', '=', 'products.id')
            ->select('products.*')
            ->selectRaw('COALESCE(st.quantity, 0) as stock')
            ->selectRaw('ROUND(COALESCE(st.quantity, 0) * products.cost, 2) as stock_cost_value')
            ->selectRaw('ROUND(COALESCE(st.quantity, 0) * products.price, 2) as stock_sale_value')
            ->selectRaw('ROUND(COALESCE(st.quantity, 0) * (products.price - products.cost), 2) as stock_profit');
    }

    /**
     * Totales de todo el inventario (solo productos que llevan inventario y existencia positiva).
     *
     * @return array{products: int, units: string, cost_value: string, sale_value: string, profit: string}
     */
    public function totals(): array
    {
        $row = $this->baseAggregate()->selectRaw(
            'COUNT(*) as products, SUM(st.quantity) as units, '.
            'SUM(st.quantity * products.cost) as cost_value, SUM(st.quantity * products.price) as sale_value'
        )->first();

        return $this->formatTotals($row);
    }

    /**
     * Totales agrupados por categoría.
     *
     * @return list<array{category: string, products: int, units: string, cost_value: string, sale_value: string, profit: string}>
     */
    public function byCategory(): array
    {
        return $this->baseAggregate()
            ->leftJoin('categories', 'categories.id', '=', 'products.category_id')
            ->selectRaw(
                "COALESCE(categories.name, 'Sin categoría') as category, COUNT(*) as products, SUM(st.quantity) as units, ".
                'SUM(st.quantity * products.cost) as cost_value, SUM(st.quantity * products.price) as sale_value'
            )
            ->groupBy('categories.name')
            ->orderByDesc('cost_value')
            ->get()
            ->map(fn ($row) => ['category' => $row->category] + $this->formatTotals($row))
            ->all();
    }

    private function stockTotals(): QueryBuilder
    {
        return Stock::query()
            ->toBase()
            ->when($this->branchId, fn ($q) => $q->where('branch_id', $this->branchId))
            ->selectRaw('product_id, SUM(quantity) as quantity')
            ->groupBy('product_id');
    }

    private function baseAggregate(): QueryBuilder
    {
        return DB::table('products')
            ->joinSub($this->stockTotals(), 'st', 'st.product_id', '=', 'products.id')
            ->whereNull('products.deleted_at')
            ->where('products.tracks_inventory', true)
            ->where('st.quantity', '>', 0);
    }

    /**
     * @return array{products: int, units: string, cost_value: string, sale_value: string, profit: string}
     */
    private function formatTotals(?object $row): array
    {
        $cost = Decimal::round((string) ($row->cost_value ?? 0));
        $sale = Decimal::round((string) ($row->sale_value ?? 0));

        return [
            'products' => (int) ($row->products ?? 0),
            'units' => Decimal::round((string) ($row->units ?? 0), 3),
            'cost_value' => $cost,
            'sale_value' => $sale,
            'profit' => Decimal::sub($sale, $cost),
        ];
    }
}
