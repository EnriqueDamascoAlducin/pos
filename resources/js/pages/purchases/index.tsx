import { Head, Link, router } from '@inertiajs/react';
import { FileCode2, Plus } from 'lucide-react';
import PurchaseController from '@/actions/App/Http/Controllers/PurchaseController';
import PurchaseImportController from '@/actions/App/Http/Controllers/PurchaseImportController';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatMoney } from '@/lib/format';
import type { Option, Paginated } from '@/types/pos';

type PurchaseRow = {
    id: number;
    invoice_number: string | null;
    total: string;
    status: 'received' | 'cancelled';
    created_at: string;
    items_count: number;
    supplier: Option | null;
    user: Option;
};

type Props = {
    purchases: Paginated<PurchaseRow>;
    suppliers: Option[];
    filters: { supplier_id?: string; from?: string; to?: string };
};

const selectClass =
    'h-9 rounded-md border border-input bg-transparent px-3 text-sm dark:bg-input/30';

export default function PurchasesIndex({
    purchases,
    suppliers,
    filters,
}: Props) {
    const apply = (patch: Record<string, string | undefined>) =>
        router.get(
            PurchaseController.index.url(),
            { ...filters, ...patch },
            { preserveState: true, replace: true },
        );

    return (
        <>
            <Head title="Compras" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h1 className="text-xl font-semibold">Compras</h1>
                    <div className="flex gap-2">
                        <Button variant="outline" asChild>
                            <Link href={PurchaseImportController.create()}>
                                <FileCode2 /> Importar factura (XML)
                            </Link>
                        </Button>
                        <Button asChild>
                            <Link href={PurchaseController.create()}>
                                <Plus /> Registrar compra
                            </Link>
                        </Button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm">
                    <select
                        className={selectClass}
                        value={filters.supplier_id ?? ''}
                        onChange={(e) =>
                            apply({ supplier_id: e.target.value || undefined })
                        }
                    >
                        <option value="">Todos los proveedores</option>
                        {suppliers.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                            </option>
                        ))}
                    </select>
                    <span className="text-muted-foreground">Del</span>
                    <Input
                        type="date"
                        className="w-auto"
                        value={filters.from ?? ''}
                        onChange={(e) =>
                            apply({ from: e.target.value || undefined })
                        }
                    />
                    <span className="text-muted-foreground">al</span>
                    <Input
                        type="date"
                        className="w-auto"
                        value={filters.to ?? ''}
                        onChange={(e) =>
                            apply({ to: e.target.value || undefined })
                        }
                    />
                </div>

                <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-left text-xs text-muted-foreground uppercase">
                            <tr>
                                <th className="px-3 py-2">#</th>
                                <th className="px-3 py-2">Fecha</th>
                                <th className="px-3 py-2">Proveedor</th>
                                <th className="px-3 py-2">Factura</th>
                                <th className="px-3 py-2">Capturó</th>
                                <th className="px-3 py-2 text-right">
                                    Productos
                                </th>
                                <th className="px-3 py-2 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {purchases.data.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={7}
                                        className="px-3 py-8 text-center text-muted-foreground"
                                    >
                                        No hay compras registradas.
                                    </td>
                                </tr>
                            )}
                            {purchases.data.map((p) => (
                                <tr
                                    key={p.id}
                                    className="cursor-pointer border-t hover:bg-muted/40"
                                    onClick={() =>
                                        router.visit(
                                            PurchaseController.show.url(p.id),
                                        )
                                    }
                                >
                                    <td className="px-3 py-2 font-mono">
                                        {p.id}
                                        {p.status === 'cancelled' && (
                                            <Badge
                                                variant="destructive"
                                                className="ml-2"
                                            >
                                                Cancelada
                                            </Badge>
                                        )}
                                    </td>
                                    <td className="px-3 py-2">
                                        {new Date(p.created_at).toLocaleString(
                                            'es-MX',
                                            {
                                                dateStyle: 'short',
                                                timeStyle: 'short',
                                            },
                                        )}
                                    </td>
                                    <td className="px-3 py-2">
                                        {p.supplier?.name ?? '—'}
                                    </td>
                                    <td className="px-3 py-2">
                                        {p.invoice_number ?? '—'}
                                    </td>
                                    <td className="px-3 py-2">{p.user.name}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">
                                        {p.items_count}
                                    </td>
                                    <td
                                        className={`px-3 py-2 text-right font-medium tabular-nums ${p.status === 'cancelled' ? 'text-muted-foreground line-through' : ''}`}
                                    >
                                        {formatMoney(p.total)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {purchases.last_page > 1 && (
                    <div className="flex justify-end gap-2">
                        {purchases.prev_page_url && (
                            <Button variant="outline" size="sm" asChild>
                                <Link href={purchases.prev_page_url}>
                                    Anterior
                                </Link>
                            </Button>
                        )}
                        {purchases.next_page_url && (
                            <Button variant="outline" size="sm" asChild>
                                <Link href={purchases.next_page_url}>
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

PurchasesIndex.layout = {
    breadcrumbs: [{ title: 'Compras', href: PurchaseController.index() }],
};
