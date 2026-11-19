import { Head, Link, router } from '@inertiajs/react';
import {
    AlertTriangle,
    History,
    Search,
    SlidersHorizontal,
} from 'lucide-react';
import { useState } from 'react';
import InventoryController from '@/actions/App/Http/Controllers/InventoryController';
import PurchaseController from '@/actions/App/Http/Controllers/PurchaseController';
import AdjustDialog from '@/components/inventory/adjust-dialog';
import type { AdjustTarget } from '@/components/inventory/adjust-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatMoney, formatQuantity } from '@/lib/format';
import type { Option, Paginated, ValuedProduct } from '@/types/pos';

type Row = ValuedProduct & {
    unit: { id: number; abbreviation: string; allows_decimals: boolean };
};

type Props = {
    products: Paginated<Row>;
    lowStockCount: number;
    categories: Option[];
    filters: { search?: string; category_id?: string; low?: string | boolean };
};

export default function InventoryIndex({
    products,
    lowStockCount,
    categories,
    filters,
}: Props) {
    const [search, setSearch] = useState(filters.search ?? '');
    const [target, setTarget] = useState<AdjustTarget | null>(null);
    const lowOnly =
        filters.low === true || filters.low === '1' || filters.low === 'true';

    const apply = (patch: Record<string, string | undefined>) =>
        router.get(
            InventoryController.index.url(),
            {
                search: search || undefined,
                category_id: filters.category_id,
                low: lowOnly ? '1' : undefined,
                ...patch,
            },
            { preserveState: true, replace: true },
        );

    return (
        <>
            <Head title="Inventario" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h1 className="text-xl font-semibold">Inventario</h1>
                    <Button asChild variant="outline">
                        <Link href={PurchaseController.create()}>
                            Registrar compra
                        </Link>
                    </Button>
                </div>

                {lowStockCount > 0 && (
                    <button
                        type="button"
                        onClick={() =>
                            apply({ low: lowOnly ? undefined : '1' })
                        }
                        className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-left text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                    >
                        <AlertTriangle className="size-4 shrink-0" />
                        <span className="flex-1">
                            <strong>{lowStockCount}</strong> productos en o por
                            debajo de su existencia mínima.
                        </span>
                        <span className="underline">
                            {lowOnly ? 'Ver todos' : 'Ver solo esos'}
                        </span>
                    </button>
                )}

                <form
                    className="flex flex-wrap gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        apply({});
                    }}
                >
                    <div className="relative min-w-60 flex-1">
                        <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar por nombre, SKU o código"
                            className="pl-8"
                        />
                    </div>
                    <select
                        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm dark:bg-input/30"
                        value={filters.category_id ?? ''}
                        onChange={(e) =>
                            apply({ category_id: e.target.value || undefined })
                        }
                    >
                        <option value="">Todas las categorías</option>
                        {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                    <label className="flex items-center gap-2 px-2 text-sm">
                        <input
                            type="checkbox"
                            checked={lowOnly}
                            onChange={(e) =>
                                apply({
                                    low: e.target.checked ? '1' : undefined,
                                })
                            }
                        />
                        Solo bajo mínimo
                    </label>
                </form>

                <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-left text-xs text-muted-foreground uppercase">
                            <tr>
                                <th className="px-3 py-2">SKU / Código</th>
                                <th className="px-3 py-2">Producto</th>
                                <th className="px-3 py-2 text-right">
                                    Existencia
                                </th>
                                <th className="px-3 py-2 text-right">Mínimo</th>
                                <th className="px-3 py-2 text-right">Costo</th>
                                <th className="px-3 py-2 text-right">
                                    Valor (compra)
                                </th>
                                <th className="px-3 py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {products.data.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={7}
                                        className="px-3 py-8 text-center text-muted-foreground"
                                    >
                                        No hay productos.
                                    </td>
                                </tr>
                            )}
                            {products.data.map((p) => {
                                const stock = Number(p.stock);
                                const low = stock <= Number(p.min_stock);

                                return (
                                    <tr key={p.id} className="border-t">
                                        <td className="px-3 py-2 font-mono text-xs">
                                            {p.sku ?? p.barcode ?? '—'}
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="font-medium">
                                                {p.name}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {p.category?.name ??
                                                    'Sin categoría'}
                                            </div>
                                        </td>
                                        <td
                                            className={`px-3 py-2 text-right tabular-nums ${low ? 'font-semibold text-red-600' : ''}`}
                                        >
                                            {formatQuantity(stock)}{' '}
                                            {p.unit.abbreviation}
                                        </td>
                                        <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                                            {formatQuantity(p.min_stock)}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {formatMoney(p.cost)}
                                        </td>
                                        <td className="px-3 py-2 text-right font-medium tabular-nums">
                                            {formatMoney(p.stock_cost_value)}
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() =>
                                                        setTarget({
                                                            id: p.id,
                                                            name: p.name,
                                                            stock: p.stock,
                                                            unit: p.unit
                                                                .abbreviation,
                                                            allowsDecimals:
                                                                p.unit
                                                                    .allows_decimals ||
                                                                p.sells_by_weight,
                                                        })
                                                    }
                                                >
                                                    <SlidersHorizontal />{' '}
                                                    Ajustar
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    asChild
                                                >
                                                    <Link
                                                        href={InventoryController.kardex(
                                                            p.id,
                                                        )}
                                                    >
                                                        <History /> Kardex
                                                    </Link>
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {products.last_page > 1 && (
                    <div className="flex justify-end gap-2">
                        {products.prev_page_url && (
                            <Button variant="outline" size="sm" asChild>
                                <Link
                                    href={products.prev_page_url}
                                    preserveState
                                >
                                    Anterior
                                </Link>
                            </Button>
                        )}
                        {products.next_page_url && (
                            <Button variant="outline" size="sm" asChild>
                                <Link
                                    href={products.next_page_url}
                                    preserveState
                                >
                                    Siguiente
                                </Link>
                            </Button>
                        )}
                    </div>
                )}
            </div>

            <AdjustDialog target={target} onClose={() => setTarget(null)} />
        </>
    );
}

InventoryIndex.layout = {
    breadcrumbs: [{ title: 'Inventario', href: InventoryController.index() }],
};
