<?php

namespace App\Actions\Customers;

use App\Enums\PaymentMethod;
use App\Models\Customer;
use App\Models\CustomerPayment;
use App\Models\User;
use App\Support\Decimal;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Abono de un cliente a su cuenta de crédito.
 * El abono queda ligado al turno de caja abierto del usuario; si es en efectivo,
 * entra en el efectivo esperado del corte. El efectivo exige turno abierto.
 */
class RegisterCustomerPayment
{
    public function handle(Customer $customer, User $user, PaymentMethod $method, string $amount, ?string $reference = null): CustomerPayment
    {
        if ($method === PaymentMethod::Credit) {
            throw ValidationException::withMessages(['method' => 'Un abono no puede pagarse a crédito.']);
        }

        $amount = Decimal::round($amount);

        if (! Decimal::gt($amount, '0')) {
            throw ValidationException::withMessages(['amount' => 'El monto debe ser mayor a cero.']);
        }

        $session = $user->openCashSession();

        if ($method === PaymentMethod::Cash && ! $session) {
            throw ValidationException::withMessages(['method' => 'Para recibir efectivo necesitas un turno de caja abierto.']);
        }

        return DB::transaction(function () use ($customer, $user, $method, $amount, $reference, $session) {
            $customer = Customer::query()->whereKey($customer->id)->lockForUpdate()->firstOrFail();

            if (Decimal::gt($amount, (string) $customer->balance)) {
                throw ValidationException::withMessages([
                    'amount' => "El abono excede el saldo del cliente (\${$customer->balance}).",
                ]);
            }

            $payment = CustomerPayment::create([
                'customer_id' => $customer->id,
                'cash_session_id' => $session?->id,
                'user_id' => $user->id,
                'method' => $method,
                'amount' => $amount,
                'reference' => $reference,
            ]);

            $customer->update(['balance' => Decimal::sub((string) $customer->balance, $amount)]);

            return $payment;
        });
    }
}
