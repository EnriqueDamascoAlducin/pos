<?php

namespace App\Actions\Cash;

use App\Models\CashSession;
use App\Support\Decimal;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Corte de caja: compara el efectivo esperado contra el contado y cierra el turno.
 */
class CloseCashSession
{
    public function __construct(private CalculateCashSessionSummary $summary) {}

    public function handle(CashSession $session, string $countedAmount, ?string $notes = null): CashSession
    {
        return DB::transaction(function () use ($session, $countedAmount, $notes) {
            $session = CashSession::query()->whereKey($session->id)->lockForUpdate()->firstOrFail();

            if (! $session->isOpen()) {
                throw ValidationException::withMessages(['cash_session_id' => 'El turno ya fue cerrado.']);
            }

            $expected = $this->summary->handle($session)['expected_cash'];

            $session->update([
                'closed_at' => now(),
                'expected_amount' => $expected,
                'counted_amount' => Decimal::round($countedAmount),
                'difference' => Decimal::sub($countedAmount, $expected),
                'notes' => $notes,
            ]);

            return $session;
        });
    }
}
