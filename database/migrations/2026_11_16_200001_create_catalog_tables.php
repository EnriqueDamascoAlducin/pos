<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->timestamps();
        });

        Schema::create('units', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('abbreviation', 10);
            $table->boolean('allows_decimals')->default(false);
            $table->timestamps();
        });

        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->foreignId('category_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('unit_id')->constrained();
            $table->string('sku')->nullable()->unique();
            $table->string('barcode')->nullable()->unique();
            $table->string('name')->index();
            $table->text('description')->nullable();
            $table->decimal('cost', 12, 2)->default(0);
            $table->decimal('price', 12, 2);
            $table->decimal('wholesale_price', 12, 2)->nullable();
            $table->decimal('wholesale_min_quantity', 12, 3)->nullable();
            $table->decimal('tax_rate', 5, 4)->default(0.16);
            $table->boolean('price_includes_tax')->default(true);
            $table->decimal('min_stock', 12, 3)->default(0);
            $table->boolean('tracks_inventory')->default(true);
            $table->boolean('sells_by_weight')->default(false);
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('products');
        Schema::dropIfExists('units');
        Schema::dropIfExists('categories');
    }
};
