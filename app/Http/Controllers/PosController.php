<?php

namespace App\Http\Controllers;

use App\Actions\Inventory\RegisterInventoryMovement;
use App\Actions\Sales\CreateSale;
use App\Actions\Sales\SaleAdjustmentAuthorization;
use App\Enums\PaymentMethod;
use App\Models\Customer;
use App\Models\Product;
use App\Models\Stock;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class PosController extends Controller
{
    public function index(Request $request): Response|RedirectResponse
    {
        $session = $request->user()->openCashSession();

        if (! $session) {
            return to_route('cash.open');
        }

        return Inertia::render('pos/index', [
            'session' => [
                'id' => $session->id,
                'register' => $session->cashRegister->name,
                'opened_at' => $session->opened_at,
            ],
            'customers' => Customer::query()
                ->where('active', true)
                ->orderBy('name')
                ->limit(500)
                ->get(['id', 'name', 'credit_limit', 'balance'])
                ->map(fn (Customer $c) => [
                    'id' => $c->id,
                    'name' => $c->name,
                    'available_credit' => $c->availableCredit(),
                ]),
            'allowNegativeStock' => RegisterInventoryMovement::allowsNegativeStock(),
            'can' => [
                'discount' => $request->user()->can('sales.discount'),
                'credit' => $request->user()->can('customers.credit'),
            ],
        ]);
    }

    /**
     * Búsqueda para el punto de venta. Si el término coincide exacto con un código
     * de barras o SKU, ese producto va primero (lector de código de barras).
     */
    public function search(Request $request): JsonResponse
    {
        $term = trim((string) $request->query('q', ''));

        if ($term === '') {
            return response()->json([]);
        }

        $branchId = $request->user()->openCashSession()?->cashRegister->branch_id
            ?? $request->user()->branch_id;

        $products = Product::query()
            ->active()
            ->search($term)
            ->with('unit:id,abbreviation,allows_decimals')
            ->orderByRaw('CASE WHEN barcode = ? OR sku = ? THEN 0 ELSE 1 END', [$term, $term])
            ->orderBy('name')
            ->limit(20)
            ->get();

        $stock = Stock::query()
            ->whereIn('product_id', $products->pluck('id'))
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->pluck('quantity', 'product_id');

        return response()->json($products->map(fn (Product $p) => [
            'id' => $p->id,
            'name' => $p->name,
            'barcode' => $p->barcode,
            'sku' => $p->sku,
            'price' => (string) $p->price,
            'wholesale_price' => $p->wholesale_price !== null ? (string) $p->wholesale_price : null,
            'wholesale_min_quantity' => $p->wholesale_min_quantity !== null ? (string) $p->wholesale_min_quantity : null,
            'tax_rate' => (string) $p->tax_rate,
            'price_includes_tax' => $p->price_includes_tax,
            'unit' => $p->unit->abbreviation,
            'allows_decimals' => $p->allowsDecimals(),
            'min_sale_quantity' => (string) $p->min_sale_quantity,
            'sale_step' => (string) $p->sale_step,
            'tracks_inventory' => $p->tracks_inventory,
            'stock' => (string) ($stock[$p->id] ?? '0'),
            'exact' => $p->barcode === $term || $p->sku === $term,
        ]));
    }

    /**
     * Un encargado autoriza, con su número y su clave, los descuentos y cambios de precio
     * que el cajero capturó. Regresa un pase de un solo uso para enviar al cobrar.
     */
    public function authorizeAdjustments(Request $request, SaleAdjustmentAuthorization $authorization): JsonResponse
    {
        $data = $request->validate([
            'employee_number' => ['required', 'string', 'max:20'],
            'pin' => ['required', 'string', 'max:6'],
            'adjustments' => ['required', 'array', 'min:1', 'max:500'],
            'adjustments.*.product_id' => ['required', 'integer'],
            'adjustments.*.unit_price' => ['nullable', 'numeric', 'min:0'],
            'adjustments.*.discount' => ['nullable', 'numeric', 'min:0'],
        ], attributes: ['employee_number' => 'número del encargado', 'pin' => 'clave']);

        return response()->json($authorization->grant(
            $request->user(),
            $data['employee_number'],
            $data['pin'],
            $data['adjustments'],
        ));
    }

    public function store(Request $request, CreateSale $createSale, SaleAdjustmentAuthorization $authorization): RedirectResponse
    {
        $data = $request->validate([
            'customer_id' => ['nullable', 'integer'],
            'items' => ['required', 'array', 'min:1', 'max:500'],
            'items.*.product_id' => ['required', 'integer'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0'],
            'items.*.discount' => ['nullable', 'numeric', 'min:0'],
            'items.*.unit_price' => ['nullable', 'numeric', 'min:0'],
            'payments' => ['required', 'array', 'min:1', 'max:10'],
            'payments.*.method' => ['required', Rule::enum(PaymentMethod::class)],
            'payments.*.amount' => ['required', 'numeric', 'gt:0'],
            'payments.*.reference' => ['nullable', 'string', 'max:100'],
            'authorization_token' => ['nullable', 'string', 'max:100'],
        ], [
            'items.required' => 'La venta no tiene productos.',
        ]);

        $user = $request->user();

        // Descuentos y cambios de precio: el encargado los hace directo; el cajero necesita autorización.
        $authorizedBy = null;
        if (SaleAdjustmentAuthorization::hasAdjustments($data['items'])) {
            $authorizedBy = $user->can('sales.discount')
                ? $user->id
                : $authorization->resolve($user, $data['authorization_token'] ?? null, $data['items']);
        }

        if (! $user->can('customers.credit') && collect($data['payments'])->contains('method', PaymentMethod::Credit->value)) {
            abort(403, 'No tienes permiso para vender a crédito.');
        }

        $session = $user->openCashSession();

        if (! $session) {
            return to_route('cash.open');
        }

        $sale = $createSale->handle(
            $user,
            $session,
            $data['items'],
            $data['payments'],
            $data['customer_id'] ?? null,
            $authorizedBy,
        );

        $authorization->consume($data['authorization_token'] ?? null);

        $cash = $sale->payments->firstWhere('method', PaymentMethod::Cash);

        Inertia::flash('sale', [
            'id' => $sale->id,
            'folio' => $sale->folio,
            'total' => (string) $sale->total,
            'change' => $cash ? (string) $cash->change : '0.00',
        ]);

        return to_route('pos.index');
    }
}
