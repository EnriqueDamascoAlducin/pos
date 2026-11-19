<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            // Cantidad mínima que se puede vender en una partida.
            $table->decimal('min_sale_quantity', 12, 3)->default(1)->after('min_stock');
            // La cantidad vendida debe ser múltiplo de este valor (1 = piezas enteras).
            $table->decimal('sale_step', 12, 3)->default(1)->after('min_sale_quantity');
        });

        // Los productos a granel que ya existan se pueden seguir vendiendo en fracciones.
        DB::table('products')->where('sells_by_weight', true)->update([
            'min_sale_quantity' => '0.1',
            'sale_step' => '0.001',
        ]);
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn(['min_sale_quantity', 'sale_step']);
        });
    }
};
