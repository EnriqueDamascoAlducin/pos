<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('units', function (Blueprint $table) {
            // Solo las unidades activas se ofrecen al dar de alta productos.
            $table->boolean('active')->default(true)->after('allows_decimals');
        });
    }

    public function down(): void
    {
        Schema::table('units', fn (Blueprint $table) => $table->dropColumn('active'));
    }
};
