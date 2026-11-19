import { Head, Link, router } from '@inertiajs/react';
import { promptDialog } from '@/components/confirm-dialog';
import { Ban, Printer } from 'lucide-react';
import { useState } from 'react';
import SaleController from '@/actions/App/Http/Controllers/SaleController';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatMoney } from '@/lib/format';
import { paymentLabels } from '@/types/cash';
import type { Paginated } from '@/types/pos';

type SaleRow = {
    id: number;
    folio: number;
    total: string;
    status: 'completed' | 'cancelled';
    created_at: string;
    cancel_reason: string | null;
    items_count: number;
    user: { id: number; name: string };
    authorizer: { id: number; name: string } | null;
    customer: { id: number; name: string } | null;
    payments: { id: number; method: string; amount: string }[];
};

type Props = {
    sales: Paginated<SaleRow>;
    filters: { date: string; folio: number | null };
    can: { cancel: boolean };
};

function openTicket(id: number) {
    window.open(
        SaleController.ticket.url(id, { query: { print: 0 } }),
        'ticket',
        'width=380,height=640',
    );
}

export default function SalesIndex({ sales, filters, can }: Props) {
    const [folio, setFolio] = useState(
        filters.folio ? String(filters.folio) : '',
    );

    const go = (params: Record<string, string | undefined>) =>
        router.get(SaleController.index.url(), params, {
            preserveState: true,
            replace: true,
        });

    const cancel = async (sale: SaleRow) => {
        const reason = await promptDialog({
            title: `¿Cancelar la venta ${sale.folio}?`,
            description: `Total ${formatMoney(sale.total)}. Se regresará la mercancía al inventario y, si fue a crédito, el saldo del cliente.`,
            label: 'Motivo de la cancelación',
            placeholder: 'Ej. error de captura, devolución del cliente…',
            confirmText: 'Cancelar venta',
            cancelText: 'No cancelar',
            destructive: true,
        });
        if (!reason) return;

        router.post(
            SaleController.cancel.url(sale.id),
            { reason },
            { preserveScroll: true },
        );
    };

    const completed = sales.data.filter((s) => s.status === 'completed');
    const pageTotal = completed.reduce((sum, s) => sum + Number(s.total), 0);

    return (
        <>
            <Head title="Ventas" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-end justify-between gap-2">
                    <h1 className="text-xl font-semibold">Ventas</h1>
                    <div className="flex flex-wrap gap-2">
                        <Input
                            type="date"
                            value={filters.date}
                            onChange={(e) => go({ date: e.target.value })}
                            className="w-auto"
                        />
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                go(folio ? { folio } : { date: filters.date });
                            }}
                            className="flex gap-2"
                        >
                            <Input
                                value={folio}
                                onChange={(e) => setFolio(e.target.value)}
                                placeholder="Buscar folio"
                                inputMode="numeric"
                                className="w-32"
                            />
                            <Button type="submit" variant="secondary">
                                Buscar
                            </Button>
                        </form>
                    </div>
                </div>

                <div className="text-sm text-muted-foreground">
                    {completed.length} ventas · {formatMoney(pageTotal)}
                    {sales.last_page > 1 && ' (esta página)'}
                </div>

                <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-left text-xs text-muted-foreground uppercase">
                            <tr>
                                <th className="px-3 py-2">Folio</th>
                                <th className="px-3 py-2">Hora</th>
                                <th className="px-3 py-2">Cajero</th>
                                <th className="px-3 py-2">Cliente</th>
                                <th className="px-3 py-2">Pago</th>
                                <th className="px-3 py-2 text-right">
                                    Artículos
                                </th>
                                <th className="px-3 py-2 text-right">Total</th>
                                <th className="px-3 py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {sales.data.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={8}
                                        className="px-3 py-8 text-center text-muted-foreground"
                                    >
                                        No hay ventas.
                                    </td>
                                </tr>
                            )}
                            {sales.data.map((s) => {
                                const cancelled = s.status === 'cancelled';

                                return (
                                    <tr
                                        key={s.id}
                                        className={`border-t ${cancelled ? 'text-muted-foreground' : ''}`}
                                    >
                                        <td className="px-3 py-2 font-mono">
                                            {s.folio}
                                            {cancelled && (
                                                <Badge
                                                    variant="destructive"
                                                    className="ml-2"
                                                    title={
                                                        s.cancel_reason ?? ''
                                                    }
                                                >
                                                    Cancelada
                                                </Badge>
                                            )}
                                        </td>
                                        <td className="px-3 py-2">
                                            {new Date(
                                                s.created_at,
                                            ).toLocaleTimeString('es-MX', {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                        </td>
                                        <td className="px-3 py-2">
                                            {s.user.name}
                                            {s.authorizer &&
                                                s.authorizer.id !==
                                                    s.user.id && (
                                                    <div className="text-xs text-muted-foreground">
                                                        Ajuste autorizado por{' '}
                                                        {s.authorizer.name}
                                                    </div>
                                                )}
                                        </td>
                                        <td className="px-3 py-2">
                                            {s.customer?.name ?? '—'}
                                        </td>
                                        <td className="px-3 py-2">
                                            {s.payments
                                                .map(
                                                    (p) =>
                                                        paymentLabels[p.method],
                                                )
                                                .join(' + ')}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {s.items_count}
                                        </td>
                                        <td
                                            className={`px-3 py-2 text-right font-medium tabular-nums ${cancelled ? 'line-through' : ''}`}
                                        >
                                            {formatMoney(s.total)}
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label="Ticket"
                                                    onClick={() =>
                                                        openTicket(s.id)
                                                    }
                                                >
                                                    <Printer />
                                                </Button>
                                                {can.cancel && !cancelled && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        aria-label="Cancelar venta"
                                                        onClick={() =>
                                                            cancel(s)
                                                        }
                                                    >
                                                        <Ban />
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {sales.last_page > 1 && (
                    <div className="flex justify-end gap-2">
                        {sales.prev_page_url && (
                            <Button variant="outline" size="sm" asChild>
                                <Link href={sales.prev_page_url}>Anterior</Link>
                            </Button>
                        )}
                        {sales.next_page_url && (
                            <Button variant="outline" size="sm" asChild>
                                <Link href={sales.next_page_url}>
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

SalesIndex.layout = {
    breadcrumbs: [{ title: 'Ventas', href: SaleController.index() }],
};
