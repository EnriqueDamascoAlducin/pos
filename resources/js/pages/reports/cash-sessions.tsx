import { Head, Link, router } from '@inertiajs/react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import CashSessionController from '@/actions/App/Http/Controllers/CashSessionController';
import ReportController from '@/actions/App/Http/Controllers/ReportController';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatMoney } from '@/lib/format';
import type { Paginated } from '@/types/pos';

type SessionRow = {
    id: number;
    register: string;
    branch: string;
    user: string;
    opened_at: string;
    closed_at: string | null;
    opening_amount: string;
    expected_amount: string | null;
    counted_amount: string | null;
    difference: string | null;
};

type Props = {
    sessions: Paginated<SessionRow>;
    totals: { shortage: string; surplus: string; with_difference: number };
    filters: { from: string; to: string };
};

const fmt = (d: string) =>
    new Date(d).toLocaleString('es-MX', {
        dateStyle: 'short',
        timeStyle: 'short',
    });

export default function CashSessionsReport({
    sessions,
    totals,
    filters,
}: Props) {
    const apply = (patch: Partial<Props['filters']>) =>
        router.get(
            ReportController.cashSessions.url(),
            { ...filters, ...patch },
            { preserveState: true, replace: true },
        );

    return (
        <>
            <Head title="Cortes de caja" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h1 className="text-xl font-semibold">Cortes de caja</h1>
                    <div className="flex items-center gap-2 text-sm">
                        <Input
                            type="date"
                            value={filters.from}
                            max={filters.to}
                            onChange={(e) =>
                                e.target.value &&
                                apply({ from: e.target.value })
                            }
                            className="h-8 w-auto"
                        />
                        <span className="text-muted-foreground">al</span>
                        <Input
                            type="date"
                            value={filters.to}
                            min={filters.from}
                            onChange={(e) =>
                                e.target.value && apply({ to: e.target.value })
                            }
                            className="h-8 w-auto"
                        />
                    </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-xl border p-4">
                        <div className="text-sm text-muted-foreground">
                            Faltantes
                        </div>
                        <div className="text-2xl font-semibold text-red-600 tabular-nums">
                            {formatMoney(totals.shortage)}
                        </div>
                    </div>
                    <div className="rounded-xl border p-4">
                        <div className="text-sm text-muted-foreground">
                            Sobrantes
                        </div>
                        <div className="text-2xl font-semibold tabular-nums">
                            {formatMoney(totals.surplus)}
                        </div>
                    </div>
                    <div className="rounded-xl border p-4">
                        <div className="text-sm text-muted-foreground">
                            Cortes con diferencia
                        </div>
                        <div className="text-2xl font-semibold tabular-nums">
                            {totals.with_difference}
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-left text-xs text-muted-foreground uppercase">
                            <tr>
                                <th className="px-3 py-2">#</th>
                                <th className="px-3 py-2">Caja</th>
                                <th className="px-3 py-2">Cajero</th>
                                <th className="px-3 py-2">Apertura</th>
                                <th className="px-3 py-2">Cierre</th>
                                <th className="px-3 py-2 text-right">
                                    Esperado
                                </th>
                                <th className="px-3 py-2 text-right">
                                    Contado
                                </th>
                                <th className="px-3 py-2 text-right">
                                    Diferencia
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {sessions.data.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={8}
                                        className="px-3 py-8 text-center text-muted-foreground"
                                    >
                                        No hay turnos en el periodo.
                                    </td>
                                </tr>
                            )}
                            {sessions.data.map((s) => {
                                const diff =
                                    s.difference !== null
                                        ? Number(s.difference)
                                        : null;

                                return (
                                    <tr
                                        key={s.id}
                                        className="cursor-pointer border-t hover:bg-muted/40"
                                        onClick={() =>
                                            router.visit(
                                                CashSessionController.show.url(
                                                    s.id,
                                                ),
                                            )
                                        }
                                    >
                                        <td className="px-3 py-2 font-mono">
                                            {s.id}
                                        </td>
                                        <td className="px-3 py-2">
                                            {s.register}
                                            <div className="text-xs text-muted-foreground">
                                                {s.branch}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2">{s.user}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            {fmt(s.opened_at)}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            {s.closed_at ? (
                                                fmt(s.closed_at)
                                            ) : (
                                                <Badge variant="secondary">
                                                    Abierto
                                                </Badge>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {s.expected_amount !== null
                                                ? formatMoney(s.expected_amount)
                                                : '—'}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {s.counted_amount !== null
                                                ? formatMoney(s.counted_amount)
                                                : '—'}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {diff === null ? (
                                                '—'
                                            ) : diff === 0 ? (
                                                <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-500">
                                                    <CheckCircle2 className="size-3.5" />{' '}
                                                    Cuadra
                                                </span>
                                            ) : (
                                                <span
                                                    className={`inline-flex items-center gap-1 ${diff < 0 ? 'text-red-600' : ''}`}
                                                >
                                                    <AlertTriangle className="size-3.5" />
                                                    {diff < 0
                                                        ? 'Faltan '
                                                        : 'Sobran '}
                                                    {formatMoney(
                                                        Math.abs(diff),
                                                    )}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {sessions.last_page > 1 && (
                    <div className="flex justify-end gap-2">
                        {sessions.prev_page_url && (
                            <Button variant="outline" size="sm" asChild>
                                <Link href={sessions.prev_page_url}>
                                    Anterior
                                </Link>
                            </Button>
                        )}
                        {sessions.next_page_url && (
                            <Button variant="outline" size="sm" asChild>
                                <Link href={sessions.next_page_url}>
                                    Siguiente
                                </Link>
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}

CashSessionsReport.layout = {
    breadcrumbs: [
        { title: 'Cortes de caja', href: ReportController.cashSessions() },
    ],
};
