<?php

namespace App\Actions\Cash;

use App\Enums\PaymentMethod;
use App\Enums\SaleStatus;
use App\Models\CashMovement;
use App\Models\CashSession;
use App\Models\CustomerPayment;
use App\Models\SalePayment;
use App\Support\Decimal;

/**
 * Resumen del turno para el corte de caja.
 */
class CalculateCashSessionSummary
{
    /**
     * @return array{
     *     opening_amount: string,
     *     sales_count: int,
     *     cancelled_count: int,
     *     sales_total: string,
     *     sales_by_method: array<string, string>,
     *     customer_payments_cash: string,
     *     cash_in: string,
     *     cash_out: string,
     *     expected_cash: string,
     * }
     */
    public function handle(CashSession $session): array
    {
        $completedSales = $session->sales()->where('status', SaleStatus::Completed);

        $byMethod = SalePayment::query()
            ->whereIn('sale_id', (clone $completedSales)->select('id'))
            ->selectRaw('method, SUM(amount) as total')
            ->groupBy('method')
            ->pluck('total', 'method');

        $salesByMethod = [];
        foreach (PaymentMethod::cases() as $method) {
            $salesByMethod[$method->value] = Decimal::round((string) ($byMethod[$method->value] ?? '0'));
        }

        $customerPaymentsCash = Decimal::round((string) CustomerPayment::query()
            ->where('cash_session_id', $session->id)
            ->where('method', PaymentMethod::Cash)
            ->sum('amount'));

        $cashIn = Decimal::round((string) $session->movements()->where('type', CashMovement::TYPE_IN)->sum('amount'));
        $cashOut = Decimal::round((string) $session->movements()->where('type', CashMovement::TYPE_OUT)->sum('amount'));

        $expectedCash = Decimal::sub(
            Decimal::add(
                (string) $session->opening_amount,
                $salesByMethod[PaymentMethod::Cash->value],
                $customerPaymentsCash,
                $cashIn,
            ),
            $cashOut,
        );

        return [
            'opening_amount' => Decimal::round((string) $session->opening_amount),
            'sales_count' => (clone $completedSales)->count(),
            'cancelled_count' => $session->sales()->where('status', SaleStatus::Cancelled)->count(),
            'sales_total' => Decimal::round((string) (clone $completedSales)->sum('total')),
            'sales_by_method' => $salesByMethod,
            'customer_payments_cash' => $customerPaymentsCash,
            'cash_in' => $cashIn,
            'cash_out' => $cashOut,
            'expected_cash' => $expectedCash,
        ];
    }
}
