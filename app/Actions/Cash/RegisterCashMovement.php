<?php

namespace App\Actions\Cash;

use App\Models\CashMovement;
use App\Models\CashSession;
use App\Models\User;
use Illuminate\Validation\ValidationException;

/**
 * Entrada o salida de efectivo que no es venta (retiro, pago a proveedor, cambio, etc.).
 */
class RegisterCashMovement
{
    public function handle(CashSession $session, User $user, string $type, string $amount, string $reason): CashMovement
    {
        if (! $session->isOpen()) {
            throw ValidationException::withMessages(['cash_session_id' => 'El turno de caja está cerrado.']);
        }

        if (! in_array($type, [CashMovement::TYPE_IN, CashMovement::TYPE_OUT], true)) {
            throw ValidationException::withMessages(['type' => 'Tipo de movimiento inválido.']);
        }

        return $session->movements()->create([
            'user_id' => $user->id,
            'type' => $type,
            'amount' => $amount,
            'reason' => $reason,
        ]);
    }
}
