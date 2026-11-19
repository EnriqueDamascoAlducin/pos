<?php

use App\Actions\Cash\OpenCashSession;
use App\Actions\Inventory\RegisterInventoryMovement;
use App\Actions\Sales\CreateSale;
use App\Enums\InventoryMovementType;
use App\Models\CashRegister;
use App\Models\Product;
use App\Models\Unit;
use App\Models\User;
use Database\Seeders\BaseDataSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

beforeEach(function () {
    $this->seed([RolesAndPermissionsSeeder::class, BaseDataSeeder::class]);

    $this->pza = Unit::where('abbreviation', 'pza')->first();
    $this->kg = Unit::where('abbreviation', 'kg')->first();

    $this->admin = User::factory()->create();
    $this->admin->assignRole('admin');

    $register = CashRegister::first();
    $this->cashier = User::factory()->create(['branch_id' => $register->branch_id]);
    $this->cashier->assignRole('cajero');
    $this->session = app(OpenCashSession::class)->handle($register, $this->cashier, '0');

    $this->brush = Product::create(['unit_id' => $this->pza->id, 'name' => 'Cepillo', 'cost' => 15, 'price' => 25]);
    $this->eggs = Product::create(['unit_id' => $this->pza->id, 'name' => 'Huevo', 'cost' => 2.5, 'price' => 3.5, 'min_sale_quantity' => 6, 'sale_step' => 6]);
    $this->beans = Product::create([
        'unit_id' => $this->kg->id, 'name' => 'Frijol', 'cost' => 24, 'price' => 36,
        'sells_by_weight' => true, 'min_sale_quantity' => '0.1', 'sale_step' => '0.001',
    ]);

    // Existencia suficiente: aquí solo se prueban las reglas de cantidad.
    DB::transaction(function () use ($register) {
        foreach ([$this->brush, $this->eggs, $this->beans] as $product) {
            app(RegisterInventoryMovement::class)->handle($product, $register->branch_id, InventoryMovementType::Adjustment, '100');
        }
    });
});

function sellQty($test, Product $product, string $qty)
{
    return app(CreateSale::class)->handle(
        $test->cashier, $test->session,
        [['product_id' => $product->id, 'quantity' => $qty]],
        [['method' => 'cash', 'amount' => '10000']],
    );
}

it('los productos nuevos se venden por pieza desde 1 por defecto', function () {
    $brush = $this->brush->fresh();

    expect((string) $brush->min_sale_quantity)->toBe('1.000')
        ->and((string) $brush->sale_step)->toBe('1.000');
});

it('no permite vender fracciones de una pieza', function () {
    expect(fn () => sellQty($this, $this->brush, '0.2'))
        ->toThrow(ValidationException::class, 'se vende por pieza completa');

    expect(fn () => sellQty($this, $this->brush, '1.5'))
        ->toThrow(ValidationException::class, 'se vende por pieza completa');

    expect((string) sellQty($this, $this->brush, '2')->total)->toBe('50.00');
});

it('respeta cantidad mínima y múltiplos de venta', function () {
    expect(fn () => sellQty($this, $this->eggs, '3'))
        ->toThrow(ValidationException::class, 'La cantidad mínima de "Huevo" es 6 pza.');

    expect(fn () => sellQty($this, $this->eggs, '8'))
        ->toThrow(ValidationException::class, 'se vende en múltiplos de 6 pza');

    expect((string) sellQty($this, $this->eggs, '12')->total)->toBe('42.00');
});

it('a granel acepta fracciones desde el mínimo', function () {
    expect(fn () => sellQty($this, $this->beans, '0.05'))
        ->toThrow(ValidationException::class, 'La cantidad mínima de "Frijol" es 0.1 kg.');

    expect((string) sellQty($this, $this->beans, '0.25')->total)->toBe('9.00');
    expect((string) sellQty($this, $this->beans, '1.375')->total)->toBe('49.50');
});

it('al dar de alta: por defecto 1 en piezas y 0.1 a granel', function () {
    $base = ['cost' => 10, 'price' => 15, 'tax_rate' => '0.16', 'active' => '1', 'tracks_inventory' => '1'];

    $this->actingAs($this->admin)->post(route('products.store'), $base + ['name' => 'Jabón', 'unit_id' => $this->pza->id])
        ->assertSessionHasNoErrors();
    $this->post(route('products.store'), $base + ['name' => 'Arroz granel', 'unit_id' => $this->kg->id, 'sells_by_weight' => '1'])
        ->assertSessionHasNoErrors();

    $soap = Product::where('name', 'Jabón')->first();
    $rice = Product::where('name', 'Arroz granel')->first();

    expect((string) $soap->min_sale_quantity)->toBe('1.000')
        ->and((string) $soap->sale_step)->toBe('1.000')
        ->and((string) $rice->min_sale_quantity)->toBe('0.100')
        ->and((string) $rice->sale_step)->toBe('0.001');
});

it('no permite decimales en productos por pieza y el mínimo debe ser múltiplo', function () {
    $base = ['name' => 'Pañal', 'unit_id' => $this->pza->id, 'cost' => 3, 'price' => 5, 'tax_rate' => '0.16'];

    $this->actingAs($this->admin)
        ->post(route('products.store'), $base + ['min_sale_quantity' => '0.5', 'sale_step' => '0.5'])
        ->assertSessionHasErrors(['min_sale_quantity', 'sale_step']);

    $this->post(route('products.store'), $base + ['min_sale_quantity' => '4', 'sale_step' => '6'])
        ->assertSessionHasErrors(['min_sale_quantity']);

    $this->post(route('products.store'), $base + ['min_sale_quantity' => '12', 'sale_step' => '6'])
        ->assertSessionHasNoErrors();
});

it('la búsqueda del punto de venta incluye las reglas de venta', function () {
    $this->actingAs($this->cashier)
        ->getJson(route('pos.search', ['q' => 'Huevo']))
        ->assertJsonPath('0.min_sale_quantity', '6.000')
        ->assertJsonPath('0.sale_step', '6.000')
        ->assertJsonPath('0.allows_decimals', false);
});
