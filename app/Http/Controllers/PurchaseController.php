<?php

namespace App\Http\Controllers;

use App\Actions\Purchases\CancelPurchase;
use App\Actions\Purchases\ReceivePurchase;
use App\Models\Purchase;
use App\Models\Supplier;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class PurchaseController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = $request->validate([
            'supplier_id' => ['nullable', 'integer'],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d'],
        ]);

        return Inertia::render('purchases/index', [
            'purchases' => Purchase::query()
                ->with('supplier:id,name', 'user:id,name')
                ->withCount('items')
                ->when($filters['supplier_id'] ?? null, fn ($q, $id) => $q->where('supplier_id', $id))
                ->when($filters['from'] ?? null, fn ($q, $d) => $q->whereDate('created_at', '>=', $d))
                ->when($filters['to'] ?? null, fn ($q, $d) => $q->whereDate('created_at', '<=', $d))
                ->latest('id')
                ->paginate(30)
                ->withQueryString(),
            'suppliers' => Supplier::orderBy('name')->get(['id', 'name']),
            'filters' => $filters,
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('purchases/create', [
            'suppliers' => Supplier::where('active', true)->orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function store(Request $request, ReceivePurchase $receive): RedirectResponse
    {
        $data = $request->validate([
            'supplier_id' => ['nullable', Rule::exists('suppliers', 'id')->whereNull('deleted_at')],
            'invoice_number' => ['nullable', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'update_costs' => ['boolean'],
            'items' => ['required', 'array', 'min:1', 'max:500'],
            'items.*.product_id' => ['required', 'integer', 'distinct', 'exists:products,id'],
            'items.*.quantity' => ['required', 'numeric', 'gt:0'],
            'items.*.cost' => ['required', 'numeric', 'min:0'],
        ], [
            'items.required' => 'Agrega al menos un producto.',
            'items.*.product_id.distinct' => 'Hay productos repetidos.',
        ], [
            'items.*.quantity' => 'cantidad',
            'items.*.cost' => 'costo',
            'invoice_number' => 'factura',
        ]);

        $user = $request->user();

        $purchase = $receive->handle($user, $user->currentBranchId(), $data['items'], $data);

        Inertia::flash('toast', ['type' => 'success', 'message' => "Compra #{$purchase->id} registrada. Inventario actualizado."]);

        return to_route('purchases.show', $purchase);
    }

    public function show(Purchase $purchase): Response
    {
        $purchase->load('supplier:id,name', 'user:id,name', 'branch:id,name', 'items.product:id,name,sku,barcode,unit_id', 'items.product.unit:id,abbreviation');

        return Inertia::render('purchases/show', ['purchase' => $purchase]);
    }

    public function cancel(Request $request, Purchase $purchase, CancelPurchase $cancel): RedirectResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'max:255']], attributes: ['reason' => 'motivo']);

        $cancel->handle($purchase, $request->user(), $data['reason']);

        Inertia::flash('toast', ['type' => 'success', 'message' => 'Compra cancelada; se retiró la mercancía del inventario.']);

        return back();
    }
}
