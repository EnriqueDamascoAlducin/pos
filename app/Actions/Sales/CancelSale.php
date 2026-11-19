<?php

namespace App\Actions\Sales;

use App\Actions\Inventory\RegisterInventoryMovement;
use App\Enums\InventoryMovementType;
use App\Enums\PaymentMethod;
use App\Enums\SaleStatus;
use App\Models\Customer;
use App\Models\Sale;
use App\Models\User;
use App\Support\Decimal;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Cancela una venta completa: regresa inventario y revierte el crédito del cliente.
 * Solo se permite mientras el turno de la venta siga abierto, para que el corte cuadre.
 * (Para ventas de turnos ya cerrados, implementar devoluciones como operación aparte.)
 */
class CancelSale
{
    public function __construct(private RegisterInventoryMovement $inventory) {}

    public function handle(Sale $sale, User $user, string $reason): Sale
    {
        return DB::transaction(function () use ($sale, $user, $reason) {
            $sale = Sale::query()->with('items.product', 'payments', 'cashSession')
                ->whereKey($sale->id)->lockForUpdate()->firstOrFail();

            if ($sale->status === SaleStatus::Cancelled) {
                throw ValidationException::withMessages(['sale' => 'La venta ya está cancelada.']);
            }

            if (! $sale->cashSession->isOpen()) {
                throw ValidationException::withMessages(['sale' => 'El turno de esta venta ya fue cerrado; registra una devolución.']);
            }

            foreach ($sale->items as $item) {
                $this->inventory->handle(
                    product: $item->product,
                    branchId: $sale->branch_id,
                    type: InventoryMovementType::SaleCancel,
                    quantity: (string) $item->quantity,
                    user: $user,
                    reference: $sale,
                    cost: (string) $item->cost,
                    notes: $reason,
                );
            }

            $credit = $sale->payments->where('method', PaymentMethod::Credit)->sum('amount');
            if ($sale->customer_id && Decimal::gt((string) $credit, '0')) {
                $customer = Customer::query()->whereKey($sale->customer_id)->lockForUpdate()->firstOrFail();
                $customer->update(['balance' => Decimal::sub((string) $customer->balance, (string) $credit)]);
            }

            $sale->update([
                'status' => SaleStatus::Cancelled,
                'cancelled_at' => now(),
                'cancelled_by' => $user->id,
                'cancel_reason' => $reason,
            ]);

            return $sale;
        });
    }
}
