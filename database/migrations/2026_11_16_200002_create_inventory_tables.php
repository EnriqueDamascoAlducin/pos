<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stocks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->constrained()->cascadeOnDelete();
            $table->decimal('quantity', 12, 3)->default(0);
            $table->timestamps();

            $table->unique(['product_id', 'branch_id']);
        });

        Schema::create('inventory_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained();
            $table->foreignId('branch_id')->constrained();
            $table->foreignId('user_id')->nullable()->constrained();
            $table->string('type', 20); // sale, sale_cancel, purchase, adjustment, transfer_in, transfer_out, return
            $table->decimal('quantity', 12, 3); // positivo entra, negativo sale
            $table->decimal('balance', 12, 3); // existencia después del movimiento
            $table->decimal('cost', 12, 2)->default(0);
            $table->nullableMorphs('reference');
            $table->string('notes')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['product_id', 'branch_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_movements');
        Schema::dropIfExists('stocks');
    }
};
