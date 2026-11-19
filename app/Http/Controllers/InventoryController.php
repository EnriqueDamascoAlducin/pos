<?php

namespace App\Http\Controllers;

use App\Actions\Inventory\AdjustInventory;
use App\Models\Category;
use App\Models\Product;
use App\Models\Stock;
use App\Queries\InventoryValuation;
use App\Support\Decimal;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class InventoryController extends Controller
{
    /**
     * Existencias de la sucursal, con filtro de productos bajo el mínimo.
     */
    public function index(Request $request): Response
    {
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'category_id' => ['nullable', 'integer'],
            'low' => ['nullable', 'boolean'],
        ]);

        $branchId = $request->user()->currentBranchId();

        $products = (new InventoryValuation($branchId))->products()
            ->with('category:id,name', 'unit:id,abbreviation,allows_decimals')
            ->where('tracks_inventory', true)
            ->where('active', true)
            ->search($filters['search'] ?? null)
            ->when($filters['category_id'] ?? null, fn ($q, $id) => $q->where('category_id', $id))
            ->when($filters['low'] ?? false, fn ($q) => $q->whereRaw('COALESCE(st.quantity, 0) <= products.min_stock'))
            ->orderBy('name')
            ->paginate(50)
            ->withQueryString();

        return Inertia::render('inventory/index', [
            'products' => $products,
            'lowStockCount' => self::lowStockCount($branchId),
            'categories' => Category::orderBy('name')->get(['id', 'name']),
            'filters' => $filters,
        ]);
    }

    public function adjust(Request $request, Product $product, AdjustInventory $adjust): RedirectResponse
    {
        $data = $request->validate([
            'mode' => ['required', Rule::in([AdjustInventory::MODE_COUNT, AdjustInventory::MODE_IN, AdjustInventory::MODE_OUT])],
            'quantity' => ['required', 'numeric', 'min:0'],
            'reason' => ['required', 'string', 'max:255'],
        ], attributes: ['quantity' => 'cantidad', 'reason' => 'motivo']);

        $movement = $adjust->handle(
            $product,
            $request->user()->currentBranchId(),
            $request->user(),
            $data['mode'],
            (string) $data['quantity'],
            $data['reason'],
        );

        Inertia::flash('toast', [
            'type' => 'success',
            'message' => $movement
                ? "Inventario de \"{$product->name}\" ajustado. Nueva existencia: ".(float) $movement->balance
                : 'El conteo coincide con el sistema; no hubo ajuste.',
        ]);

        return back();
    }

    /**
     * Kardex: historial de entradas y salidas de un producto.
     */
    public function kardex(Request $request, Product $product): Response
    {
        $branchId = $request->user()->currentBranchId();

        $product->load('unit:id,abbreviation', 'category:id,name');

        return Inertia::render('inventory/kardex', [
            'product' => $product,
            'stock' => (string) (Stock::where('product_id', $product->id)->where('branch_id', $branchId)->value('quantity') ?? '0'),
            'movements' => $product->movements()
                ->where('branch_id', $branchId)
                ->with('user:id,name')
                ->latest('id')
                ->paginate(50)
                ->through(fn ($m) => [
                    'id' => $m->id,
                    'type' => $m->type->value,
                    'quantity' => (string) $m->quantity,
                    'balance' => (string) $m->balance,
                    'cost' => (string) $m->cost,
                    'notes' => $m->notes,
                    'user' => $m->user?->name,
                    'reference_type' => $m->reference_type ? class_basename($m->reference_type) : null,
                    'reference_id' => $m->reference_id,
                    'created_at' => $m->created_at,
                ]),
        ]);
    }

    /**
     * Búsqueda de productos para compras y ajustes (incluye costo y existencia).
     */
    public function search(Request $request): JsonResponse
    {
        abort_unless($request->user()->canAny(['purchases.manage', 'inventory.adjust']), 403);

        $term = trim((string) $request->query('q', ''));

        if ($term === '') {
            return response()->json([]);
        }

        $products = (new InventoryValuation($request->user()->currentBranchId()))->products()
            ->with('unit:id,abbreviation,allows_decimals')
            ->search($term)
            ->orderByRaw('CASE WHEN barcode = ? OR sku = ? THEN 0 ELSE 1 END', [$term, $term])
            ->orderBy('name')
            ->limit(20)
            ->get();

        return response()->json($products->map(fn (Product $p) => [
            'id' => $p->id,
            'name' => $p->name,
            'barcode' => $p->barcode,
            'sku' => $p->sku,
            'cost' => (string) $p->cost,
            'price' => (string) $p->price,
            'unit' => $p->unit->abbreviation,
            'allows_decimals' => $p->unit->allows_decimals || $p->sells_by_weight,
            'stock' => Decimal::round((string) $p->stock, 3),
            'exact' => $p->barcode === $term || $p->sku === $term,
        ]));
    }

    public static function lowStockCount(int $branchId): int
    {
        return (new InventoryValuation($branchId))->products()
            ->where('tracks_inventory', true)
            ->where('active', true)
            ->whereRaw('COALESCE(st.quantity, 0) <= products.min_stock')
            ->count();
    }
}
