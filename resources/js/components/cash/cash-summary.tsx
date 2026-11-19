import { formatMoney } from '@/lib/format';
import { paymentLabels } from '@/types/cash';
import type { CashMovementRow, CashSummary } from '@/types/cash';

function Row({
    label,
    value,
    strong,
    className = '',
}: {
    label: string;
    value: string;
    strong?: boolean;
    className?: string;
}) {
    return (
        <div
            className={`flex justify-between py-1 ${strong ? 'font-semibold' : ''} ${className}`}
        >
            <span className={strong ? '' : 'text-muted-foreground'}>
                {label}
            </span>
            <span className="tabular-nums">{value}</span>
        </div>
    );
}

export function CashSummaryCard({ summary }: { summary: CashSummary }) {
    return (
        <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-xl border p-4 text-sm">
                <h2 className="mb-2 font-medium">Ventas del turno</h2>
                <Row label="Ventas" value={String(summary.sales_count)} />
                <Row
                    label="Canceladas"
                    value={String(summary.cancelled_count)}
                />
                {Object.entries(summary.sales_by_method).map(
                    ([method, amount]) => (
                        <Row
                            key={method}
                            label={paymentLabels[method]}
                            value={formatMoney(amount)}
                        />
                    ),
                )}
                <Row
                    label="Total vendido"
                    value={formatMoney(summary.sales_total)}
                    strong
                    className="mt-1 border-t pt-2"
                />
            </section>

            <section className="rounded-xl border p-4 text-sm">
                <h2 className="mb-2 font-medium">Efectivo en caja</h2>
                <Row
                    label="Fondo inicial"
                    value={formatMoney(summary.opening_amount)}
                />
                <Row
                    label="+ Ventas en efectivo"
                    value={formatMoney(summary.sales_by_method.cash)}
                />
                <Row
                    label="+ Abonos de clientes"
                    value={formatMoney(summary.customer_payments_cash)}
                />
                <Row label="+ Entradas" value={formatMoney(summary.cash_in)} />
                <Row label="− Salidas" value={formatMoney(summary.cash_out)} />
                <Row
                    label="Efectivo esperado"
                    value={formatMoney(summary.expected_cash)}
                    strong
                    className="mt-1 border-t pt-2"
                />
            </section>
        </div>
    );
}

export function CashMovementsTable({
    movements,
}: {
    movements: CashMovementRow[];
}) {
    if (movements.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                Sin entradas ni salidas de efectivo.
            </p>
        );
    }

    return (
        <table className="w-full text-sm">
            <tbody>
                {movements.map((m) => (
                    <tr key={m.id} className="border-t first:border-t-0">
                        <td className="py-1.5 text-muted-foreground">
                            {new Date(m.created_at).toLocaleTimeString(
                                'es-MX',
                                { hour: '2-digit', minute: '2-digit' },
                            )}
                        </td>
                        <td className="py-1.5">{m.reason}</td>
                        <td
                            className={`py-1.5 text-right tabular-nums ${m.type === 'in' ? 'text-green-700 dark:text-green-500' : 'text-red-600'}`}
                        >
                            {m.type === 'in' ? '+' : '−'}
                            {formatMoney(m.amount)}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
