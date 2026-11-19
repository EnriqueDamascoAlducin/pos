<?php

use App\Actions\Products\ImportProducts;
use App\Models\Branch;
use App\Models\Category;
use App\Models\Product;
use App\Models\Stock;
use App\Models\Unit;
use App\Models\User;
use Database\Seeders\BaseDataSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

beforeEach(function () {
    $this->seed([RolesAndPermissionsSeeder::class, BaseDataSeeder::class]);

    $this->admin = User::factory()->create(['branch_id' => Branch::first()->id]);
    $this->admin->assignRole('admin');
});

function csvFile(string $content, string $name = 'productos.csv'): UploadedFile
{
    return UploadedFile::fake()->createWithContent($name, $content);
}

function tempCsv(string $content): string
{
    $path = tempnam(sys_get_temp_dir(), 'csv');
    file_put_contents($path, $content);

    return $path;
}

function stockOfSku(string $sku): string
{
    $product = Product::where('sku', $sku)->firstOrFail();

    return (string) Stock::where('product_id', $product->id)->value('quantity');
}

it('importa productos nuevos con categoría, unidad y existencia inicial en el kardex', function () {
    $csv = <<<'CSV'
    codigo_barras,sku,nombre,categoria,unidad,precio_compra,precio_venta,existencia
    7501234567890,F02030341,Cadena de tracción 428H,Transmisión,pza,90,124.10,40
    ,BUJ-01,Bujía NGK,Encendido,Pieza,"$1,050.50","$1,500.00",12
    CSV;

    $path = tempCsv($csv);
    $preview = app(ImportProducts::class)->parse($path);

    expect($preview['stats'])->toMatchArray(['create' => 2, 'update' => 0, 'errors' => 0, 'new_categories' => 2]);

    $result = app(ImportProducts::class)->import($path, $this->admin, Branch::first()->id);

    expect($result)->toMatchArray(['created' => 2, 'updated' => 0, 'skipped' => 0, 'stock_movements' => 2]);

    $chain = Product::where('sku', 'F02030341')->firstOrFail();
    expect($chain->barcode)->toBe('7501234567890')
        ->and((string) $chain->cost)->toBe('90.00')
        ->and((string) $chain->price)->toBe('124.10')
        ->and($chain->category->name)->toBe('Transmisión')
        ->and($chain->unit->abbreviation)->toBe('pza')
        ->and((string) $chain->tax_rate)->toBe('0.1600')
        ->and(stockOfSku('F02030341'))->toBe('40.000');

    expect((string) Product::where('sku', 'BUJ-01')->first()->cost)->toBe('1050.50');

    $this->assertDatabaseHas('inventory_movements', [
        'product_id' => $chain->id,
        'type' => 'adjustment',
        'quantity' => 40,
        'notes' => 'Importación inicial (CSV)',
    ]);
});

it('lee archivos de Excel: punto y coma, encabezados con acentos y codificación Windows-1252', function () {
    $csv = "Código de barras;Descripción;Departamento;Costo;Precio;Existencia\r\n"
        ."111;Balata delantera;Frenos;150,50;220;3\r\n";

    $path = tempCsv(mb_convert_encoding($csv, 'Windows-1252', 'UTF-8'));
    app(ImportProducts::class)->import($path, $this->admin, Branch::first()->id);

    $product = Product::where('barcode', '111')->firstOrFail();

    expect($product->name)->toBe('Balata delantera')
        ->and($product->category->name)->toBe('Frenos')
        ->and((string) $product->cost)->toBe('150.50');
});

it('reporta errores por fila y solo importa las válidas', function () {
    $csv = <<<'CSV'
    sku,nombre,unidad,precio_compra,precio_venta,existencia
    A1,Correcto,pza,10,15,5
    A2,,pza,10,15,1
    A3,Sin precio,pza,10,,1
    A4,Unidad rara,cubetas,10,15,1
    A5,Pieza con decimal,pza,10,15,2.5
    A1,Repetido,pza,10,15,1
    A6,Precio raro,pza,abc,15,1
    CSV;

    $path = tempCsv($csv);
    $rows = collect(app(ImportProducts::class)->parse($path)['rows'])->keyBy('line');

    expect($rows[2]['action'])->toBe('create')
        ->and($rows[3]['errors'])->toContain('Falta el nombre.')
        ->and($rows[4]['errors'])->toContain('Falta el precio de venta.')
        ->and($rows[5]['errors'][0])->toContain('No existe la unidad "cubetas"')
        ->and($rows[6]['errors'][0])->toContain('tiene decimales')
        ->and($rows[7]['errors'])->toContain('SKU repetido en la fila 2.')
        ->and($rows[8]['errors'][0])->toContain('precio de compra "abc" no es un número válido');

    $result = app(ImportProducts::class)->import($path, $this->admin, Branch::first()->id);

    expect($result)->toMatchArray(['created' => 1, 'skipped' => 6])
        ->and(Product::count())->toBe(1);
});

it('actualiza productos que ya existen y solo ajusta su existencia si se pide', function () {
    $unit = Unit::where('abbreviation', 'pza')->first();
    $existing = Product::create(['unit_id' => $unit->id, 'sku' => 'F02030341', 'name' => 'Cadena vieja', 'cost' => 80, 'price' => 100, 'min_stock' => 3]);

    $csv = "sku,nombre,precio_compra,precio_venta,existencia\nF02030341,Cadena 428H,90,124.10,25\n";

    // Sin ajustar existencia
    app(ImportProducts::class)->import(tempCsv($csv), $this->admin, Branch::first()->id);

    $existing->refresh();
    expect($existing->name)->toBe('Cadena 428H')
        ->and((string) $existing->price)->toBe('124.10')
        ->and((string) $existing->min_stock)->toBe('3.000') // columna no incluida: no se toca
        ->and(Stock::where('product_id', $existing->id)->value('quantity'))->toBeNull();

    // Con ajuste: se registra como conteo físico
    $result = app(ImportProducts::class)->import(tempCsv($csv), $this->admin, Branch::first()->id, adjustExisting: true);

    expect($result)->toMatchArray(['created' => 0, 'updated' => 1, 'stock_movements' => 1])
        ->and(stockOfSku('F02030341'))->toBe('25.000');
});

it('detecta conflictos entre SKU y código de barras de productos distintos', function () {
    $unit = Unit::where('abbreviation', 'pza')->first();
    Product::create(['unit_id' => $unit->id, 'sku' => 'A', 'name' => 'Producto A', 'cost' => 1, 'price' => 2]);
    Product::create(['unit_id' => $unit->id, 'barcode' => '999', 'name' => 'Producto B', 'cost' => 1, 'price' => 2]);

    $rows = app(ImportProducts::class)->parse(tempCsv("sku,codigo_barras,nombre,precio_compra,precio_venta\nA,999,X,1,2\n"))['rows'];

    expect($rows[0]['action'])->toBe('error')
        ->and($rows[0]['errors'][0])->toContain('El SKU es de "Producto A" pero el código de barras es de "Producto B"');
});

it('respeta granel, IVA y reglas de cantidad', function () {
    $csv = <<<'CSV'
    sku,nombre,unidad,precio_compra,precio_venta,iva,granel,cantidad_minima,multiplo,existencia
    ACE,Aceite a granel,l,55,85,0,si,,,120.5
    HUE,Huevo,pza,2.5,3.5,exento,no,6,6,60
    BAD,Mal múltiplo,pza,1,2,16,no,4,6,
    CSV;

    $path = tempCsv($csv);
    $rows = collect(app(ImportProducts::class)->parse($path)['rows'])->keyBy('line');

    expect($rows[4]['errors'])->toContain('La cantidad mínima debe ser múltiplo del múltiplo de venta.');

    app(ImportProducts::class)->import($path, $this->admin, Branch::first()->id);

    $oil = Product::where('sku', 'ACE')->first();
    expect($oil->sells_by_weight)->toBeTrue()
        ->and((string) $oil->min_sale_quantity)->toBe('0.100')
        ->and((string) $oil->sale_step)->toBe('0.001')
        ->and((string) $oil->tax_rate)->toBe('0.0000')
        ->and(stockOfSku('ACE'))->toBe('120.500');

    expect((string) Product::where('sku', 'HUE')->first()->sale_step)->toBe('6.000');
});

it('rechaza archivos sin las columnas obligatorias', function () {
    $this->actingAs($this->admin)
        ->post(route('products.import.upload'), ['file' => csvFile("sku,nombre\nA,B\n")])
        ->assertSessionHasErrors(['file']);

    expect(Storage::disk('local')->files('imports'))->toBe([]);
});

it('flujo completo: subir, vista previa, importar y borrar el archivo temporal', function () {
    $csv = "sku,nombre,precio_compra,precio_venta,existencia\nX1,Filtro de aire,40,65,10\nX2,,1,2,1\n";

    $response = $this->actingAs($this->admin)
        ->post(route('products.import.upload'), ['file' => csvFile($csv)]);

    $location = $response->headers->get('Location');
    expect($location)->toContain('/products/import/');

    $token = basename(parse_url($location, PHP_URL_PATH));

    $this->get($location)
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('products/import')
            ->where('preview.stats.create', 1)
            ->where('preview.stats.errors', 1)
            ->has('preview.rows', 2));

    $this->post(route('products.import.store', $token), ['adjust_existing' => 0])
        ->assertRedirect(route('products.index'));

    expect(Product::where('sku', 'X1')->exists())->toBeTrue()
        ->and(Storage::disk('local')->exists("imports/{$token}.csv"))->toBeFalse();
});

it('no deja usar el archivo de otro usuario y el cajero no tiene acceso', function () {
    $this->actingAs($this->admin)
        ->post(route('products.import.upload'), ['file' => csvFile("sku,nombre,precio_compra,precio_venta\nZ,Z,1,2\n")]);
    $token = basename(Storage::disk('local')->files('imports')[0], '.csv');

    $other = User::factory()->create();
    $other->assignRole('encargado');
    $this->actingAs($other)->post(route('products.import.store', $token))->assertNotFound();

    $cashier = User::factory()->create();
    $cashier->assignRole('cajero');
    $this->actingAs($cashier)->get(route('products.import'))->assertForbidden();

    Storage::disk('local')->delete("imports/{$token}.csv");
});

it('descarga la plantilla', function () {
    $content = $this->actingAs($this->admin)->get(route('products.import.template'))
        ->assertOk()
        ->streamedContent();

    expect($content)->toStartWith("\xEF\xBB\xBF")
        ->toContain('codigo_barras,sku,nombre,categoria,unidad,precio_compra,precio_venta');

    expect(Category::count())->toBe(1); // descargar no crea nada
});
