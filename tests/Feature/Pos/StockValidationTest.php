<?php

use App\Actions\Cash\OpenCashSession;
use App\Actions\Inventory\RegisterInventoryMovement;
use App\Enums\InventoryMovementType;
use App\Models\CashRegister;
use App\Models\Product;
use App\Models\Sale;
use App\Models\Setting;
use App\Models\Stock;
use App\Models\Unit;
use App\Models\User;
use Database\Seeders\BaseDataSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Support\Facades\DB;

beforeEach(function () {
    $this->seed([RolesAndPermissionsSeeder::class, BaseDataSeeder::class]);

    $this->register = CashRegister::first();
    $this->cashier = User::factory()->create(['branch_id' => $this->register->branch_id]);
    $this->cashier->assignRole('cajero');

    $this->chain = Product::create([
        'unit_id' => Unit::where('abbreviation', 'pza')->first()->id,
        'sku' => 'F02030341',
        'name' => 'Cadena de tracción 428H',
        'cost' => 90,
        'price' => 124.10,
    ]);

    DB::transaction(fn () => app(RegisterInventoryMovement::class)->handle(
        $this->chain, $this->register->branch_id, InventoryMovementType::Adjustment, '40',
    ));

    app(OpenCashSession::class)->handle($this->register, $this->cashier, '0');
});

function sellChains($test, int $qty)
{
    return $test->actingAs($test->cashier)->from(route('pos.index'))->post(route('pos.store'), [
        'items' => [['product_id' => $test->chain->id, 'quantity' => $qty]],
        'payments' => [['method' => 'cash', 'amount' => '20000']],
    ]);
}

it('por defecto no deja vender más de lo que hay en existencia', function () {
    expect(Setting::get('allow_negative_stock'))->toBe('0');

    sellChains($this, 100)->assertSessionHasErrors([
        'items' => 'Existencia insuficiente de "Cadena de tracción 428H": hay 40 pza y se piden 100.',
    ]);

    expect(Sale::count())->toBe(0)
        ->and((string) Stock::where('product_id', $this->chain->id)->value('quantity'))->toBe('40.000');
});

it('sí deja vender hasta la existencia exacta', function () {
    sellChains($this, 40)->assertSessionHasNoErrors();

    expect((string) Stock::where('product_id', $this->chain->id)->value('quantity'))->toBe('0.000');
});

it('si el negocio lo permite, vende aunque la existencia quede en negativo', function () {
    Setting::set('allow_negative_stock', '1');

    sellChains($this, 100)->assertSessionHasNoErrors();

    expect((string) Stock::where('product_id', $this->chain->id)->value('quantity'))->toBe('-60.000');
});

it('el punto de venta recibe la regla de existencia', function () {
    $this->actingAs($this->cashier)->get(route('pos.index'))
        ->assertInertia(fn ($page) => $page->where('allowNegativeStock', false));

    Setting::set('allow_negative_stock', '1');

    $this->get(route('pos.index'))
        ->assertInertia(fn ($page) => $page->where('allowNegativeStock', true));
});
