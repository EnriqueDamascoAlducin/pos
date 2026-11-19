<?php

use App\Actions\Cash\OpenCashSession;
use App\Actions\Inventory\RegisterInventoryMovement;
use App\Enums\InventoryMovementType;
use App\Models\CashRegister;
use App\Models\Product;
use App\Models\Sale;
use App\Models\Unit;
use App\Models\User;
use Database\Seeders\BaseDataSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Support\Facades\DB;

beforeEach(function () {
    $this->seed([RolesAndPermissionsSeeder::class, BaseDataSeeder::class]);

    $register = CashRegister::first();

    $this->cashier = User::factory()->create(['employee_number' => '101', 'password' => 'secreto123', 'branch_id' => $register->branch_id]);
    $this->cashier->assignRole('cajero');

    $this->manager = User::factory()->create(['employee_number' => '2', 'name' => 'Laura Encargada', 'pin' => '4321', 'branch_id' => $register->branch_id]);
    $this->manager->assignRole('encargado');

    $this->product = Product::create(['unit_id' => Unit::first()->id, 'name' => 'Shampoo', 'cost' => 50, 'price' => 80]);
    DB::transaction(fn () => app(RegisterInventoryMovement::class)->handle(
        $this->product, $register->branch_id, InventoryMovementType::Adjustment, '20',
    ));

    app(OpenCashSession::class)->handle($register, $this->cashier, '0');
});

function authorizeAs($test, string $number, string $pin, array $adjustments)
{
    return $test->actingAs($test->cashier)->postJson(route('pos.authorize'), [
        'employee_number' => $number,
        'pin' => $pin,
        'adjustments' => $adjustments,
    ]);
}

it('se entra con el número de usuario o con el correo', function () {
    $this->post(route('login.store'), ['login' => '101', 'password' => 'secreto123'])
        ->assertRedirect(route('dashboard'));
    $this->assertAuthenticatedAs($this->cashier);

    auth()->logout();

    $this->post(route('login.store'), ['login' => $this->cashier->email, 'password' => 'secreto123'])
        ->assertRedirect(route('dashboard'));

    auth()->logout();

    $this->post(route('login.store'), ['login' => '999', 'password' => 'secreto123'])
        ->assertSessionHasErrors('login');
    $this->assertGuest();
});

it('el encargado autoriza con su número y clave un cambio de precio y un descuento', function () {
    $adjustments = [['product_id' => $this->product->id, 'unit_price' => '70', 'discount' => '5']];

    $token = authorizeAs($this, '2', '4321', $adjustments)
        ->assertOk()
        ->assertJsonPath('supervisor', 'Laura Encargada')
        ->json('token');

    $this->post(route('pos.store'), [
        'items' => [['product_id' => $this->product->id, 'quantity' => 2, 'unit_price' => '70', 'discount' => '5']],
        'payments' => [['method' => 'cash', 'amount' => '200']],
        'authorization_token' => $token,
    ])->assertSessionHasNoErrors()->assertRedirect(route('pos.index'));

    $sale = Sale::with('items')->firstOrFail();

    // 2 × 70 − 5 = 135
    expect((string) $sale->total)->toBe('135.00')
        ->and($sale->authorized_by)->toBe($this->manager->id)
        ->and((string) $sale->items->first()->price)->toBe('70.00')
        ->and((string) $sale->items->first()->list_price)->toBe('80.00');

    $this->get(route('sales.ticket', $sale))->assertSee('Precio normal $80.00');
});

it('el pase es de un solo uso', function () {
    $adjustments = [['product_id' => $this->product->id, 'discount' => '10']];
    $token = authorizeAs($this, '2', '4321', $adjustments)->json('token');

    $sale = fn () => $this->post(route('pos.store'), [
        'items' => [['product_id' => $this->product->id, 'quantity' => 1, 'discount' => '10']],
        'payments' => [['method' => 'cash', 'amount' => '70']],
        'authorization_token' => $token,
    ]);

    $sale()->assertSessionHasNoErrors();
    $sale()->assertSessionHasErrors('authorization');

    expect(Sale::count())->toBe(1);
});

it('si el cajero cambia el ajuste después de autorizar, se rechaza', function () {
    $token = authorizeAs($this, '2', '4321', [['product_id' => $this->product->id, 'discount' => '5']])->json('token');

    $this->post(route('pos.store'), [
        'items' => [['product_id' => $this->product->id, 'quantity' => 1, 'discount' => '30']],
        'payments' => [['method' => 'cash', 'amount' => '80']],
        'authorization_token' => $token,
    ])->assertSessionHasErrors(['authorization' => 'Un ajuste cambió después de autorizarse. Pide la autorización de nuevo.']);
});

it('rechaza clave incorrecta, usuarios sin permiso y bloquea tras varios intentos', function () {
    $adjustments = [['product_id' => $this->product->id, 'discount' => '5']];

    authorizeAs($this, '2', '0000', $adjustments)->assertUnprocessable()->assertJsonValidationErrors('pin');

    // Un cajero con clave no puede autorizar.
    $other = User::factory()->create(['employee_number' => '102', 'pin' => '1111']);
    $other->assignRole('cajero');
    authorizeAs($this, '102', '1111', $adjustments)->assertUnprocessable();

    // Encargado desactivado tampoco.
    $this->manager->update(['active' => false]);
    authorizeAs($this, '2', '4321', $adjustments)->assertUnprocessable();
    $this->manager->update(['active' => true]);

    foreach (range(1, 3) as $i) {
        authorizeAs($this, '2', '9999', $adjustments);
    }

    authorizeAs($this, '2', '4321', $adjustments)
        ->assertUnprocessable()
        ->assertJsonPath('errors.pin.0', fn ($m) => str_starts_with($m, 'Demasiados intentos'));
});

it('el encargado vendiendo aplica descuentos sin pedir clave', function () {
    $register = CashRegister::create(['branch_id' => $this->manager->branch_id, 'name' => 'Caja 2']);
    app(OpenCashSession::class)->handle($register, $this->manager, '0');

    $this->actingAs($this->manager)->post(route('pos.store'), [
        'items' => [['product_id' => $this->product->id, 'quantity' => 1, 'unit_price' => '75']],
        'payments' => [['method' => 'cash', 'amount' => '75']],
    ])->assertSessionHasNoErrors();

    expect(Sale::first()->authorized_by)->toBe($this->manager->id);
});

it('el admin asigna número y clave; la clave se guarda cifrada y valida formato', function () {
    $admin = User::factory()->create();
    $admin->assignRole('admin');

    $this->actingAs($admin)->post(route('admin.users.store'), [
        'employee_number' => '3', 'name' => 'Pedro', 'password' => 'secreto123', 'pin' => '2468',
        'role' => 'encargado', 'active' => '1',
    ])->assertSessionHasNoErrors();

    $pedro = User::where('employee_number', '3')->firstOrFail();
    expect($pedro->email)->toBeNull()
        ->and($pedro->pin)->not->toBe('2468')
        ->and(Hash::check('2468', $pedro->pin))->toBeTrue();

    $this->post(route('admin.users.store'), [
        'employee_number' => 'A1', 'name' => 'X', 'password' => 'secreto123', 'pin' => '12', 'role' => 'cajero',
    ])->assertSessionHasErrors(['employee_number', 'pin']);

    $this->post(route('admin.users.store'), [
        'employee_number' => '3', 'name' => 'Repetido', 'password' => 'secreto123', 'role' => 'cajero',
    ])->assertSessionHasErrors('employee_number');
});
