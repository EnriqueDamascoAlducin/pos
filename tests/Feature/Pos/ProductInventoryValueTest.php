<?php

use App\Models\Product;
use App\Models\Stock;
use App\Models\Unit;
use App\Models\User;
use App\Queries\InventoryValuation;
use Database\Seeders\BaseDataSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;

beforeEach(function () {
    $this->seed([RolesAndPermissionsSeeder::class, BaseDataSeeder::class]);

    $this->admin = User::factory()->create();
    $this->admin->assignRole('admin');
});

function productPayload(array $overrides = []): array
{
    return array_merge([
        'name' => 'Producto 123',
        'sku' => 'SKU123',
        'unit_id' => Unit::first()->id,
        'cost' => '30',
        'price' => '40',
        'tax_rate' => '0.16',
        'price_includes_tax' => '1',
        'tracks_inventory' => '1',
        'active' => '1',
        'initial_stock' => '3',
    ], $overrides);
}

it('exige precio de compra y precio de venta al registrar', function () {
    $this->actingAs($this->admin)
        ->post(route('products.store'), productPayload(['cost' => '', 'price' => '']))
        ->assertSessionHasErrors(['cost', 'price']);

    expect(Product::count())->toBe(0);
});

it('registra el producto con su existencia inicial en kardex', function () {
    $this->actingAs($this->admin)
        ->post(route('products.store'), productPayload())
        ->assertRedirect(route('products.index'));

    $product = Product::where('sku', 'SKU123')->firstOrFail();

    expect((string) $product->cost)->toBe('30.00')
        ->and((string) $product->price)->toBe('40.00')
        ->and((string) Stock::where('product_id', $product->id)->value('quantity'))->toBe('3.000');

    $this->assertDatabaseHas('inventory_movements', [
        'product_id' => $product->id,
        'type' => 'adjustment',
        'notes' => 'Inventario inicial',
    ]);
});

it('calcula el valor en bodega: 3 × $30 = $90 compra y 3 × $40 = $120 venta', function () {
    $this->actingAs($this->admin)->post(route('products.store'), productPayload());

    $product = (new InventoryValuation)->products()->where('sku', 'SKU123')->first();

    expect((float) $product->stock)->toBe(3.0)
        ->and((float) $product->stock_cost_value)->toBe(90.0)
        ->and((float) $product->stock_sale_value)->toBe(120.0)
        ->and((float) $product->stock_profit)->toBe(30.0);

    expect((new InventoryValuation)->totals())->toMatchArray([
        'products' => 1,
        'cost_value' => '90.00',
        'sale_value' => '120.00',
        'profit' => '30.00',
    ]);
});

it('muestra el valor en bodega en el listado, el reporte y el inicio', function () {
    $this->actingAs($this->admin)->post(route('products.store'), productPayload());

    $this->get(route('products.index'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('products/index')
            ->where('totals.cost_value', '90.00')
            ->where('totals.sale_value', '120.00')
            ->has('products.data', 1));

    $this->get(route('reports.inventory-value'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('reports/inventory-value')
            ->where('totals.sale_value', '120.00')
            ->has('byCategory', 1)
            ->has('products', 1));

    $this->get(route('dashboard'))
        ->assertInertia(fn ($page) => $page->where('inventory.cost_value', '90.00'));
});

it('el cajero no puede administrar productos ni ver reportes', function () {
    $cashier = User::factory()->create();
    $cashier->assignRole('cajero');

    $this->actingAs($cashier)->get(route('products.index'))->assertForbidden();
    $this->actingAs($cashier)->get(route('reports.inventory-value'))->assertForbidden();
    $this->actingAs($cashier)->get(route('dashboard'))
        ->assertInertia(fn ($page) => $page->where('inventory', null));
});

it('al editar no permite cambiar la existencia, solo los precios', function () {
    $this->actingAs($this->admin)->post(route('products.store'), productPayload());
    $product = Product::where('sku', 'SKU123')->firstOrFail();

    $this->put(route('products.update', $product), productPayload(['price' => '45', 'initial_stock' => '100']))
        ->assertRedirect(route('products.index'));

    expect((string) $product->fresh()->price)->toBe('45.00')
        ->and((string) Stock::where('product_id', $product->id)->value('quantity'))->toBe('3.000');
});
