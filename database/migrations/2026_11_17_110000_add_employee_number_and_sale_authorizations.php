<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Número con el que el usuario inicia sesión y con el que un encargado autoriza.
            $table->string('employee_number', 20)->nullable()->unique()->after('id');
            // Muchos cajeros no tienen correo: entran con su número.
            $table->string('email')->nullable()->change();
        });

        // Los usuarios que ya existían reciben su id como número, para que puedan entrar.
        DB::table('users')->whereNull('employee_number')->update(['employee_number' => DB::raw('id')]);

        Schema::table('sales', function (Blueprint $table) {
            // Encargado que autorizó descuentos o cambios de precio en esta venta.
            $table->foreignId('authorized_by')->nullable()->after('user_id')->constrained('users');
        });

        Schema::table('sale_items', function (Blueprint $table) {
            // Precio de lista cuando el precio se cambió al cobrar (null = no hubo cambio).
            $table->decimal('list_price', 12, 2)->nullable()->after('price');
        });
    }

    public function down(): void
    {
        Schema::table('sale_items', fn (Blueprint $table) => $table->dropColumn('list_price'));
        Schema::table('sales', fn (Blueprint $table) => $table->dropConstrainedForeignId('authorized_by'));
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['employee_number']);
            $table->dropColumn('employee_number');
        });
    }
};
