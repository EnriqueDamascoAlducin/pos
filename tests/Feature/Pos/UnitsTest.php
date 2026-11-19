<?php

use App\Models\Product;
use App\Models\Unit;
use App\Models\User;
use Database\Seeders\BaseDataSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;

beforeEach(function () {
    $this->seed([RolesAndPermissionsSeeder::class, BaseDataSeeder::class]);

    $this->admin = User::factory()->create();
    $this->admin->assignRole('admin');

    $this->pza = Unit::where('abbreviation', 'pza')->first();
    $this->cja = Unit::where('abbreviation', 'cja')->first();
    $this->kg = Unit::where('abbreviation', 'kg')->first();
});

function setActive(Unit $unit, bool $active)
{
    return test()->put(route('admin.units.update', $unit), [
        'name' => $unit->name, 'abbreviation' => $unit->abbreviation,
        'allows_decimals' => $unit->allows_decimals ? '1' : '0', 'active' => $active ? '1' : '0',
    ]);
}

it('un negocio de refacciones deja activas solo pieza y caja', function () {
    $this->actingAs($this->admin);

    Unit::whereNotIn('id', [$this->pza->id, $this->cja->id])->get()
        ->each(fn ($u) => setActive($u, false)->assertSessionHasNoErrors());

    $this->get(route('products.create'))->assertInertia(fn ($page) => $page
        ->has('units', 2)
        ->where('units.0.abbreviation', 'cja')
        ->where('units.1.abbreviation', 'pza'));

    // No se puede dar de alta un producto con una unidad desactivada.
    $this->post(route('products.store'), [
        'name' => 'Balata', 'unit_id' => $this->kg->id, 'cost' => 100, 'price' => 150, 'tax_rate' => '0.16',
    ])->assertSessionHasErrors('unit_id');

    $this->post(route('products.store'), [
        'name' => 'Balata', 'unit_id' => $this->cja->id, 'cost' => 100, 'price' => 150, 'tax_rate' => '0.16',
    ])->assertSessionHasNoErrors();
});

it('un producto conserva su unidad aunque se desactive', function () {
    $product = Product::create(['unit_id' => $this->kg->id, 'name' => 'Grasa', 'cost' => 50, 'price' => 80, 'sells_by_weight' => true, 'min_sale_quantity' => '0.1', 'sale_step' => '0.001']);

    $this->actingAs($this->admin);
    setActive($this->kg, false)->assertSessionHasNoErrors();

    $this->get(route('products.edit', $product))->assertInertia(fn ($page) => $page
        ->where('units', fn ($units) => collect($units)->contains('id', $this->kg->id)));

    $this->put(route('products.update', $product), [
        'name' => 'Grasa multiusos', 'unit_id' => $this->kg->id, 'cost' => 50, 'price' => 85, 'tax_rate' => '0.16',
        'sells_by_weight' => '1', 'min_sale_quantity' => '0.1', 'sale_step' => '0.001',
    ])->assertSessionHasNoErrors();
});

it('crea unidades nuevas y valida que no se repitan', function () {
    $this->actingAs($this->admin)->post(route('admin.units.store'), ['name' => 'Juego', 'abbreviation' => 'jgo'])
        ->assertSessionHasNoErrors();

    $juego = Unit::where('abbreviation', 'jgo')->firstOrFail();
    expect($juego->active)->toBeTrue()->and($juego->allows_decimals)->toBeFalse();

    $this->post(route('admin.units.store'), ['name' => 'Juego', 'abbreviation' => 'jg2'])->assertSessionHasErrors('name');
});

it('no deja quedarse sin unidades ni cambiar decimales si ya tiene productos', function () {
    $this->actingAs($this->admin);

    Unit::where('id', '!=', $this->pza->id)->update(['active' => false]);
    setActive($this->pza, false)->assertSessionHasErrors('active');

    Product::create(['unit_id' => $this->pza->id, 'name' => 'Bujía', 'cost' => 30, 'price' => 60]);

    $this->put(route('admin.units.update', $this->pza), [
        'name' => 'Pieza', 'abbreviation' => 'pza', 'allows_decimals' => '1', 'active' => '1',
    ])->assertSessionHasErrors('allows_decimals');
});

it('solo el admin administra unidades', function () {
    $manager = User::factory()->create();
    $manager->assignRole('encargado');

    $this->actingAs($manager)->get(route('admin.units.index'))->assertForbidden();
    $this->actingAs($this->admin)->get(route('admin.units.index'))->assertOk();
});
