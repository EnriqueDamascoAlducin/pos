import { Head, Link, router } from '@inertiajs/react';
import { Download } from 'lucide-react';
import ReportController from '@/actions/App/Http/Controllers/ReportController';
import DailySalesChart from '@/components/reports/daily-sales-chart';
import type { DayRow } from '@/components/reports/daily-sales-chart';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatMoney, formatQuantity } from '@/lib/format';
import type { Option } from '@/types/pos';

type Summary = {
    count: number;
    total: string;
    subtotal: string;
    tax: string;
    discount: string;
    cost: string;
    profit: string;
    margin: string | null;
    average_ticket: string;
    cancelled_count: number;
    cancelled_total: string;
};

type Filters = {
    from: string;
    to: string;
    branch_id: number | null;
    user_id: number | null;
};

type Props = {
    summary: Summary;
    byDay: DayRow[];
    byPaymentMethod: {
        method: string;
        label: string;
        count: number;
        total: string;
    }[];
    byCashier: { user: string; count: number; total: string; profit: string }[];
    byCategory: {
        category: string;
        quantity: string;
        total: string;
        profit: string;
    }[];
    topProducts: {
        product_id: number;
        name: string;
        code: string | null;
        quantity: string;
        total: string;
        cost: string;
        profit: string;
    }[];
    filters: Filters;
    branches: Option[];
    users: Option[];
};

const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function quickRanges(): { label: string; from: string; to: string }[] {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstPrev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastPrev = new Date(today.getFullYear(), today.getMonth(), 0);

    return [
        { label: 'Hoy', from: iso(today), to: iso(today) },
        { label: 'Esta semana', from: iso(monday), to: iso(today) },
        { label: 'Este mes', from: iso(firstOfMonth), to: iso(today) },
        { label: 'Mes pasado', from: iso(firstPrev), to: iso(lastPrev) },
    ];
}

const selectClass =
    'h-9 rounded-md border border-input bg-transparent px-3 text-sm dark:bg-input/30';
const th = 'px-3 py-2';
const num = 'px-3 py-2 text-right tabular-nums';

function Stat({
    label,
    value,
    hint,
}: {
    label: string;
    value: string;
    hint?: string;
}) {
    return (
        <div className="rounded-xl border p-4">
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">
                {value}
            </div>
            {hint && (
                <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
            )}
        </div>
    );
}

/** Barra de proporción (participación de cada renglón en el total). */
function Share({ value, total }: { value: string; total: string }) {
    const pct = Number(total) > 0 ? (Number(value) / Number(total)) * 100 : 0;

    return (
        <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                <div
                    className="h-full rounded-full bg-[#2a78d6] dark:bg-[#3987e5]"
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                {pct.toFixed(0)}%
            </span>
        </div>
    );
}

export default function SalesReportPage({
    summary,
    byDay,
    byPaymentMethod,
    byCashier,
    byCategory,
    topProducts,
    filters,
    branches,
    users,
}: Props) {
    const apply = (
        patch: Partial<
            Record<keyof Filters, string | number | null | undefined>
        >,
    ) => {
        const next = { ...filters, ...patch };
        router.get(
            ReportController.sales.url(),
            {
                from: next.from,
                to: next.to,
                branch_id: next.branch_id || undefined,
                user_id: next.user_id || undefined,
            },
            { preserveState: true, preserveScroll: true, replace: true },
        );
    };

    const exportQuery = {
        from: filters.from,
        to: filters.to,
        ...(filters.branch_id ? { branch_id: filters.branch_id } : {}),
        ...(filters.user_id ? { user_id: filters.user_id } : {}),
    };

    return (
        <>
            <Head title="Reporte de ventas" />
            <div className="flex flex-1 flex-col gap-5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h1 className="text-xl font-semibold">Reporte de ventas</h1>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" asChild>
                            <a
                                href={ReportController.exportSales.url({
                                    query: { ...exportQuery, type: 'sales' },
                                })}
                            >
                                <Download /> Ventas (Excel)
                            </a>
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                            <a
                                href={ReportController.exportSales.url({
                                    query: { ...exportQuery, type: 'products' },
                                })}
                            >
                                <Download /> Por producto (Excel)
                            </a>
                        </Button>
                    </div>
                </div>

                {/* Filtros: una sola fila arriba de todo */}
                <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3 text-sm">
                    {quickRanges().map((r) => (
                        <Button
                            key={r.label}
                            size="sm"
                            variant={
                                filters.from === r.from && filters.to === r.to
                                    ? 'default'
                                    : 'ghost'
                            }
                            onClick={() => apply({ from: r.from, to: r.to })}
                        >
                            {r.label}
                        </Button>
                    ))}
                    <span className="mx-1 h-5 w-px bg-border" />
                    <Input
                        type="date"
                        value={filters.from}
                        max={filters.to}
                        onChange={(e) =>
                            e.target.value && apply({ from: e.target.value })
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
                    {branches.length > 1 && (
                        <select
                            className={selectClass}
                            value={filters.branch_id ?? ''}
                            onChange={(e) =>
                                apply({ branch_id: e.target.value || null })
                            }
                        >
                            <option value="">Todas las sucursales</option>
                            {branches.map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.name}
                                </option>
                            ))}
                        </select>
                    )}
                    <select
                        className={selectClass}
                        value={filters.user_id ?? ''}
                        onChange={(e) =>
                            apply({ user_id: e.target.value || null })
                        }
                    >
                        <option value="">Todos los cajeros</option>
                        {users.map((u) => (
                            <option key={u.id} value={u.id}>
                                {u.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <Stat
                        label="Total vendido"
                        value={formatMoney(summary.total)}
                        hint={`IVA incluido ${formatMoney(summary.tax)}`}
                    />
                    <Stat
                        label="Utilidad"
                        value={formatMoney(summary.profit)}
                        hint={
                            summary.margin !== null
                                ? `${summary.margin}% de margen · costo ${formatMoney(summary.cost)}`
                                : 'Sin ventas'
                        }
                    />
                    <Stat
                        label="Ventas"
                        value={String(summary.count)}
                        hint={`Ticket promedio ${formatMoney(summary.average_ticket)}`}
                    />
                    <Stat
                        label="Canceladas"
                        value={String(summary.cancelled_count)}
                        hint={`${formatMoney(summary.cancelled_total)} · descuentos ${formatMoney(summary.discount)}`}
                    />
                </div>

                <section className="rounded-xl border p-4">
                    <DailySalesChart days={byDay} />
                </section>

                <div className="grid gap-4 lg:grid-cols-2">
                    <section className="rounded-xl border">
                        <h2 className="px-4 pt-3 font-medium">
                            Por forma de pago
                        </h2>
                        <table className="w-full text-sm">
                            <tbody>
                                {byPaymentMethod.length === 0 && (
                                    <tr>
                                        <td className="px-4 py-6 text-center text-muted-foreground">
                                            Sin ventas en el periodo.
                                        </td>
                                    </tr>
                                )}
                                {byPaymentMethod.map((p) => (
                                    <tr
                                        key={p.method}
                                        className="border-t first:border-t-0"
                                    >
                                        <td className="px-4 py-2">{p.label}</td>
                                        <td className="px-3 py-2">
                                            <Share
                                                value={p.total}
                                                total={summary.total}
                                            />
                                        </td>
                                        <td className={num}>
                                            {formatMoney(p.total)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <p className="px-4 pb-3 text-xs text-muted-foreground">
                            El crédito no entró a caja; se cobra con abonos en
                            Clientes.
                        </p>
                    </section>

                    <section className="rounded-xl border">
                        <h2 className="px-4 pt-3 font-medium">Por cajero</h2>
                        <table className="w-full text-sm">
                            <thead className="text-left text-xs text-muted-foreground uppercase">
                                <tr>
                                    <th className="px-4 py-2">Cajero</th>
                                    <th className={`${th} text-right`}>
                                        Ventas
                                    </th>
                                    <th className={`${th} text-right`}>
                                        Importe
                                    </th>
                                    <th className={`${th} text-right`}>
                                        Utilidad
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {byCashier.map((c) => (
                                    <tr key={c.user} className="border-t">
                                        <td className="px-4 py-2">{c.user}</td>
                                        <td className={num}>{c.count}</td>
                                        <td className={num}>
                                            {formatMoney(c.total)}
                                        </td>
                                        <td className={num}>
                                            {formatMoney(c.profit)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>
                </div>

                <section className="rounded-xl border">
                    <h2 className="px-4 pt-3 font-medium">Por categoría</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-left text-xs text-muted-foreground uppercase">
                                <tr>
                                    <th className="px-4 py-2">Categoría</th>
                                    <th className={th}>Participación</th>
                                    <th className={`${th} text-right`}>
                                        Unidades
                                    </th>
                                    <th className={`${th} text-right`}>
                                        Importe
                                    </th>
                                    <th className={`${th} text-right`}>
                                        Utilidad
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {byCategory.map((c) => (
                                    <tr key={c.category} className="border-t">
                                        <td className="px-4 py-2">
                                            {c.category}
                                        </td>
                                        <td className="px-3 py-2">
                                            <Share
                                                value={c.total}
                                                total={summary.total}
                                            />
                                        </td>
                                        <td className={num}>
                                            {formatQuantity(c.quantity)}
                                        </td>
                                        <td className={num}>
                                            {formatMoney(c.total)}
                                        </td>
                                        <td className={num}>
                                            {formatMoney(c.profit)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="rounded-xl border">
                    <div className="flex items-center justify-between px-4 pt-3">
                        <h2 className="font-medium">Productos más vendidos</h2>
                        <span className="text-xs text-muted-foreground">
                            Top 20 por importe · la lista completa está en el
                            Excel
                        </span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-left text-xs text-muted-foreground uppercase">
                                <tr>
                                    <th className="px-4 py-2">#</th>
                                    <th className={th}>Producto</th>
                                    <th className={`${th} text-right`}>
                                        Cantidad
                                    </th>
                                    <th className={`${th} text-right`}>
                                        Importe
                                    </th>
                                    <th className={`${th} text-right`}>
                                        Costo
                                    </th>
                                    <th className={`${th} text-right`}>
                                        Utilidad
                                    </th>
                                    <th className={`${th} text-right`}>
                                        Margen
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {topProducts.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan={7}
                                            className="px-4 py-6 text-center text-muted-foreground"
                                        >
                                            Sin ventas en el periodo.
                                        </td>
                                    </tr>
                                )}
                                {topProducts.map((p, i) => {
                                    const margin =
                                        Number(p.total) > 0
                                            ? (Number(p.profit) /
                                                  Number(p.total)) *
                                              100
                                            : 0;

                                    return (
                                        <tr
                                            key={p.product_id}
                                            className="border-t"
                                        >
                                            <td className="px-4 py-2 text-muted-foreground tabular-nums">
                                                {i + 1}
                                            </td>
                                            <td className="px-3 py-2">
                                                <div className="font-medium">
                                                    {p.name}
                                                </div>
                                                {p.code && (
                                                    <div className="font-mono text-xs text-muted-foreground">
                                                        {p.code}
                                                    </div>
                                                )}
                                            </td>
                                            <td className={num}>
                                                {formatQuantity(p.quantity)}
                                            </td>
                                            <td className={num}>
                                                {formatMoney(p.total)}
                                            </td>
                                            <td
                                                className={`${num} text-muted-foreground`}
                                            >
                                                {formatMoney(p.cost)}
                                            </td>
                                            <td className={num}>
                                                {formatMoney(p.profit)}
                                            </td>
                                            <td
                                                className={`${num} ${margin < 0 ? 'text-red-600' : ''}`}
                                            >
                                                {margin.toFixed(1)}%
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>

                <p className="text-xs text-muted-foreground">
                    Utilidad = importe vendido − costo de lo vendido. El costo
                    es el precio de compra que tenía cada producto al momento de
                    la venta. Ver también{' '}
                    <Link
                        href={ReportController.cashSessions({
                            query: { from: filters.from, to: filters.to },
                        })}
                        className="underline"
                    >
                        el historial de cortes de caja
                    </Link>
                    .
                </p>
            </div>
        </>
    );
}

SalesReportPage.layout = {
    breadcrumbs: [
        { title: 'Reporte de ventas', href: ReportController.sales() },
    ],
};
