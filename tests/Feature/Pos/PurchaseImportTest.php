<?php

use App\Models\Product;
use App\Models\Purchase;
use App\Models\Stock;
use App\Models\Supplier;
use App\Models\Unit;
use App\Models\User;
use App\Support\Cfdi\CfdiInvoice;
use Database\Seeders\BaseDataSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;

beforeEach(function () {
    $this->seed([RolesAndPermissionsSeeder::class, BaseDataSeeder::class]);

    $this->manager = User::factory()->create();
    $this->manager->assignRole('encargado');

    $this->xml = file_get_contents(base_path('tests/Fixtures/cfdi/factura-refacciones.xml'));
    $this->pza = Unit::where('abbreviation', 'pza')->first();
});

function uploadXml($test, string $xml)
{
    return $test->actingAs($test->manager)->post(route('purchases.import.upload'), [
        'file' => UploadedFile::fake()->createWithContent('factura.xml', $xml),
    ]);
}

function tokenFrom($response): string
{
    return basename(parse_url($response->headers->get('Location'), PHP_URL_PATH));
}

it('lee la factura XML: proveedor, folio, UUID y conceptos con costo con IVA', function () {
    $invoice = CfdiInvoice::parse($this->xml);

    expect($invoice->type)->toBe('I')
        ->and($invoice->invoiceNumber())->toBe('FS 028040')
        ->and($invoice->uuid)->toBe('330036AC-D04D-4807-B23B-0B4AEEF306FB')
        ->and($invoice->issuerRfc)->toBe('AAA010101AAA')
        ->and($invoice->total)->toBe('9960.80')
        ->and($invoice->concepts)->toHaveCount(2)
        ->and($invoice->concepts[0])->toMatchArray([
            'sku' => 'F10010201',
            'quantity' => '80.000',
            'unit_code' => 'H87',
            'tax_rate' => '0.16',
            'unit_cost' => '74.70', // 64.3966 + 16% IVA
        ])
        ->and($invoice->concepts[1]['unit_cost'])->toBe('49.81');
});

it('importa la factura: crea proveedor y productos y suma la existencia', function () {
    $upload = uploadXml($this, $this->xml)->assertRedirect();
    $token = tokenFrom($upload);

    $this->get(route('purchases.import.show', $token))->assertInertia(fn ($page) => $page
        ->component('purchases/import-review')
        ->where('invoice.number', 'FS 028040')
        ->where('supplier', null)
        ->has('rows', 2)
        ->where('rows.0.product', null)
        ->where('rows.0.suggested_unit_id', $this->pza->id));

    $this->post(route('purchases.import.store', $token), [
        'rows' => [
            0 => ['include' => true, 'price' => '120', 'unit_id' => $this->pza->id],
            1 => ['include' => true, 'name' => 'Espejos DT125 (juego)', 'price' => '85', 'unit_id' => $this->pza->id],
        ],
    ])->assertSessionHasNoErrors()->assertRedirect();

    $purchase = Purchase::with('items')->firstOrFail();
    $mirror = Product::where('sku', 'F10010201')->firstOrFail();
    $dt125 = Product::where('sku', 'F10010195')->firstOrFail();

    expect($purchase->invoice_number)->toBe('FS 028040')
        ->and($purchase->invoice_uuid)->toBe('330036AC-D04D-4807-B23B-0B4AEEF306FB')
        ->and((string) $purchase->total)->toBe('9960.80') // igual al total de la factura
        ->and($purchase->supplier->rfc)->toBe('AAA010101AAA')
        ->and((string) $mirror->cost)->toBe('74.70')
        ->and((string) $mirror->price)->toBe('120.00')
        ->and($dt125->name)->toBe('Espejos DT125 (juego)')
        ->and((string) Stock::where('product_id', $mirror->id)->value('quantity'))->toBe('80.000')
        ->and((string) Stock::where('product_id', $dt125->id)->value('quantity'))->toBe('80.000');
});

it('reconoce productos existentes por SKU y al proveedor por RFC', function () {
    $supplier = Supplier::create(['name' => 'Mi proveedor', 'rfc' => 'AAA010101AAA']);
    $existing = Product::create(['unit_id' => $this->pza->id, 'sku' => 'F10010201', 'name' => 'Espejos 150Z', 'cost' => 70, 'price' => 110]);

    $token = tokenFrom(uploadXml($this, $this->xml));

    $this->get(route('purchases.import.show', $token))->assertInertia(fn ($page) => $page
        ->where('supplier.id', $supplier->id)
        ->where('rows.0.product.id', $existing->id));

    // Solo el producto existente; el otro se deja fuera.
    $this->post(route('purchases.import.store', $token), [
        'rows' => [0 => ['include' => true], 1 => ['include' => false]],
    ])->assertSessionHasNoErrors();

    expect(Product::count())->toBe(1)
        ->and((string) $existing->fresh()->cost)->toBe('74.70')
        ->and((string) $existing->fresh()->price)->toBe('110.00')
        ->and(Purchase::first()->supplier_id)->toBe($supplier->id)
        ->and(Purchase::first()->items)->toHaveCount(1);
});

it('no permite importar la misma factura dos veces', function () {
    $token = tokenFrom(uploadXml($this, $this->xml));
    $this->post(route('purchases.import.store', $token), [
        'rows' => [
            0 => ['include' => true, 'price' => '120', 'unit_id' => $this->pza->id],
            1 => ['include' => true, 'price' => '85', 'unit_id' => $this->pza->id],
        ],
    ]);

    uploadXml($this, $this->xml)->assertSessionHasErrors(['file' => 'Esta factura ya se registró en la compra #1.']);
});

it('pide precio de venta para los productos nuevos', function () {
    $token = tokenFrom(uploadXml($this, $this->xml));

    $this->post(route('purchases.import.store', $token), [
        'rows' => [0 => ['include' => true, 'unit_id' => $this->pza->id], 1 => ['include' => false]],
    ])->assertSessionHasErrors('rows.0.price');

    expect(Purchase::count())->toBe(0)->and(Product::count())->toBe(0);
});

it('rechaza archivos que no son factura de compra', function () {
    uploadXml($this, '<root><hola/></root>')->assertSessionHasErrors('file');
    uploadXml($this, 'esto no es xml')->assertSessionHasErrors('file');

    $creditNote = str_replace('TipoDeComprobante="I"', 'TipoDeComprobante="E"', $this->xml);
    uploadXml($this, $creditNote)->assertSessionHasErrors('file');

    expect(fn () => CfdiInvoice::parse(''))->toThrow(ValidationException::class);
});

it('el cajero no puede importar facturas', function () {
    $cashier = User::factory()->create();
    $cashier->assignRole('cajero');

    $this->actingAs($cashier)->get(route('purchases.import.create'))->assertForbidden();
});
