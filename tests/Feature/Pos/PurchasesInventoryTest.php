<?php

use App\Actions\Inventory\AdjustInventory;
use App\Actions\Inventory\RegisterInventoryMovement;
use App\Enums\InventoryMovementType;
use App\Models\Product;
use App\Models\Purchase;
use App\Models\Stock;
use App\Models\Supplier;
use App\Models\Unit;
use App\Models\User;
use Database\Seeders\BaseDataSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Support\Facades\DB;

beforeEach(function () {
    $this->seed([RolesAndPermissionsSeeder::class, BaseDataSeeder::class]);

    $this->manager = User::factory()->create();
    $this->manager->assignRole('encargado');

    $this->product = Product::create([
        'unit_id' => Unit::first()->id,
        'sku' => 'SKU123',
        'name' => 'Producto 123',
        'cost' => '30',
        'price' => '40',
        'min_stock' => '5',
    ]);

    DB::transaction(fn () => app(RegisterInventoryMovement::class)->handle(
        $this->product, $this->manager->currentBranchId(), InventoryMovementType::Adjustment, '3',
    ));
});

function stockQty(Product $product): string
{
    return (string) Stock::where('product_id', $product->id)->value('quantity');
}

it('registra una compra: suma existencia, actualiza costo y deja kardex', function () {
    $supplier = Supplier::create(['name' => 'Distribuidora']);

    $this->actingAs($this->manager)->post(route('purchases.store'), [
        'supplier_id' => $supplier->id,
        'invoice_number' => 'A-100',
        'update_costs' => true,
        'items' => [['product_id' => $this->product->id, 'quantity' => 10, 'cost' => '32.50']],
    ])->assertRedirect(route('purchases.show', Purchase::first()));

    $purchase = Purchase::first();

    expect((string) $purchase->total)->toBe('325.00')
        ->and(stockQty($this->product))->toBe('13.000')
        ->and((string) $this->product->fresh()->cost)->toBe('32.50');

    $this->assertDatabaseHas('inventory_movements', [
        'product_id' => $this->product->id,
        'type' => 'purchase',
        'quantity' => 10,
        'reference_type' => $purchase->getMorphClass(),
        'reference_id' => $purchase->id,
    ]);
});

it('puede registrar la compra sin cambiar el precio de compra', function () {
    $this->actingAs($this->manager)->post(route('purchases.store'), [
        'update_costs' => false,
        'items' => [['product_id' => $this->product->id, 'quantity' => 2, 'cost' => '50']],
    ]);

    expect((string) $this->product->fresh()->cost)->toBe('30.00')
        ->and(stockQty($this->product))->toBe('5.000');
});

it('rechaza productos repetidos y cantidades en cero', function () {
    $this->actingAs($this->manager)->post(route('purchases.store'), [
        'items' => [
            ['product_id' => $this->product->id, 'quantity' => 1, 'cost' => 10],
            ['product_id' => $this->product->id, 'quantity' => 0, 'cost' => 10],
        ],
    ])->assertSessionHasErrors(['items.1.product_id', 'items.1.quantity']);

    expect(Purchase::count())->toBe(0);
});

it('cancelar una compra retira la mercancía del inventario', function () {
    $this->actingAs($this->manager)->post(route('purchases.store'), [
        'items' => [['product_id' => $this->product->id, 'quantity' => 10, 'cost' => '30']],
    ]);

    $purchase = Purchase::first();

    $this->post(route('purchases.cancel', $purchase), ['reason' => 'Capturada dos veces'])->assertRedirect();

    expect($purchase->fresh()->status)->toBe(Purchase::STATUS_CANCELLED)
        ->and(stockQty($this->product))->toBe('3.000');

    $this->post(route('purchases.cancel', $purchase), ['reason' => 'otra vez'])
        ->assertSessionHasErrors('purchase');
});

it('conteo físico deja la existencia en lo contado', function () {
    $this->actingAs($this->manager)->post(route('inventory.adjust', $this->product), [
        'mode' => AdjustInventory::MODE_COUNT,
        'quantity' => '7',
        'reason' => 'Inventario mensual',
    ])->assertRedirect();

    expect(stockQty($this->product))->toBe('7.000');

    $this->assertDatabaseHas('inventory_movements', [
        'product_id' => $this->product->id,
        'type' => 'adjustment',
        'quantity' => 4,
        'notes' => 'Conteo físico: Inventario mensual',
    ]);
});

it('merma resta y un conteo igual no genera movimiento', function () {
    $this->actingAs($this->manager)->post(route('inventory.adjust', $this->product), [
        'mode' => AdjustInventory::MODE_OUT, 'quantity' => '1', 'reason' => 'Caducado',
    ]);

    expect(stockQty($this->product))->toBe('2.000');

    $before = DB::table('inventory_movements')->count();

    $this->post(route('inventory.adjust', $this->product), [
        'mode' => AdjustInventory::MODE_COUNT, 'quantity' => '2', 'reason' => 'Revisión',
    ]);

    expect(DB::table('inventory_movements')->count())->toBe($before);
});

it('lista existencias, filtra bajo mínimo y muestra el kardex', function () {
    Product::create(['unit_id' => Unit::first()->id, 'name' => 'Con existencia', 'cost' => 1, 'price' => 2, 'min_stock' => 0]);

    $this->actingAs($this->manager)->get(route('inventory.index'))
        ->assertInertia(fn ($page) => $page->component('inventory/index')->where('lowStockCount', 2)->has('products.data', 2));

    $this->get(route('inventory.index', ['low' => 1]))
        ->assertInertia(fn ($page) => $page->has('products.data', 2));

    $this->get(route('inventory.kardex', $this->product))
        ->assertInertia(fn ($page) => $page->component('inventory/kardex')->where('stock', '3.000')->has('movements.data', 1));

    $this->get(route('dashboard'))
        ->assertInertia(fn ($page) => $page->where('lowStockCount', 2));
});

it('la búsqueda de inventario regresa costo y existencia', function () {
    $this->actingAs($this->manager)->getJson(route('inventory.search', ['q' => 'SKU123']))
        ->assertOk()
        ->assertJsonPath('0.exact', true)
        ->assertJsonPath('0.cost', '30.00')
        ->assertJsonPath('0.stock', '3.000');
});

it('el cajero no entra a compras, proveedores ni inventario', function () {
    $cashier = User::factory()->create();
    $cashier->assignRole('cajero');

    $this->actingAs($cashier);
    $this->get(route('purchases.index'))->assertForbidden();
    $this->get(route('suppliers.index'))->assertForbidden();
    $this->get(route('inventory.index'))->assertForbidden();
    $this->getJson(route('inventory.search', ['q' => 'x']))->assertForbidden();
    $this->post(route('inventory.adjust', $this->product), ['mode' => 'in', 'quantity' => 1, 'reason' => 'x'])->assertForbidden();
});

it('administra proveedores', function () {
    $this->actingAs($this->manager)->post(route('suppliers.store'), ['name' => 'Proveedor X', 'phone' => '555'])
        ->assertRedirect();

    $supplier = Supplier::firstOrFail();

    $this->put(route('suppliers.update', $supplier), ['name' => 'Proveedor Y'])->assertRedirect();
    expect($supplier->fresh()->name)->toBe('Proveedor Y');

    $this->delete(route('suppliers.destroy', $supplier))->assertRedirect();
    expect(Supplier::count())->toBe(0);
});
