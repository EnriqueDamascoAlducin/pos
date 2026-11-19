<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\CashRegister;
use App\Models\Category;
use App\Models\Setting;
use App\Models\Unit;
use Illuminate\Database\Seeder;

/**
 * Catálogos mínimos para que una instalación nueva pueda vender. Es idempotente.
 */
class BaseDataSeeder extends Seeder
{
    public function run(): void
    {
        foreach ([
            ['name' => 'Pieza', 'abbreviation' => 'pza', 'allows_decimals' => false],
            ['name' => 'Kilogramo', 'abbreviation' => 'kg', 'allows_decimals' => true],
            ['name' => 'Litro', 'abbreviation' => 'l', 'allows_decimals' => true],
            ['name' => 'Metro', 'abbreviation' => 'm', 'allows_decimals' => true],
            ['name' => 'Caja', 'abbreviation' => 'cja', 'allows_decimals' => false],
            ['name' => 'Servicio', 'abbreviation' => 'srv', 'allows_decimals' => false],
        ] as $unit) {
            Unit::firstOrCreate(['abbreviation' => $unit['abbreviation']], $unit);
        }

        Category::firstOrCreate(['name' => 'General']);

        $branch = Branch::firstOrCreate(['name' => 'Matriz']);
        CashRegister::firstOrCreate(['branch_id' => $branch->id, 'name' => 'Caja 1']);

        $defaults = [
            'business_name' => config('app.name'),
            'business_address' => null,
            'business_phone' => null,
            'business_rfc' => null,
            'ticket_footer' => '¡Gracias por su compra!',
            'default_tax_rate' => '0.16',
            'allow_negative_stock' => '0',
            'currency_symbol' => '$',
        ];

        foreach ($defaults as $key => $value) {
            if (! Setting::query()->where('key', $key)->exists()) {
                Setting::set($key, $value);
            }
        }
    }
}
