import { Head, Link } from '@inertiajs/react';
import { AlertTriangle } from 'lucide-react';
import CustomerController from '@/actions/App/Http/Controllers/CustomerController';
import InventoryController from '@/actions/App/Http/Controllers/InventoryController';
import ReportController from '@/actions/App/Http/Controllers/ReportController';
import InventoryValueCards from '@/components/inventory-value-cards';
import { formatMoney } from '@/lib/format';
import { dashboard } from '@/routes';
import type { InventoryTotals } from '@/types/pos';

export default function Dashboard({
    inventory,
    lowStockCount,
    receivable,
}: {
    inventory: InventoryTotals | null;
    lowStockCount: number | null;
    receivable: { total: string; customers: number } | null;
}) {
    return (
        <>
            <Head title="Inicio" />
            <div className="flex h-full flex-1 flex-col gap-4 p-4">
                <h1 className="text-xl font-semibold">Inicio</h1>

                {!!lowStockCount && (
                    <Link
                        href={InventoryController.index({ query: { low: 1 } })}
                        className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                    >
                        <AlertTriangle className="size-4 shrink-0" />
                        <span className="flex-1">
                            <strong>{lowStockCount}</strong> productos necesitan
                            resurtido (en o por debajo de su mínimo).
                        </span>
                        <span className="underline">Ver productos</span>
                    </Link>
                )}

                {receivable && Number(receivable.total) > 0 && (
                    <Link
                        href={CustomerController.index({
                            query: { with_balance: 1 },
                        })}
                        className="flex max-w-sm items-center justify-between gap-4 rounded-xl border p-4 hover:bg-muted/40"
                    >
                        <span>
                            <span className="block text-sm text-muted-foreground">
                                Cuentas por cobrar
                            </span>
                            <span className="text-2xl font-semibold tabular-nums">
                                {formatMoney(receivable.total)}
                            </span>
                        </span>
                        <span className="text-right text-xs text-muted-foreground">
                            {receivable.customers} clientes
                            <span className="block underline">Ver</span>
                        </span>
                    </Link>
                )}

                {inventory && (
                    <section className="grid gap-2">
                        <div className="flex items-center justify-between">
                            <h2 className="font-medium">
                                Inventario en bodega
                            </h2>
                            <Link
                                href={ReportController.inventoryValue()}
                                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                            >
                                Ver reporte completo
                            </Link>
                        </div>
                        <InventoryValueCards totals={inventory} />
                    </section>
                )}
            </div>
        </>
    );
}

Dashboard.layout = {
    breadcrumbs: [{ title: 'Inicio', href: dashboard() }],
};
