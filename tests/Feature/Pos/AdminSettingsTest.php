<?php

use App\Actions\Cash\OpenCashSession;
use App\Models\Branch;
use App\Models\CashRegister;
use App\Models\Category;
use App\Models\Product;
use App\Models\Setting;
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

it('el registro público está desactivado', function () {
    $this->get('/register')->assertNotFound();
});

it('el admin crea un cajero que puede iniciar sesión y vender', function () {
    $this->actingAs($this->admin)->post(route('admin.users.store'), [
        'employee_number' => '150',
        'name' => 'Ana Cajera',
        'email' => 'ana@example.com',
        'password' => 'secreto123',
        'role' => 'cajero',
        'branch_id' => Branch::first()->id,
        'active' => '1',
    ])->assertRedirect();

    $ana = User::where('email', 'ana@example.com')->firstOrFail();

    expect($ana->hasRole('cajero'))->toBeTrue()
        ->and($ana->email_verified_at)->not->toBeNull()
        ->and($ana->can('sales.create'))->toBeTrue()
        ->and($ana->can('products.manage'))->toBeFalse();

    auth()->logout();

    $this->post(route('login.store'), ['login' => 'ana@example.com', 'password' => 'secreto123'])
        ->assertRedirect(route('dashboard'));
    $this->assertAuthenticatedAs($ana);
});

it('un usuario desactivado no puede iniciar sesión y se le cierra la sesión activa', function () {
    $user = User::factory()->create(['password' => 'secreto123']);
    $user->assignRole('cajero');

    $this->actingAs($this->admin)->put(route('admin.users.update', $user), [
        'employee_number' => $user->employee_number, 'name' => $user->name, 'email' => $user->email, 'role' => 'cajero', 'active' => '0',
    ])->assertRedirect();

    expect($user->fresh()->active)->toBeFalse();

    auth()->logout();

    $this->post(route('login.store'), ['login' => $user->email, 'password' => 'secreto123'])
        ->assertSessionHasErrors(['login' => 'Tu usuario está desactivado. Consulta al administrador.']);
    $this->assertGuest();

    // Si ya tenía la sesión abierta, se le saca en la siguiente petición.
    $this->actingAs($user->fresh())->get(route('dashboard'))->assertRedirect(route('login'));
    $this->assertGuest();
});

it('no permite quedarse sin administradores ni desactivarse a sí mismo', function () {
    $this->actingAs($this->admin)->put(route('admin.users.update', $this->admin), [
        'employee_number' => $this->admin->employee_number, 'name' => 'Yo', 'email' => $this->admin->email, 'role' => 'admin', 'active' => '0',
    ])->assertSessionHasErrors('active');

    $this->put(route('admin.users.update', $this->admin), [
        'employee_number' => $this->admin->employee_number, 'name' => 'Yo', 'email' => $this->admin->email, 'role' => 'cajero', 'active' => '1',
    ])->assertSessionHasErrors('role');

    expect($this->admin->fresh()->hasRole('admin'))->toBeTrue();
});

it('cambia la contraseña solo si se captura una nueva', function () {
    $user = User::factory()->create(['password' => 'original123']);
    $user->assignRole('cajero');
    $hash = $user->fresh()->password;

    $this->actingAs($this->admin)->put(route('admin.users.update', $user), [
        'employee_number' => $user->employee_number, 'name' => 'Nuevo nombre', 'email' => $user->email, 'role' => 'encargado', 'active' => '1', 'password' => '',
    ])->assertSessionHasNoErrors();

    $user->refresh();
    expect($user->password)->toBe($hash)
        ->and($user->name)->toBe('Nuevo nombre')
        ->and($user->hasRole('encargado'))->toBeTrue()
        ->and($user->hasRole('cajero'))->toBeFalse();
});

it('solo el admin entra a usuarios y configuración; el encargado administra categorías', function () {
    $manager = User::factory()->create();
    $manager->assignRole('encargado');

    $this->actingAs($manager);
    $this->get(route('admin.users.index'))->assertForbidden();
    $this->get(route('admin.business.edit'))->assertForbidden();
    $this->get(route('admin.branches.index'))->assertForbidden();
    $this->get(route('admin.categories.index'))->assertOk();
});

it('guarda los datos del negocio, el logo y los usa en ticket y menú', function () {
    Storage::fake('public');

    $this->actingAs($this->admin)->post(route('admin.business.update'), [
        'business_name' => 'Abarrotes Lupita',
        'business_rfc' => 'XAXX010101000',
        'ticket_footer' => 'Vuelva pronto',
        'default_tax_rate' => '0',
        'allow_negative_stock' => '0',
        'logo' => UploadedFile::fake()->image('logo.png', 200, 100),
    ])->assertSessionHasNoErrors();

    expect(Setting::get('business_name'))->toBe('Abarrotes Lupita')
        ->and(Setting::get('allow_negative_stock'))->toBe('0')
        ->and(Setting::get('default_tax_rate'))->toBe('0');

    Storage::disk('public')->assertExists(Setting::get('business_logo'));

    $this->get(route('dashboard'))->assertInertia(fn ($page) => $page->where('name', 'Abarrotes Lupita'));
    $this->get(route('products.create'))->assertInertia(fn ($page) => $page->where('defaultTaxRate', '0'));

    $this->post(route('admin.business.update'), [
        'business_name' => 'Abarrotes Lupita', 'default_tax_rate' => '0.16', 'remove_logo' => '1',
    ]);
    expect(Setting::get('business_logo'))->toBeNull();
});

it('administra categorías; al borrar una, sus productos quedan sin categoría', function () {
    $this->actingAs($this->admin)->post(route('admin.categories.store'), ['name' => 'Lácteos'])->assertRedirect();
    $this->post(route('admin.categories.store'), ['name' => 'Lácteos'])->assertSessionHasErrors('name');

    $category = Category::where('name', 'Lácteos')->firstOrFail();
    $product = Product::create(['unit_id' => Unit::first()->id, 'category_id' => $category->id, 'name' => 'Leche', 'cost' => 20, 'price' => 28]);

    $this->delete(route('admin.categories.destroy', $category))->assertRedirect();

    expect($product->fresh()->category_id)->toBeNull();
});

it('crea sucursales con su caja y no deja desactivar una caja con turno abierto', function () {
    $this->actingAs($this->admin)->post(route('admin.branches.store'), ['name' => 'Sucursal Centro'])->assertRedirect();

    $branch = Branch::where('name', 'Sucursal Centro')->firstOrFail();
    expect($branch->cashRegisters()->pluck('name')->all())->toBe(['Caja 1']);

    $this->post(route('admin.registers.store', $branch), ['name' => 'Caja 2'])->assertRedirect();
    $this->post(route('admin.registers.store', $branch), ['name' => 'Caja 2'])->assertSessionHasErrors('name');

    $register = CashRegister::where('branch_id', $branch->id)->where('name', 'Caja 1')->firstOrFail();
    app(OpenCashSession::class)->handle($register, $this->admin, '0');

    $this->put(route('admin.registers.update', $register), ['name' => 'Caja 1', 'active' => '0'])
        ->assertSessionHasErrors('active');
});

it('los mensajes de validación están en español', function () {
    $this->actingAs($this->admin)->post(route('admin.categories.store'), ['name' => ''])
        ->assertSessionHasErrors(['name' => 'El campo nombre es obligatorio.']);
});
