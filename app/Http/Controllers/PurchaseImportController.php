<?php

namespace App\Http\Controllers;

use App\Actions\Purchases\ImportCfdiPurchase;
use App\Models\Category;
use App\Models\Setting;
use App\Models\Unit;
use App\Support\Cfdi\CfdiInvoice;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Compras → Importar factura (XML): subir el CFDI, revisar los productos y confirmar.
 */
class PurchaseImportController extends Controller
{
    private const TTL_MINUTES = 120;

    public function create(): Response
    {
        return Inertia::render('purchases/import');
    }

    public function upload(Request $request, ImportCfdiPurchase $import): RedirectResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'max:2048', 'extensions:xml'],
        ], attributes: ['file' => 'archivo XML']);

        $xml = (string) file_get_contents($request->file('file')->getRealPath());
        $invoice = CfdiInvoice::parse($xml);
        $import->ensureImportable($invoice);

        $token = Str::random(32);
        Cache::put($this->cacheKey($token), ['user_id' => $request->user()->id, 'xml' => $xml], now()->addMinutes(self::TTL_MINUTES));

        return to_route('purchases.import.show', $token);
    }

    public function show(Request $request, string $token, ImportCfdiPurchase $import): Response|RedirectResponse
    {
        $invoice = $this->invoiceFor($request, $token);

        if (! $invoice) {
            return to_route('purchases.import.create');
        }

        $businessRfc = strtoupper((string) Setting::get('business_rfc'));

        return Inertia::render('purchases/import-review', [
            'token' => $token,
            ...$import->preview($invoice),
            // Aviso si la factura no viene a nombre de este negocio.
            'receiverMismatch' => $businessRfc !== '' && $invoice->receiverRfc && $invoice->receiverRfc !== $businessRfc,
            'units' => Unit::active()->orderBy('name')->get(['id', 'name', 'abbreviation', 'allows_decimals']),
            'categories' => Category::orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function store(Request $request, string $token, ImportCfdiPurchase $import): RedirectResponse
    {
        $invoice = $this->invoiceFor($request, $token);

        if (! $invoice) {
            return to_route('purchases.import.create');
        }

        $request->merge(['update_costs' => $request->boolean('update_costs', true)]);

        $data = $request->validate([
            'update_costs' => ['boolean'],
            'rows' => ['required', 'array'],
            'rows.*.include' => ['boolean'],
            'rows.*.name' => ['nullable', 'string', 'max:255'],
            'rows.*.price' => ['nullable', 'numeric', 'min:0'],
            'rows.*.unit_id' => ['nullable', 'integer'],
            'rows.*.category_id' => ['nullable', 'integer', 'exists:categories,id'],
        ]);

        $purchase = $import->import(
            $request->user(),
            $request->user()->currentBranchId(),
            $invoice,
            $data['rows'],
            $data['update_costs'],
        );

        Cache::forget($this->cacheKey($token));

        Inertia::flash('toast', [
            'type' => 'success',
            'message' => "Factura {$purchase->invoice_number} importada: {$purchase->items()->count()} productos sumados al inventario.",
        ]);

        return to_route('purchases.show', $purchase);
    }

    /**
     * La factura subida por ESTE usuario (se guarda en caché mientras la revisa).
     */
    private function invoiceFor(Request $request, string $token): ?CfdiInvoice
    {
        $cached = Cache::get($this->cacheKey($token));

        if (! $cached || $cached['user_id'] !== $request->user()->id) {
            return null;
        }

        return CfdiInvoice::parse($cached['xml']);
    }

    private function cacheKey(string $token): string
    {
        return "cfdi-import:{$token}";
    }
}
