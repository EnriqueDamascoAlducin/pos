<?php

use App\Actions\Cash\OpenCashSession;
use App\Actions\Inventory\RegisterInventoryMovement;
use App\Actions\Sales\CancelSale;
use App\Actions\Sales\CreateSale;
use App\Enums\InventoryMovementType;
use App\Models\CashRegister;
use App\Models\Customer;
use App\Models\CustomerPayment;
use App\Models\Product;
use App\Models\Unit;
use App\Models\User;
use App\Queries\CustomerStatement;
use Database\Seeders\BaseDataSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Support\Facades\DB;

beforeEach(function () {
    $this->seed([RolesAndPermissionsSeeder::class, BaseDataSeeder::class]);

    $this->register = CashRegister::first();
    $this->cashier = User::factory()->create(['branch_id' => $this->register->branch_id]);
    $this->cashier->assignRole('cajero');
    $this->manager = User::factory()->create(['branch_id' => $this->register->branch_id]);
    $this->manager->assignRole('encargado');

    $this->product = Product::create(['unit_id' => Unit::first()->id, 'name' => 'Arroz', 'cost' => 20, 'price' => 30]);
    DB::transaction(fn () => app(RegisterInventoryMovement::class)->handle(
        $this->product, $this->register->branch_id, InventoryMovementType::Adjustment, '100',
    ));

    $this->customer = Customer::create(['name' => 'Doña Mary', 'credit_limit' => '500']);
    $this->session = app(OpenCashSession::class)->handle($this->register, $this->cashier, '100');
});

function creditSale($test, int $qty): void
{
    app(CreateSale::class)->handle(
        $test->cashier, $test->session,
        items: [['product_id' => $test->product->id, 'quantity' => $qty]],
        payments: [['method' => 'credit', 'amount' => (string) ($qty * 30)]],
        customerId: $test->customer->id,
    );
}

it('el encargado da de alta y edita clientes; el cajero no', function () {
    $this->actingAs($this->manager)
        ->post(route('customers.store'), ['name' => 'Juan', 'credit_limit' => '1000'])
        ->assertRedirect();

    $juan = Customer::where('name', 'Juan')->firstOrFail();
    expect((string) $juan->credit_limit)->toBe('1000.00');

    $this->put(route('customers.update', $juan), ['name' => 'Juan Pérez', 'credit_limit' => '200', 'active' => '1'])
        ->assertRedirect();
    expect($juan->fresh()->name)->toBe('Juan Pérez');

    $this->actingAs($this->cashier)
        ->post(route('customers.store'), ['name' => 'Otro', 'credit_limit' => '0'])
        ->assertForbidden();
});

it('el cajero recibe un abono en efectivo y entra al corte de su turno', function () {
    creditSale($this, 5); // debe 150

    $this->actingAs($this->cashier)
        ->post(route('customers.payments.store', $this->customer), ['method' => 'cash', 'amount' => '100'])
        ->assertRedirect();

    expect((string) $this->customer->fresh()->balance)->toBe('50.00');

    $payment = CustomerPayment::firstOrFail();
    expect($payment->cash_session_id)->toBe($this->session->id);

    // 100 de fondo + 100 de abono en efectivo
    $this->get(route('cash.current'))
        ->assertInertia(fn ($page) => $page
            ->where('summary.customer_payments_cash', '100.00')
            ->where('summary.expected_cash', '200.00'));

    $this->get(route('customers.payments.receipt', $payment))
        ->assertOk()
        ->assertSee('RECIBO DE ABONO')
        ->assertSee('$100.00')
        ->assertSee('$50.00');
});

it('no permite abonar más de lo que debe ni efectivo sin turno abierto', function () {
    creditSale($this, 2); // debe 60

    $this->actingAs($this->cashier)
        ->post(route('customers.payments.store', $this->customer), ['method' => 'cash', 'amount' => '61'])
        ->assertSessionHasErrors('amount');

    $this->actingAs($this->manager)
        ->post(route('customers.payments.store', $this->customer), ['method' => 'cash', 'amount' => '10'])
        ->assertSessionHasErrors('method');

    $this->post(route('customers.payments.store', $this->customer), ['method' => 'transfer', 'amount' => '60', 'reference' => 'SPEI 123'])
        ->assertSessionHasNoErrors();

    expect((string) $this->customer->fresh()->balance)->toBe('0.00');
});

it('el estado de cuenta suma cargos, resta abonos e ignora ventas canceladas', function () {
    creditSale($this, 4); // +120
    creditSale($this, 2); // +60

    $sale = $this->customer->sales()->latest('id')->first();
    app(CancelSale::class)->handle($sale, $this->manager, 'Error');

    $this->actingAs($this->cashier)
        ->post(route('customers.payments.store', $this->customer), ['method' => 'cash', 'amount' => '20']);

    $rows = app(CustomerStatement::class)->handle($this->customer->fresh());

    expect($rows)->toHaveCount(2)
        ->and($rows[0]['charge'])->toBe('120.00')
        ->and($rows[1]['payment'])->toBe('20.00')
        ->and($rows[1]['balance'])->toBe('100.00')
        ->and((string) $this->customer->fresh()->balance)->toBe('100.00');

    $this->get(route('customers.show', $this->customer))
        ->assertInertia(fn ($page) => $page
            ->component('customers/show')
            ->where('customer.balance', '100.00')
            ->where('customer.available_credit', '400.00')
            ->where('hasOpenSession', true)
            ->has('movements', 2));
});

it('muestra cuentas por cobrar en la lista y en inicio', function () {
    creditSale($this, 3); // 90
    Customer::create(['name' => 'Sin deuda', 'credit_limit' => '100']);

    $admin = User::factory()->create();
    $admin->assignRole('admin');

    $this->actingAs($admin)->get(route('customers.index', ['with_balance' => 1]))
        ->assertInertia(fn ($page) => $page
            ->where('receivable.total', '90.00')
            ->where('receivable.customers', 1)
            ->has('customers.data', 1));

    $this->get(route('dashboard'))->assertInertia(fn ($page) => $page->where('receivable.total', '90.00'));
});
