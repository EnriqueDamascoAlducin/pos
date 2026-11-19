<?php

use App\Actions\Cash\CloseCashSession;
use App\Actions\Cash\OpenCashSession;
use App\Actions\Inventory\RegisterInventoryMovement;
use App\Actions\Sales\CancelSale;
use App\Actions\Sales\CreateSale;
use App\Enums\InventoryMovementType;
use App\Models\CashRegister;
use App\Models\Category;
use App\Models\Product;
use App\Models\Unit;
use App\Models\User;
use App\Queries\SalesReport;
use Carbon\CarbonImmutable;
use Database\Seeders\BaseDataSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Support\Facades\DB;

beforeEach(function () {
    $this->travelTo(CarbonImmutable::parse('2026-11-10 12:00:00'));
    $this->seed([RolesAndPermissionsSeeder::class, BaseDataSeeder::class]);

    $this->register = CashRegister::first();
    $this->cashier = User::factory()->create(['name' => 'Ana', 'branch_id' => $this->register->branch_id]);
    $this->cashier->assignRole('cajero');
    $this->admin = User::factory()->create();
    $this->admin->assignRole('admin');

    $drinks = Category::create(['name' => 'Bebidas']);
    $unit = Unit::first()->id;
    $this->soda = Product::create(['unit_id' => $unit, 'category_id' => $drinks->id, 'sku' => 'REF', 'name' => 'Refresco', 'cost' => 12, 'price' => 18]);
    $this->rice = Product::create(['unit_id' => $unit, 'sku' => 'ARR', 'name' => 'Arroz', 'cost' => 20, 'price' => 30]);

    DB::transaction(function () {
        foreach ([$this->soda, $this->rice] as $p) {
            app(RegisterInventoryMovement::class)->handle($p, $this->register->branch_id, InventoryMovementType::Adjustment, '100');
        }
    });

    $this->session = app(OpenCashSession::class)->handle($this->register, $this->cashier, '500');
});

function sell($test, array $items, array $payments)
{
    return app(CreateSale::class)->handle($test->cashier, $test->session, $items, $payments);
}

it('resume ventas, utilidad, formas de pago, cajeros, productos y categorías', function () {
    // Día 10: 3 refrescos en efectivo (54) y 2 arroces con tarjeta (60)
    sell($this, [['product_id' => $this->soda->id, 'quantity' => 3]], [['method' => 'cash', 'amount' => '100']]);
    sell($this, [['product_id' => $this->rice->id, 'quantity' => 2]], [['method' => 'card', 'amount' => '60']]);

    // Día 11: 1 arroz en efectivo (30) + una venta cancelada
    $this->travelTo(CarbonImmutable::parse('2026-11-11 10:00:00'));
    sell($this, [['product_id' => $this->rice->id, 'quantity' => 1]], [['method' => 'cash', 'amount' => '30']]);
    $cancelled = sell($this, [['product_id' => $this->soda->id, 'quantity' => 10]], [['method' => 'cash', 'amount' => '180']]);
    app(CancelSale::class)->handle($cancelled, $this->admin, 'Error');

    $report = new SalesReport(CarbonImmutable::parse('2026-11-09'), CarbonImmutable::parse('2026-11-11'));
    $summary = $report->summary();

    // Total 144; costo 36 + 40 + 20 = 96; utilidad 48
    expect($summary)->toMatchArray([
        'count' => 3,
        'total' => '144.00',
        'cost' => '96.00',
        'profit' => '48.00',
        'margin' => '33.3',
        'average_ticket' => '48.00',
        'cancelled_count' => 1,
        'cancelled_total' => '180.00',
    ]);

    expect($report->byDay())->toBe([
        ['date' => '2026-11-09', 'count' => 0, 'total' => '0.00', 'profit' => '0.00'],
        ['date' => '2026-11-10', 'count' => 2, 'total' => '114.00', 'profit' => '38.00'],
        ['date' => '2026-11-11', 'count' => 1, 'total' => '30.00', 'profit' => '10.00'],
    ]);

    expect(collect($report->byPaymentMethod())->pluck('total', 'method')->all())
        ->toBe(['cash' => '84.00', 'card' => '60.00']);

    expect($report->byCashier())->toBe([['user' => 'Ana', 'count' => 3, 'total' => '144.00', 'profit' => '48.00']]);

    expect($report->products())->toMatchArray([
        ['product_id' => $this->rice->id, 'name' => 'Arroz', 'code' => 'ARR', 'quantity' => '3.000', 'total' => '90.00', 'cost' => '60.00', 'profit' => '30.00'],
        ['product_id' => $this->soda->id, 'name' => 'Refresco', 'code' => 'REF', 'quantity' => '3.000', 'total' => '54.00', 'cost' => '36.00', 'profit' => '18.00'],
    ]);

    expect(collect($report->byCategory())->pluck('total', 'category')->all())
        ->toBe(['Sin categoría' => '90.00', 'Bebidas' => '54.00']);
});

it('la utilidad usa el costo del momento de la venta aunque después cambie', function () {
    sell($this, [['product_id' => $this->soda->id, 'quantity' => 1]], [['method' => 'cash', 'amount' => '18']]);
    $this->soda->update(['cost' => 17]);

    $summary = (new SalesReport(CarbonImmutable::today(), CarbonImmutable::today()))->summary();

    expect($summary['profit'])->toBe('6.00');
});

it('muestra el reporte, exporta CSV y respeta permisos', function () {
    sell($this, [['product_id' => $this->soda->id, 'quantity' => 2]], [['method' => 'cash', 'amount' => '36']]);

    $this->actingAs($this->admin)
        ->get(route('reports.sales', ['from' => '2026-11-01', 'to' => '2026-11-10']))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('reports/sales')
            ->where('summary.total', '36.00')
            ->has('byDay', 10)
            ->where('byPaymentMethod.0.label', 'Efectivo')
            ->has('topProducts', 1));

    $csv = $this->get(route('reports.sales.export', ['from' => '2026-11-10', 'to' => '2026-11-10', 'type' => 'sales']))
        ->assertOk()
        ->assertHeader('content-type', 'text/csv; charset=UTF-8')
        ->streamedContent();

    expect($csv)->toStartWith("\xEF\xBB\xBF")
        ->toContain('Folio,Fecha,Cajero')
        ->toContain('Ana')
        ->toContain('36.00')
        ->toContain('Efectivo');

    $products = $this->get(route('reports.sales.export', ['from' => '2026-11-10', 'to' => '2026-11-10', 'type' => 'products']))
        ->streamedContent();
    expect($products)->toContain('REF,Refresco,2.000,36.00,24.00,12.00');

    $this->actingAs($this->cashier)->get(route('reports.sales'))->assertForbidden();
    $this->actingAs($this->cashier)->get(route('reports.sales.export'))->assertForbidden();
});

it('lista los cortes con faltantes y sobrantes', function () {
    sell($this, [['product_id' => $this->soda->id, 'quantity' => 1]], [['method' => 'cash', 'amount' => '18']]);
    app(CloseCashSession::class)->handle($this->session, '510'); // esperado 518 → faltan 8

    $this->actingAs($this->admin)
        ->get(route('reports.cash-sessions', ['from' => '2026-11-10', 'to' => '2026-11-10']))
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('reports/cash-sessions')
            ->has('sessions.data', 1)
            ->where('sessions.data.0.difference', '-8.00')
            ->where('totals.shortage', '-8.00')
            ->where('totals.with_difference', 1));
});
