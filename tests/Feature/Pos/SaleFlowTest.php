<?php

use App\Actions\Cash\CloseCashSession;
use App\Actions\Cash\OpenCashSession;
use App\Actions\Cash\RegisterCashMovement;
use App\Actions\Inventory\RegisterInventoryMovement;
use App\Actions\Sales\CancelSale;
use App\Actions\Sales\CreateSale;
use App\Enums\InventoryMovementType;
use App\Enums\SaleStatus;
use App\Models\CashMovement;
use App\Models\CashRegister;
use App\Models\Customer;
use App\Models\Product;
use App\Models\Setting;
use App\Models\Stock;
use App\Models\Unit;
use App\Models\User;
use Database\Seeders\BaseDataSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

beforeEach(function () {
    $this->seed([RolesAndPermissionsSeeder::class, BaseDataSeeder::class]);

    $this->register = CashRegister::first();
    $this->user = User::factory()->create(['branch_id' => $this->register->branch_id]);
    $this->user->assignRole('cajero');

    $this->product = Product::create([
        'unit_id' => Unit::first()->id,
        'barcode' => '7500000000001',
        'name' => 'Refresco',
        'cost' => '10.00',
        'price' => '17.40', // IVA incluido
        'tax_rate' => '0.16',
    ]);

    DB::transaction(fn () => app(RegisterInventoryMovement::class)->handle(
        $this->product, $this->register->branch_id, InventoryMovementType::Adjustment, '10',
    ));

    $this->session = app(OpenCashSession::class)->handle($this->register, $this->user, '500');
});

function stockOf(Product $product): string
{
    return (string) Stock::where('product_id', $product->id)->value('quantity');
}

it('cobra una venta en efectivo, calcula cambio, desglosa IVA y descuenta inventario', function () {
    $sale = app(CreateSale::class)->handle(
        $this->user,
        $this->session,
        items: [['product_id' => $this->product->id, 'quantity' => 2]],
        payments: [['method' => 'cash', 'amount' => '50']],
    );

    expect($sale->folio)->toBe(1)
        ->and((string) $sale->total)->toBe('34.80')
        ->and((string) $sale->subtotal)->toBe('30.00')
        ->and((string) $sale->tax)->toBe('4.80')
        ->and((string) $sale->cost_total)->toBe('20.00')
        ->and((string) $sale->payments->first()->amount)->toBe('34.80')
        ->and((string) $sale->payments->first()->change)->toBe('15.20')
        ->and(stockOf($this->product))->toBe('8.000');

    $this->assertDatabaseHas('inventory_movements', [
        'product_id' => $this->product->id,
        'type' => 'sale',
        'reference_id' => $sale->id,
    ]);
});

it('ignora el precio que pudiera mandar el navegador y usa el de la base de datos', function () {
    $sale = app(CreateSale::class)->handle(
        $this->user,
        $this->session,
        items: [['product_id' => $this->product->id, 'quantity' => 1, 'price' => '0.01']],
        payments: [['method' => 'cash', 'amount' => '17.40']],
    );

    expect((string) $sale->total)->toBe('17.40');
});

it('acepta pagos mixtos tarjeta + efectivo', function () {
    $sale = app(CreateSale::class)->handle(
        $this->user,
        $this->session,
        items: [['product_id' => $this->product->id, 'quantity' => 2]],
        payments: [
            ['method' => 'card', 'amount' => '20', 'reference' => '1234'],
            ['method' => 'cash', 'amount' => '20'],
        ],
    );

    $cash = $sale->payments->firstWhere('method.value', 'cash');

    expect((string) $cash->amount)->toBe('14.80')
        ->and((string) $cash->change)->toBe('5.20');
});

it('rechaza un pago incompleto sin guardar nada', function () {
    expect(fn () => app(CreateSale::class)->handle(
        $this->user,
        $this->session,
        items: [['product_id' => $this->product->id, 'quantity' => 2]],
        payments: [['method' => 'cash', 'amount' => '10']],
    ))->toThrow(ValidationException::class);

    $this->assertDatabaseCount('sales', 0);
    expect(stockOf($this->product))->toBe('10.000');
});

it('vende a crédito respetando el límite y actualiza el saldo del cliente', function () {
    $customer = Customer::create(['name' => 'Cliente', 'credit_limit' => '50']);

    app(CreateSale::class)->handle(
        $this->user, $this->session,
        items: [['product_id' => $this->product->id, 'quantity' => 2]],
        payments: [['method' => 'credit', 'amount' => '34.80']],
        customerId: $customer->id,
    );

    expect((string) $customer->fresh()->balance)->toBe('34.80');

    expect(fn () => app(CreateSale::class)->handle(
        $this->user, $this->session,
        items: [['product_id' => $this->product->id, 'quantity' => 1]],
        payments: [['method' => 'credit', 'amount' => '17.40']],
        customerId: $customer->id,
    ))->toThrow(ValidationException::class, 'Crédito insuficiente');
});

it('bloquea la venta sin existencia cuando no se permite inventario negativo', function () {
    Setting::set('allow_negative_stock', '0');

    expect(fn () => app(CreateSale::class)->handle(
        $this->user, $this->session,
        items: [['product_id' => $this->product->id, 'quantity' => 11]],
        payments: [['method' => 'cash', 'amount' => '500']],
    ))->toThrow(ValidationException::class, 'Existencia insuficiente');
});

it('cancela una venta y regresa el inventario y el crédito', function () {
    $customer = Customer::create(['name' => 'Cliente', 'credit_limit' => '100']);

    $sale = app(CreateSale::class)->handle(
        $this->user, $this->session,
        items: [['product_id' => $this->product->id, 'quantity' => 2]],
        payments: [['method' => 'credit', 'amount' => '34.80']],
        customerId: $customer->id,
    );

    app(CancelSale::class)->handle($sale, $this->user, 'Error de captura');

    expect($sale->fresh()->status)->toBe(SaleStatus::Cancelled)
        ->and(stockOf($this->product))->toBe('10.000')
        ->and((string) $customer->fresh()->balance)->toBe('0.00');
});

it('no permite abrir dos turnos en la misma caja', function () {
    $other = User::factory()->create();

    expect(fn () => app(OpenCashSession::class)->handle($this->register, $other, '0'))
        ->toThrow(ValidationException::class);
});

it('calcula el corte de caja: fondo + efectivo + entradas - salidas', function () {
    $create = app(CreateSale::class);

    $create->handle($this->user, $this->session,
        items: [['product_id' => $this->product->id, 'quantity' => 1]],
        payments: [['method' => 'cash', 'amount' => '100']]); // 17.40 efectivo

    $create->handle($this->user, $this->session,
        items: [['product_id' => $this->product->id, 'quantity' => 1]],
        payments: [['method' => 'card', 'amount' => '17.40']]); // tarjeta: no cuenta en efectivo

    $cancelled = $create->handle($this->user, $this->session,
        items: [['product_id' => $this->product->id, 'quantity' => 1]],
        payments: [['method' => 'cash', 'amount' => '17.40']]);
    app(CancelSale::class)->handle($cancelled, $this->user, 'Prueba');

    app(RegisterCashMovement::class)->handle($this->session, $this->user, CashMovement::TYPE_OUT, '100', 'Retiro');

    $closed = app(CloseCashSession::class)->handle($this->session, '415.00');

    // 500 + 17.40 - 100 = 417.40
    expect((string) $closed->expected_amount)->toBe('417.40')
        ->and((string) $closed->difference)->toBe('-2.40')
        ->and($closed->isOpen())->toBeFalse();
});
