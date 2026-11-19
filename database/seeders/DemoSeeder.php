<?php

namespace Database\Seeders;

use App\Actions\Inventory\RegisterInventoryMovement;
use App\Enums\InventoryMovementType;
use App\Models\Branch;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Product;
use App\Models\Unit;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Datos de ejemplo para desarrollo. No se usa en instalaciones de clientes.
 */
class DemoSeeder extends Seeder
{
    public function run(RegisterInventoryMovement $inventory): void
    {
        $pza = Unit::where('abbreviation', 'pza')->first();
        $kg = Unit::where('abbreviation', 'kg')->first();
        $branch = Branch::first();

        $abarrotes = Category::firstOrCreate(['name' => 'Abarrotes']);
        $bebidas = Category::firstOrCreate(['name' => 'Bebidas']);

        $products = [
            ['barcode' => '7501055300075', 'name' => 'Refresco cola 600 ml', 'category_id' => $bebidas->id, 'unit_id' => $pza->id, 'cost' => '12.50', 'price' => '18.00', 'wholesale_price' => '16.50', 'wholesale_min_quantity' => '12'],
            ['barcode' => '7501000111206', 'name' => 'Agua natural 1 L', 'category_id' => $bebidas->id, 'unit_id' => $pza->id, 'cost' => '7.00', 'price' => '12.00'],
            ['barcode' => '7501030411109', 'name' => 'Galletas María 170 g', 'category_id' => $abarrotes->id, 'unit_id' => $pza->id, 'cost' => '11.00', 'price' => '17.50'],
            ['barcode' => '7501058633507', 'name' => 'Aceite vegetal 1 L', 'category_id' => $abarrotes->id, 'unit_id' => $pza->id, 'cost' => '32.00', 'price' => '45.00'],
            ['sku' => 'FRIJOL-KG', 'name' => 'Frijol a granel', 'category_id' => $abarrotes->id, 'unit_id' => $kg->id, 'cost' => '24.00', 'price' => '36.00', 'tax_rate' => '0', 'sells_by_weight' => true, 'min_sale_quantity' => '0.1', 'sale_step' => '0.001'],
            ['sku' => 'AZUCAR-KG', 'name' => 'Azúcar estándar', 'category_id' => $abarrotes->id, 'unit_id' => $kg->id, 'cost' => '22.00', 'price' => '32.00', 'tax_rate' => '0', 'sells_by_weight' => true, 'min_sale_quantity' => '0.25', 'sale_step' => '0.25'],
            ['sku' => 'CEPILLO', 'name' => 'Cepillo dental', 'category_id' => $abarrotes->id, 'unit_id' => $pza->id, 'cost' => '15.00', 'price' => '25.00'],
            ['sku' => 'HUEVO-PZA', 'name' => 'Huevo blanco (pieza)', 'category_id' => $abarrotes->id, 'unit_id' => $pza->id, 'cost' => '2.50', 'price' => '3.50', 'tax_rate' => '0', 'min_sale_quantity' => '6', 'sale_step' => '6'],
        ];

        DB::transaction(function () use ($products, $branch, $inventory) {
            foreach ($products as $data) {
                $product = Product::firstOrCreate(
                    isset($data['barcode']) ? ['barcode' => $data['barcode']] : ['sku' => $data['sku']],
                    $data + ['min_stock' => 5],
                );

                if ($product->wasRecentlyCreated) {
                    $inventory->handle($product, $branch->id, InventoryMovementType::Adjustment, '50', notes: 'Inventario inicial');
                }
            }
        });

        Customer::firstOrCreate(['name' => 'Público en general']);
        Customer::firstOrCreate(['name' => 'Juan Pérez'], ['phone' => '5555555555', 'credit_limit' => '2000']);
    }
}
