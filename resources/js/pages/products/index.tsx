import { Head, Link, router } from '@inertiajs/react';
import { confirmDialog } from '@/components/confirm-dialog';
import { FileUp, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import ProductController from '@/actions/App/Http/Controllers/ProductController';
import ProductImportController from '@/actions/App/Http/Controllers/ProductImportController';
import InventoryValueCards from '@/components/inventory-value-cards';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatMoney, formatQuantity } from '@/lib/format';
import type {
    InventoryTotals,
    Option,
    Paginated,
    ValuedProduct,
} from '@/types/pos';

type Props = {
    products: Paginated<ValuedProduct>;
    totals: InventoryTotals;
    categories: Option[];
    filters: { search?: string; category_id?: string };
};

export default function ProductsIndex({
    products,
    totals,
    categories,
    filters,
}: Props) {
    const [search, setSearch] = useState(filters.search ?? '');

    const applyFilters = (extra: Record<string, string | undefined> = {}) => {
        router.get(
            ProductController.index.url(),
            {
                search: search || undefined,
                category_id: filters.category_id,
                ...extra,
            },
            { preserveState: true, replace: true },
        );
    };

    const destroy = async (product: ValuedProduct) => {
        const ok = await confirmDialog({
            title: `¿Eliminar "${product.name}"?`,
            description:
                'Dejará de aparecer en el punto de venta y en los listados. Sus ventas y movimientos anteriores se conservan.',
            confirmText: 'Eliminar',
            destructive: true,
        });

        if (ok) {
            router.delete(ProductController.destroy.url(product.id), {
                preserveScroll: true,
            });
        }
    };

    return (
        <>
            <Head title="Productos" />

            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h1 className="text-xl font-semibold">Productos</h1>
                    <div className="flex gap-2">
                        <Button variant="outline" asChild>
                            <Link href={ProductImportController.create()}>
                                <FileUp /> Importar CSV
                            </Link>
                        </Button>
                        <Button asChild>
                            <Link href={ProductController.create()}>
                                <Plus /> Nuevo producto
                            </Link>
                        </Button>
                    </div>
                </div>

                <InventoryValueCards totals={totals} />

                <form
                    className="flex flex-wrap gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        applyFilters();
                    }}
                >
                    <div className="relative min-w-60 flex-1">
                        <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar por nombre, SKU o código de barras"
                            className="pl-8"
                        />
                    </div>
                    <select
                        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm dark:bg-input/30"
                        value={filters.category_id ?? ''}
                        onChange={(e) =>
                            applyFilters({
                                category_id: e.target.value || undefined,
                            })
                        }
                    >
                        <option value="">Todas las categorías</option>
                        {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                    <Button type="submit" variant="secondary">
                        Buscar
                    </Button>
                </form>

                <div className="overflow-x-auto rounded-xl border border-sidebar-border/70 dark:border-sidebar-border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-left text-xs text-muted-foreground uppercase">
                            <tr>
                                <th className="px-3 py-2">SKU / Código</th>
                                <th className="px-3 py-2">Producto</th>
                                <th className="px-3 py-2 text-right">
                                    Existencia
                                </th>
                                <th className="px-3 py-2 text-right">
                                    P. compra
                                </th>
                                <th className="px-3 py-2 text-right">
                                    P. venta
                                </th>
                                <th className="px-3 py-2 text-right">
                                    En bodega (compra)
                                </th>
                                <th className="px-3 py-2 text-right">
                                    En bodega (venta)
                                </th>
                                <th className="px-3 py-2 text-right">
                                    Utilidad
                                </th>
                                <th className="px-3 py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {products.data.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={9}
                                        className="px-3 py-8 text-center text-muted-foreground"
                                    >
                                        No hay productos.
                                    </td>
                                </tr>
                            )}
                            {products.data.map((p) => {
                                const low =
                                    p.tracks_inventory &&
                                    Number(p.stock) <= Number(p.min_stock);

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
                                                {!p.active && (
                                                    <Badge
                                                        variant="secondary"
                                                        className="ml-2"
                                                    >
                                                        Inactivo
                                                    </Badge>
                                                )}
                                            </div>
                                        </td>
                                        <td
                                            className={`px-3 py-2 text-right tabular-nums ${low ? 'font-semibold text-red-600' : ''}`}
                                        >
                                            {p.tracks_inventory
                                                ? `${formatQuantity(p.stock)} ${p.unit?.abbreviation ?? ''}`
                                                : 'N/A'}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {formatMoney(p.cost)}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {formatMoney(p.price)}
                                        </td>
                                        <td className="px-3 py-2 text-right font-medium tabular-nums">
                                            {formatMoney(p.stock_cost_value)}
                                        </td>
                                        <td className="px-3 py-2 text-right font-medium tabular-nums">
                                            {formatMoney(p.stock_sale_value)}
                                        </td>
                                        <td className="px-3 py-2 text-right text-green-700 tabular-nums dark:text-green-500">
                                            {formatMoney(p.stock_profit)}
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    asChild
                                                >
                                                    <Link
                                                        href={ProductController.edit(
                                                            p.id,
                                                        )}
                                                        aria-label="Editar"
                                                    >
                                                        <Pencil />
                                                    </Link>
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label="Eliminar"
                                                    onClick={() => destroy(p)}
                                                >
                                                    <Trash2 />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                        {products.total > 0
                            ? `${products.from}–${products.to} de ${products.total}`
                            : ''}
                    </span>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!products.prev_page_url}
                            asChild={!!products.prev_page_url}
                        >
                            {products.prev_page_url ? (
                                <Link
                                    href={products.prev_page_url}
                                    preserveState
                                >
                                    Anterior
                                </Link>
                            ) : (
                                'Anterior'
                            )}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={!products.next_page_url}
                            asChild={!!products.next_page_url}
                        >
                            {products.next_page_url ? (
                                <Link
                                    href={products.next_page_url}
                                    preserveState
                                >
                                    Siguiente
                                </Link>
                            ) : (
                                'Siguiente'
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        </>
    );
}

ProductsIndex.layout = {
    breadcrumbs: [{ title: 'Productos', href: ProductController.index() }],
};
