<?php

namespace App\Actions\Purchases;

use App\Models\Product;
use App\Models\Purchase;
use App\Models\Supplier;
use App\Models\Unit;
use App\Models\User;
use App\Support\Cfdi\CfdiInvoice;
use App\Support\Decimal;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Registra una compra a partir de la factura XML (CFDI) del proveedor:
 * reconoce o da de alta al proveedor por su RFC, reconoce los productos por su SKU
 * (o código de barras), crea los que no existan y suma la mercancía al inventario.
 */
class ImportCfdiPurchase
{
    /** Clave de unidad del SAT → abreviatura de unidad del sistema. */
    private const SAT_UNITS = [
        'H87' => 'pza', 'EA' => 'pza', 'C62' => 'pza', 'XPK' => 'pza',
        'XBX' => 'cja', 'XCT' => 'cja',
        'KGM' => 'kg', 'LTR' => 'l', 'MTR' => 'm',
        'E48' => 'srv', 'ACT' => 'srv',
        'KT' => 'jgo', 'SET' => 'jgo', 'PR' => 'par',
    ];

    public function __construct(private ReceivePurchase $receive) {}

    /**
     * Revisa que la factura se pueda importar (tipo, moneda, que no esté repetida).
     */
    public function ensureImportable(CfdiInvoice $invoice): void
    {
        if ($invoice->type !== 'I') {
            throw ValidationException::withMessages([
                'file' => 'Solo se importan facturas de compra (tipo Ingreso). Este XML es de otro tipo (nota de crédito, pago o traslado).',
            ]);
        }

        if ($invoice->currency !== 'MXN') {
            throw ValidationException::withMessages(['file' => "La factura está en {$invoice->currency}; solo se importan facturas en pesos (MXN)."]);
        }

        if ($invoice->uuid && Purchase::where('invoice_uuid', $invoice->uuid)->exists()) {
            $purchase = Purchase::where('invoice_uuid', $invoice->uuid)->first();

            throw ValidationException::withMessages([
                'file' => "Esta factura ya se registró en la compra #{$purchase->id}.",
            ]);
        }
    }

    /**
     * Vista previa: cada concepto con el producto que le corresponde (o una propuesta para darlo de alta).
     *
     * @return array<string, mixed>
     */
    public function preview(CfdiInvoice $invoice): array
    {
        $units = Unit::active()->orderBy('name')->get();

        $rows = [];
        foreach ($invoice->concepts as $i => $concept) {
            $product = $this->findProduct($concept['sku']);

            $rows[] = [
                'index' => $i,
                ...$concept,
                'product' => $product ? [
                    'id' => $product->id,
                    'name' => $product->name,
                    'sku' => $product->sku,
                    'cost' => (string) $product->cost,
                    'price' => (string) $product->price,
                    'unit' => $product->unit?->abbreviation,
                    'trashed' => $product->trashed(),
                ] : null,
                'suggested_unit_id' => $this->suggestUnit($concept['unit_code'], $units)?->id,
            ];
        }

        return [
            'invoice' => [
                'uuid' => $invoice->uuid,
                'number' => $invoice->invoiceNumber(),
                'date' => $invoice->date,
                'issuer_rfc' => $invoice->issuerRfc,
                'issuer_name' => $invoice->issuerName,
                'receiver_rfc' => $invoice->receiverRfc,
                'total' => $invoice->total,
            ],
            'supplier' => Supplier::where('rfc', $invoice->issuerRfc)->first(['id', 'name']),
            'rows' => $rows,
        ];
    }

    /**
     * @param  array<int, array{include?: bool, name?: string|null, price?: string|float|null, unit_id?: int|null, category_id?: int|null}>  $decisions  por índice de concepto
     */
    public function import(User $user, int $branchId, CfdiInvoice $invoice, array $decisions, bool $updateCosts = true): Purchase
    {
        $this->ensureImportable($invoice);

        return DB::transaction(function () use ($user, $branchId, $invoice, $decisions, $updateCosts) {
            $supplier = Supplier::withTrashed()->firstOrCreate(
                ['rfc' => $invoice->issuerRfc],
                ['name' => mb_substr($invoice->issuerName, 0, 255)],
            );
            if ($supplier->trashed()) {
                $supplier->restore();
            }

            $items = [];
            $created = []; // SKU => producto creado en esta misma factura

            foreach ($invoice->concepts as $i => $concept) {
                $decision = $decisions[$i] ?? [];

                if (! ($decision['include'] ?? true)) {
                    continue;
                }

                if (! Decimal::gt($concept['quantity'], '0')) {
                    continue;
                }

                $product = ($concept['sku'] ? ($created[$concept['sku']] ?? null) : null)
                    ?? $this->findProduct($concept['sku']);

                if ($product?->trashed()) {
                    $product->restore();
                }

                if (! $product) {
                    $product = $this->createProduct($concept, $decision, $i);

                    if ($concept['sku']) {
                        $created[$concept['sku']] = $product;
                    }
                }

                $items[] = [
                    'product_id' => $product->id,
                    'quantity' => $concept['quantity'],
                    'cost' => $concept['unit_cost'],
                ];
            }

            if ($items === []) {
                throw ValidationException::withMessages(['rows' => 'No seleccionaste ningún producto para importar.']);
            }

            return $this->receive->handle($user, $branchId, $items, [
                'supplier_id' => $supplier->id,
                'invoice_number' => $invoice->invoiceNumber(),
                'invoice_uuid' => $invoice->uuid,
                'notes' => 'Importada de factura XML'.($invoice->uuid ? " (UUID {$invoice->uuid})" : ''),
                'update_costs' => $updateCosts,
            ]);
        });
    }

    /**
     * @param  array<string, mixed>  $concept
     * @param  array<string, mixed>  $decision
     */
    private function createProduct(array $concept, array $decision, int $i): Product
    {
        $price = $decision['price'] ?? null;
        $unitId = $decision['unit_id'] ?? null;

        if ($price === null || $price === '' || ! Decimal::gt((string) $price, '0')) {
            throw ValidationException::withMessages(["rows.$i.price" => "Falta el precio de venta de \"{$concept['description']}\"."]);
        }

        $unit = $unitId ? Unit::active()->find($unitId) : null;
        if (! $unit) {
            throw ValidationException::withMessages(["rows.$i.unit_id" => "Elige la unidad de \"{$concept['description']}\"."]);
        }

        $decimals = (bool) $unit->allows_decimals;

        return Product::create([
            'sku' => $concept['sku'],
            'name' => mb_substr(trim((string) ($decision['name'] ?? '')) ?: $concept['description'], 0, 255),
            'category_id' => $decision['category_id'] ?? null,
            'unit_id' => $unit->id,
            'cost' => $concept['unit_cost'],
            'price' => Decimal::round((string) $price),
            'tax_rate' => in_array($concept['tax_rate'], ['0', '0.08', '0.16'], true) ? $concept['tax_rate'] : '0.16',
            'price_includes_tax' => true,
            'sells_by_weight' => $decimals,
            'min_sale_quantity' => $decimals ? '0.1' : '1',
            'sale_step' => $decimals ? '0.001' : '1',
        ]);
    }

    private function findProduct(?string $sku): ?Product
    {
        if (! $sku) {
            return null;
        }

        return Product::withTrashed()
            ->with('unit:id,abbreviation')
            ->where(fn ($q) => $q->where('sku', $sku)->orWhere('barcode', $sku))
            ->orderByRaw('deleted_at IS NOT NULL')
            ->first();
    }

    /**
     * @param  Collection<int, Unit>  $units
     */
    private function suggestUnit(?string $satCode, $units): ?Unit
    {
        $abbreviation = self::SAT_UNITS[strtoupper((string) $satCode)] ?? 'pza';

        return $units->firstWhere('abbreviation', $abbreviation)
            ?? $units->firstWhere('abbreviation', 'pza')
            ?? $units->firstWhere('allows_decimals', false)
            ?? $units->first();
    }
}
