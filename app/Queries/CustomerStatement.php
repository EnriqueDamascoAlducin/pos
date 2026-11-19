<?php

namespace App\Queries;

use App\Enums\PaymentMethod;
use App\Enums\SaleStatus;
use App\Models\Customer;
use App\Support\Decimal;
use Illuminate\Support\Facades\DB;

/**
 * Estado de cuenta: cargos (ventas a crédito vigentes) y abonos, con saldo acumulado.
 * Las ventas canceladas no aparecen porque su cancelación ya revirtió el saldo.
 */
class CustomerStatement
{
    /**
     * @return list<array{date: string, type: string, concept: string, reference_id: int, charge: string, payment: string, balance: string}>
     */
    public function handle(Customer $customer): array
    {
        $charges = DB::table('sale_payments')
            ->join('sales', 'sales.id', '=', 'sale_payments.sale_id')
            ->where('sales.customer_id', $customer->id)
            ->where('sales.status', SaleStatus::Completed->value)
            ->where('sale_payments.method', PaymentMethod::Credit->value)
            ->get(['sales.id', 'sales.folio', 'sales.created_at', 'sale_payments.amount'])
            ->map(fn ($r) => [
                'date' => (string) $r->created_at,
                'type' => 'charge',
                'concept' => "Venta folio {$r->folio}",
                'reference_id' => (int) $r->id,
                'amount' => (string) $r->amount,
            ]);

        $payments = $customer->payments()
            ->with('user:id,name')
            ->get()
            ->map(fn ($p) => [
                'date' => (string) $p->created_at,
                'type' => 'payment',
                'concept' => 'Abono ('.$p->method->label().')'.($p->reference ? " · {$p->reference}" : ''),
                'reference_id' => $p->id,
                'amount' => (string) $p->amount,
            ]);

        $balance = '0';

        return $charges->concat($payments)
            ->sortBy([['date', 'asc'], ['type', 'asc']])
            ->values()
            ->map(function ($row) use (&$balance) {
                $isCharge = $row['type'] === 'charge';
                $balance = $isCharge ? Decimal::add($balance, $row['amount']) : Decimal::sub($balance, $row['amount']);

                return [
                    'date' => $row['date'],
                    'type' => $row['type'],
                    'concept' => $row['concept'],
                    'reference_id' => $row['reference_id'],
                    'charge' => $isCharge ? Decimal::round($row['amount']) : '0.00',
                    'payment' => $isCharge ? '0.00' : Decimal::round($row['amount']),
                    'balance' => $balance,
                ];
            })
            ->all();
    }
}
