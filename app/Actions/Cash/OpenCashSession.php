<?php

namespace App\Actions\Cash;

use App\Models\CashRegister;
use App\Models\CashSession;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class OpenCashSession
{
    public function handle(CashRegister $register, User $user, string $openingAmount = '0'): CashSession
    {
        return DB::transaction(function () use ($register, $user, $openingAmount) {
            CashRegister::query()->whereKey($register->id)->lockForUpdate()->first();

            if (CashSession::query()->where('cash_register_id', $register->id)->whereNull('closed_at')->exists()) {
                throw ValidationException::withMessages([
                    'cash_register_id' => "La caja \"{$register->name}\" ya tiene un turno abierto.",
                ]);
            }

            if (CashSession::query()->where('user_id', $user->id)->whereNull('closed_at')->exists()) {
                throw ValidationException::withMessages([
                    'cash_register_id' => 'Ya tienes un turno abierto en otra caja.',
                ]);
            }

            return CashSession::create([
                'cash_register_id' => $register->id,
                'user_id' => $user->id,
                'opened_at' => now(),
                'opening_amount' => $openingAmount,
            ]);
        });
    }
}
