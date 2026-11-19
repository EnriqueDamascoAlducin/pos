import { Head, router } from '@inertiajs/react';
import ReportController from '@/actions/App/Http/Controllers/ReportController';
import InventoryValueCards from '@/components/inventory-value-cards';
import { formatMoney, formatQuantity } from '@/lib/format';
import type { InventoryTotals, Option, ValuedProduct } from '@/types/pos';

type CategoryRow = InventoryTotals & { category: string };

type Props = {
    totals: InventoryTotals;
    byCategory: CategoryRow[];
    products: ValuedProduct[];
    branches: Option[];
    filters: { branch_id?: string };
};

const th = 'px-3 py-2';
const num = 'px-3 py-2 text-right tabular-nums';

export default function InventoryValueReport({
    totals,
    byCategory,
    products,
    branches,
    filters,
}: Props) {
    return (
        <>
            <Head title="Valor de inventario" />

            <div className="flex flex-1 flex-col gap-6 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h1 className="text-xl font-semibold">
                            Valor de inventario
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Lo que tienes en bodega, a precio de compra y a
                            precio de venta.
                        </p>
                    </div>
                    {branches.length > 1 && (
                        <select
                            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm dark:bg-input/30"
                            value={filters.branch_id ?? ''}
                            onChange={(e) =>
                                router.get(
                                    ReportController.inventoryValue.url(),
                                    { branch_id: e.target.value || undefined },
                                    { preserveState: true },
                                )
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
                </div>

                <InventoryValueCards totals={totals} />

                <section className="grid gap-2">
                    <h2 className="font-medium">Por categoría</h2>
                    <div className="overflow-x-auto rounded-xl border">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50 text-left text-xs text-muted-foreground uppercase">
                                <tr>
                                    <th className={th}>Categoría</th>
                                    <th className={`${th} text-right`}>
                                        Productos
                                    </th>
                                    <th className={`${th} text-right`}>
                                        Unidades
                                    </th>
                                    <th className={`${th} text-right`}>
                                        Valor compra
                                    </th>
                                    <th className={`${th} text-right`}>
                                        Valor venta
                                    </th>
                                    <th className={`${th} text-right`}>
                                        Utilidad
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {byCategory.map((row) => (
                                    <tr key={row.category} className="border-t">
                                        <td className="px-3 py-2 font-medium">
                                            {row.category}
                                        </td>
                                        <td className={num}>{row.products}</td>
                                        <td className={num}>
                                            {formatQuantity(row.units)}
                                        </td>
                                        <td className={num}>
                                            {formatMoney(row.cost_value)}
                                        </td>
                                        <td className={num}>
                                            {formatMoney(row.sale_value)}
                                        </td>
                                        <td
                                            className={`${num} text-green-700 dark:text-green-500`}
                                        >
                                            {formatMoney(row.profit)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="border-t font-semibold">
                                <tr>
                                    <td className="px-3 py-2">Total</td>
                                    <td className={num}>{totals.products}</td>
                                    <td className={num}>
                                        {formatQuantity(totals.units)}
                                    </td>
                                    <td className={num}>
                                        {formatMoney(totals.cost_value)}
                                    </td>
                                    <td className={num}>
                                        {formatMoney(totals.sale_value)}
                                    </td>
                                    <td className={num}>
                                        {formatMoney(totals.profit)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </section>

                <section className="grid gap-2">
                    <h2 className="font-medium">Por producto</h2>
                    <div className="overflow-x-auto rounded-xl border">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50 text-left text-xs text-muted-foreground uppercase">
                                <tr>
                                    <th className={th}>SKU / Código</th>
                                    <th className={th}>Producto</th>
                                    <th className={`${th} text-right`}>
                                        Existencia
                                    </th>
                                    <th className={`${th} text-right`}>
                                        P. compra
                                    </th>
                                    <th className={`${th} text-right`}>
                                        P. venta
                                    </th>
                                    <th className={`${th} text-right`}>
                                        En bodega (compra)
                                    </th>
                                    <th className={`${th} text-right`}>
                                        En bodega (venta)
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.map((p) => (
                                    <tr key={p.id} className="border-t">
                                        <td className="px-3 py-2 font-mono text-xs">
                                            {p.sku ?? p.barcode ?? '—'}
                                        </td>
                                        <td className="px-3 py-2">{p.name}</td>
                                        <td className={num}>
                                            {formatQuantity(p.stock)}{' '}
                                            {p.unit?.abbreviation}
                                        </td>
                                        <td className={num}>
                                            {formatMoney(p.cost)}
                                        </td>
                                        <td className={num}>
                                            {formatMoney(p.price)}
                                        </td>
                                        <td className={`${num} font-medium`}>
                                            {formatMoney(p.stock_cost_value)}
                                        </td>
                                        <td className={`${num} font-medium`}>
                                            {formatMoney(p.stock_sale_value)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        </>
    );
}

InventoryValueReport.layout = {
    breadcrumbs: [
        {
            title: 'Valor de inventario',
            href: ReportController.inventoryValue(),
        },
    ],
};
