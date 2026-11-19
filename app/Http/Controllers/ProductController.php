<?php

namespace App\Http\Controllers;

use App\Actions\Inventory\RegisterInventoryMovement;
use App\Enums\InventoryMovementType;
use App\Http\Requests\ProductRequest;
use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\Setting;
use App\Models\Unit;
use App\Queries\InventoryValuation;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class ProductController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'category_id' => ['nullable', 'integer'],
        ]);

        $valuation = new InventoryValuation;

        $products = $valuation->products()
            ->with('category:id,name', 'unit:id,abbreviation')
            ->search($filters['search'] ?? null)
            ->when($filters['category_id'] ?? null, fn ($q, $id) => $q->where('category_id', $id))
            ->orderBy('name')
            ->paginate(25)
            ->withQueryString();

        return Inertia::render('products/index', [
            'products' => $products,
            'totals' => $valuation->totals(),
            'categories' => Category::orderBy('name')->get(['id', 'name']),
            'filters' => $filters,
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('products/create', $this->formOptions());
    }

    public function store(ProductRequest $request, RegisterInventoryMovement $inventory): RedirectResponse
    {
        DB::transaction(function () use ($request, $inventory) {
            $product = Product::create(Arr::except($request->validated(), 'initial_stock'));

            $initial = (string) ($request->validated('initial_stock') ?? '0');
            if (bccomp($initial, '0', 3) === 1) {
                $inventory->handle(
                    product: $product,
                    branchId: $request->user()->branch_id ?? Branch::query()->value('id'),
                    type: InventoryMovementType::Adjustment,
                    quantity: $initial,
                    user: $request->user(),
                    reference: $product,
                    notes: 'Inventario inicial',
                );
            }
        });

        Inertia::flash('toast', ['type' => 'success', 'message' => 'Producto registrado.']);

        return to_route('products.index');
    }

    public function edit(Product $product): Response
    {
        return Inertia::render('products/edit', [
            'product' => (new InventoryValuation)->products()->whereKey($product->id)->firstOrFail(),
            ...$this->formOptions($product->unit_id),
        ]);
    }

    public function update(ProductRequest $request, Product $product): RedirectResponse
    {
        $product->update($request->validated());

        Inertia::flash('toast', ['type' => 'success', 'message' => 'Producto actualizado.']);

        return to_route('products.index');
    }

    public function destroy(Product $product): RedirectResponse
    {
        $product->delete();

        Inertia::flash('toast', ['type' => 'success', 'message' => 'Producto eliminado.']);

        return to_route('products.index');
    }

    /**
     * @return array<string, mixed>
     */
    private function formOptions(?int $currentUnitId = null): array
    {
        return [
            'categories' => Category::orderBy('name')->get(['id', 'name']),
            // Solo las unidades activas del negocio (más la que ya tenga el producto, aunque esté desactivada).
            'units' => Unit::query()
                ->where(fn ($q) => $q->where('active', true)->when($currentUnitId, fn ($q, $id) => $q->orWhere('id', $id)))
                ->orderBy('name')
                ->get(['id', 'name', 'abbreviation', 'allows_decimals']),
            'defaultTaxRate' => (string) (float) Setting::get('default_tax_rate', '0.16'),
        ];
    }
}
