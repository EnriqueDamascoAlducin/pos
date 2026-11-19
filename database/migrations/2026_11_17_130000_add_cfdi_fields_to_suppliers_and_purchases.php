<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('suppliers', function (Blueprint $table) {
            // Para reconocer al proveedor al importar sus facturas.
            $table->string('rfc', 13)->nullable()->unique()->after('name');
        });

        Schema::table('purchases', function (Blueprint $table) {
            // UUID (folio fiscal) de la factura importada: evita registrar la misma factura dos veces.
            $table->string('invoice_uuid', 36)->nullable()->unique()->after('invoice_number');
        });
    }

    public function down(): void
    {
        Schema::table('purchases', function (Blueprint $table) {
            $table->dropUnique(['invoice_uuid']);
            $table->dropColumn('invoice_uuid');
        });

        Schema::table('suppliers', function (Blueprint $table) {
            $table->dropUnique(['rfc']);
            $table->dropColumn('rfc');
        });
    }
};
