<?php

namespace App\Actions\Purchases;

use App\Actions\Inventory\RegisterInventoryMovement;
use App\Enums\InventoryMovementType;
use App\Models\Purchase;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Cancela una compra capturada por error: retira de inventario lo que había entrado.
 * El precio de compra de los productos no se revierte (puede haber cambiado después).
 */
class CancelPurchase
{
    public function __construct(private RegisterInventoryMovement $inventory) {}

    public function handle(Purchase $purchase, User $user, string $reason): Purchase
    {
        return DB::transaction(function () use ($purchase, $user, $reason) {
            $purchase = Purchase::query()->with('items.product')->whereKey($purchase->id)->lockForUpdate()->firstOrFail();

            if ($purchase->status === Purchase::STATUS_CANCELLED) {
                throw ValidationException::withMessages(['purchase' => 'La compra ya está cancelada.']);
            }

            foreach ($purchase->items as $item) {
                $this->inventory->handle(
                    product: $item->product,
                    branchId: $purchase->branch_id,
                    type: InventoryMovementType::Adjustment,
                    quantity: '-'.$item->quantity,
                    user: $user,
                    reference: $purchase,
                    cost: (string) $item->cost,
                    notes: "Cancelación de compra #{$purchase->id}: {$reason}",
                );
            }

            $purchase->update([
                'status' => Purchase::STATUS_CANCELLED,
                'notes' => trim(($purchase->notes ? $purchase->notes."\n" : '')."Cancelada: {$reason}"),
            ]);

            return $purchase;
        });
    }
}
