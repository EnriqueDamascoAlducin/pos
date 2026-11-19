<?php

use App\Actions\Inventory\RegisterInventoryMovement;
use App\Enums\InventoryMovementType;
use App\Enums\SaleStatus;
use App\Models\CashRegister;
use App\Models\CashSession;
use App\Models\Product;
use App\Models\Sale;
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

    $this->product = Product::create([
        'unit_id' => Unit::first()->id,
        'barcode' => '750100',
        'name' => 'Galletas',
        'cost' => '30',
        'price' => '40',
    ]);

    DB::transaction(fn () => app(RegisterInventoryMovement::class)->handle(
        $this->product, $this->register->branch_id, InventoryMovementType::Adjustment, '10',
    ));
});

function openShift($test, string $amount = '500'): CashSession
{
    $test->actingAs($test->cashier)
        ->post(route('cash.store'), ['cash_register_id' => $test->register->id, 'opening_amount' => $amount])
        ->assertRedirect(route('pos.index'));

    return CashSession::firstOrFail();
}

it('manda a abrir turno si no hay uno abierto', function () {
    $this->actingAs($this->cashier)->get(route('pos.index'))->assertRedirect(route('cash.open'));
});

it('abre turno y muestra el punto de venta', function () {
    openShift($this);

    $this->get(route('pos.index'))
        ->assertOk()
        ->assertInertia(fn ($page) => $page->component('pos/index')->where('session.register', 'Caja 1'));
});

it('busca por código de barras exacto', function () {
    openShift($this);

    $this->getJson(route('pos.search', ['q' => '750100']))
        ->assertOk()
        ->assertJsonPath('0.name', 'Galletas')
        ->assertJsonPath('0.exact', true)
        ->assertJsonPath('0.stock', '10.000');
});

it('cobra una venta desde el punto de venta y devuelve el cambio en flash', function () {
    openShift($this);

    $this->post(route('pos.store'), [
        'items' => [['product_id' => $this->product->id, 'quantity' => 3]],
        'payments' => [['method' => 'cash', 'amount' => '200']],
    ])->assertRedirect(route('pos.index'));

    $sale = Sale::firstOrFail();

    expect((string) $sale->total)->toBe('120.00')
        ->and((string) $sale->payments->first()->change)->toBe('80.00');

    $this->get(route('sales.ticket', $sale))->assertOk()->assertSee('Galletas')->assertSee('$80.00');
});

it('regresa el error de validación si el pago no alcanza', function () {
    openShift($this);

    $this->from(route('pos.index'))->post(route('pos.store'), [
        'items' => [['product_id' => $this->product->id, 'quantity' => 3]],
        'payments' => [['method' => 'cash', 'amount' => '100']],
    ])->assertSessionHasErrors('payments');

    expect(Sale::count())->toBe(0);
});

it('el cajero no puede aplicar descuentos sin autorización ni cancelar ventas', function () {
    openShift($this);

    $this->post(route('pos.store'), [
        'items' => [['product_id' => $this->product->id, 'quantity' => 1, 'discount' => 5]],
        'payments' => [['method' => 'cash', 'amount' => '40']],
    ])->assertSessionHasErrors('authorization');

    expect(Sale::count())->toBe(0);

    $this->post(route('pos.store'), [
        'items' => [['product_id' => $this->product->id, 'quantity' => 1]],
        'payments' => [['method' => 'cash', 'amount' => '40']],
    ]);

    $this->post(route('sales.cancel', Sale::first()), ['reason' => 'x'])->assertForbidden();
});

it('el encargado cancela una venta del turno abierto', function () {
    openShift($this);
    $this->post(route('pos.store'), [
        'items' => [['product_id' => $this->product->id, 'quantity' => 1]],
        'payments' => [['method' => 'cash', 'amount' => '40']],
    ]);

    $manager = User::factory()->create();
    $manager->assignRole('encargado');

    $this->actingAs($manager)
        ->post(route('sales.cancel', Sale::first()), ['reason' => 'Error'])
        ->assertRedirect();

    expect(Sale::first()->status)->toBe(SaleStatus::Cancelled);
});

it('registra salida de efectivo y hace el corte', function () {
    openShift($this, '500');

    $this->post(route('pos.store'), [
        'items' => [['product_id' => $this->product->id, 'quantity' => 1]],
        'payments' => [['method' => 'cash', 'amount' => '50']],
    ]);

    $this->post(route('cash.movements.store'), ['type' => 'out', 'amount' => '100', 'reason' => 'Retiro'])
        ->assertRedirect();

    $this->get(route('cash.current'))
        ->assertInertia(fn ($page) => $page->component('cash/current')->where('summary.expected_cash', '440.00'));

    $session = CashSession::firstOrFail();

    $this->post(route('cash.close'), ['counted_amount' => '440'])
        ->assertRedirect(route('cash.show', $session));

    expect((string) $session->fresh()->difference)->toBe('0.00');

    $this->get(route('pos.index'))->assertRedirect(route('cash.open'));
});

it('lista solo las ventas propias para el cajero', function () {
    openShift($this);
    $this->post(route('pos.store'), [
        'items' => [['product_id' => $this->product->id, 'quantity' => 1]],
        'payments' => [['method' => 'cash', 'amount' => '40']],
    ]);

    $this->get(route('sales.index'))
        ->assertInertia(fn ($page) => $page->component('sales/index')->has('sales.data', 1));

    $other = User::factory()->create();
    $other->assignRole('cajero');

    $this->actingAs($other)->get(route('sales.index'))
        ->assertInertia(fn ($page) => $page->has('sales.data', 0));

    $this->actingAs($other)->get(route('sales.ticket', Sale::first()))->assertForbidden();
});
