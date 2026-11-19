<?php

namespace App\Actions\Purchases;

use App\Actions\Inventory\RegisterInventoryMovement;
use App\Enums\InventoryMovementType;
use App\Models\Product;
use App\Models\Purchase;
use App\Models\User;
use App\Support\Decimal;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Registra mercancía recibida: crea la compra, suma existencia (kardex)
 * y actualiza el precio de compra de cada producto al último costo.
 */
class ReceivePurchase
{
    public function __construct(private RegisterInventoryMovement $inventory) {}

    /**
     * @param  array<int, array{product_id: int, quantity: string|float|int, cost: string|float|int}>  $items
     * @param  array{supplier_id?: int|null, invoice_number?: string|null, invoice_uuid?: string|null, notes?: string|null, update_costs?: bool}  $data
     */
    public function handle(User $user, int $branchId, array $items, array $data = []): Purchase
    {
        if ($items === []) {
            throw ValidationException::withMessages(['items' => 'La compra no tiene productos.']);
        }

        return DB::transaction(function () use ($user, $branchId, $items, $data) {
            $products = Product::query()
                ->whereIn('id', array_column($items, 'product_id'))
                ->get()
                ->keyBy('id');

            $purchase = Purchase::create([
                'supplier_id' => $data['supplier_id'] ?? null,
                'branch_id' => $branchId,
                'user_id' => $user->id,
                'invoice_number' => $data['invoice_number'] ?? null,
                'invoice_uuid' => $data['invoice_uuid'] ?? null,
                'notes' => $data['notes'] ?? null,
                'status' => Purchase::STATUS_RECEIVED,
                'received_at' => now(),
                'total' => 0,
            ]);

            $total = '0';

            foreach ($items as $i => $item) {
                $product = $products->get($item['product_id'])
                    ?? throw ValidationException::withMessages(["items.$i.product_id" => 'Producto no encontrado.']);

                $quantity = Decimal::round((string) $item['quantity'], 3);
                $cost = Decimal::round((string) $item['cost']);

                if (! Decimal::gt($quantity, '0')) {
                    throw ValidationException::withMessages(["items.$i.quantity" => 'La cantidad debe ser mayor a cero.']);
                }

                if (Decimal::lt($cost, '0')) {
                    throw ValidationException::withMessages(["items.$i.cost" => 'El costo no puede ser negativo.']);
                }

                $lineTotal = Decimal::mul($cost, $quantity);
                $total = Decimal::add($total, $lineTotal);

                $purchase->items()->create([
                    'product_id' => $product->id,
                    'quantity' => $quantity,
                    'cost' => $cost,
                    'total' => $lineTotal,
                ]);

                $this->inventory->handle(
                    product: $product,
                    branchId: $branchId,
                    type: InventoryMovementType::Purchase,
                    quantity: $quantity,
                    user: $user,
                    reference: $purchase,
                    cost: $cost,
                    notes: $purchase->invoice_number ? "Factura {$purchase->invoice_number}" : null,
                );

                if ($data['update_costs'] ?? true) {
                    $product->update(['cost' => $cost]);
                }
            }

            $purchase->update(['total' => $total]);

            return $purchase->load('items.product', 'supplier');
        });
    }
}
