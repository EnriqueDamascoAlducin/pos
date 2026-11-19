import { Head, Link } from '@inertiajs/react';
import { Printer } from 'lucide-react';
import CashSessionController from '@/actions/App/Http/Controllers/CashSessionController';
import {
    CashMovementsTable,
    CashSummaryCard,
} from '@/components/cash/cash-summary';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/format';
import type {
    CashMovementRow,
    CashSessionData,
    CashSummary,
} from '@/types/cash';

type Props = {
    session: CashSessionData;
    summary: CashSummary;
    movements: CashMovementRow[];
    businessName: string;
};

export default function CashShow({
    session,
    summary,
    movements,
    businessName,
}: Props) {
    const diff = Number(session.difference ?? 0);

    return (
        <>
            <Head title={`Corte de caja #${session.id}`} />
            <div className="flex flex-1 flex-col gap-6 p-4 print:p-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <p className="text-sm text-muted-foreground">
                            {businessName}
                        </p>
                        <h1 className="text-xl font-semibold">
                            Corte de caja #{session.id} · {session.register}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {session.user} ·{' '}
                            {new Date(session.opened_at).toLocaleString(
                                'es-MX',
                            )}
                            {session.closed_at &&
                                ` — ${new Date(session.closed_at).toLocaleString('es-MX')}`}
                        </p>
                    </div>
                    <div className="flex gap-2 print:hidden">
                        <Button
                            variant="outline"
                            onClick={() => window.print()}
                        >
                            <Printer /> Imprimir
                        </Button>
                        <Button asChild>
                            <Link href={CashSessionController.create()}>
                                Abrir nuevo turno
                            </Link>
                        </Button>
                    </div>
                </div>

                <CashSummaryCard summary={summary} />

                {session.closed_at && (
                    <section className="grid gap-4 rounded-xl border p-4 sm:grid-cols-3">
                        <div>
                            <div className="text-sm text-muted-foreground">
                                Efectivo esperado
                            </div>
                            <div className="text-2xl font-semibold tabular-nums">
                                {formatMoney(session.expected_amount)}
                            </div>
                        </div>
                        <div>
                            <div className="text-sm text-muted-foreground">
                                Efectivo contado
                            </div>
                            <div className="text-2xl font-semibold tabular-nums">
                                {formatMoney(session.counted_amount)}
                            </div>
                        </div>
                        <div>
                            <div className="text-sm text-muted-foreground">
                                Diferencia
                            </div>
                            <div
                                className={`text-2xl font-semibold tabular-nums ${diff === 0 ? 'text-green-700 dark:text-green-500' : 'text-red-600'}`}
                            >
                                {diff > 0 ? '+' : ''}
                                {formatMoney(diff)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                                {diff === 0
                                    ? 'Cuadra'
                                    : diff > 0
                                      ? 'Sobrante'
                                      : 'Faltante'}
                            </div>
                        </div>
                        {session.notes && (
                            <p className="text-sm sm:col-span-3">
                                <span className="text-muted-foreground">
                                    Notas:{' '}
                                </span>
                                {session.notes}
                            </p>
                        )}
                    </section>
                )}

                <section className="rounded-xl border p-4">
                    <h2 className="mb-3 font-medium">
                        Entradas y salidas de efectivo
                    </h2>
                    <CashMovementsTable movements={movements} />
                </section>
            </div>
        </>
    );
}

CashShow.layout = {
    breadcrumbs: [{ title: 'Corte de caja', href: '#' }],
};
