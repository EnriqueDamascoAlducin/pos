import { Head, Link } from '@inertiajs/react';
import { SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import InventoryController from '@/actions/App/Http/Controllers/InventoryController';
import PurchaseController from '@/actions/App/Http/Controllers/PurchaseController';
import AdjustDialog from '@/components/inventory/adjust-dialog';
import type { AdjustTarget } from '@/components/inventory/adjust-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatMoney, formatQuantity } from '@/lib/format';
import type { Paginated, Product } from '@/types/pos';

type Movement = {
    id: number;
    type: string;
    quantity: string;
    balance: string;
    cost: string;
    notes: string | null;
    user: string | null;
    reference_type: string | null;
    reference_id: number | null;
    created_at: string;
};

type Props = {
    product: Product & { unit: { abbreviation: string } };
    stock: string;
    movements: Paginated<Movement>;
};

const TYPE_LABELS: Record<
    string,
    {
        label: string;
        variant: 'default' | 'secondary' | 'destructive' | 'outline';
    }
> = {
    sale: { label: 'Venta', variant: 'secondary' },
    sale_cancel: { label: 'Venta cancelada', variant: 'outline' },
    purchase: { label: 'Compra', variant: 'default' },
    adjustment: { label: 'Ajuste', variant: 'outline' },
    transfer_in: { label: 'Traspaso entrada', variant: 'outline' },
    transfer_out: { label: 'Traspaso salida', variant: 'outline' },
    return: { label: 'Devolución', variant: 'outline' },
};

function Reference({ m }: { m: Movement }) {
    if (m.reference_type === 'Purchase' && m.reference_id) {
        return (
            <Link
                href={PurchaseController.show(m.reference_id)}
                className="underline"
            >
                Compra #{m.reference_id}
            </Link>
        );
    }
    if (m.reference_type === 'Sale' && m.reference_id) {
        return <span>Venta (id {m.reference_id})</span>;
    }
    return null;
}

export default function Kardex({ product, stock, movements }: Props) {
    const [target, setTarget] = useState<AdjustTarget | null>(null);
    const unit = product.unit.abbreviation;

    return (
        <>
            <Head title={`Kardex · ${product.name}`} />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <h1 className="text-xl font-semibold">
                            {product.name}
                        </h1>
                        <p className="font-mono text-sm text-muted-foreground">
                            {product.sku ?? product.barcode ?? ''}
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        onClick={() =>
                            setTarget({
                                id: product.id,
                                name: product.name,
                                stock,
                                unit,
                                allowsDecimals: product.sells_by_weight,
                            })
                        }
                    >
                        <SlidersHorizontal /> Ajustar inventario
                    </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-4">
                    {[
                        ['Existencia', `${formatQuantity(stock)} ${unit}`],
                        [
                            'Mínimo',
                            `${formatQuantity(product.min_stock)} ${unit}`,
                        ],
                        ['Precio de compra', formatMoney(product.cost)],
                        [
                            'Valor en bodega',
                            formatMoney(Number(stock) * Number(product.cost)),
                        ],
                    ].map(([label, value]) => (
                        <div key={label} className="rounded-xl border p-3">
                            <div className="text-sm text-muted-foreground">
                                {label}
                            </div>
                            <div className="text-xl font-semibold tabular-nums">
                                {value}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-left text-xs text-muted-foreground uppercase">
                            <tr>
                                <th className="px-3 py-2">Fecha</th>
                                <th className="px-3 py-2">Movimiento</th>
                                <th className="px-3 py-2">
                                    Referencia / notas
                                </th>
                                <th className="px-3 py-2">Usuario</th>
                                <th className="px-3 py-2 text-right">
                                    Entrada
                                </th>
                                <th className="px-3 py-2 text-right">Salida</th>
                                <th className="px-3 py-2 text-right">Saldo</th>
                                <th className="px-3 py-2 text-right">Costo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {movements.data.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={8}
                                        className="px-3 py-8 text-center text-muted-foreground"
                                    >
                                        Sin movimientos.
                                    </td>
                                </tr>
                            )}
                            {movements.data.map((m) => {
                                const qty = Number(m.quantity);
                                const type = TYPE_LABELS[m.type] ?? {
                                    label: m.type,
                                    variant: 'outline' as const,
                                };

                                return (
                                    <tr key={m.id} className="border-t">
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            {new Date(
                                                m.created_at,
                                            ).toLocaleString('es-MX', {
                                                dateStyle: 'short',
                                                timeStyle: 'short',
                                            })}
                                        </td>
                                        <td className="px-3 py-2">
                                            <Badge variant={type.variant}>
                                                {type.label}
                                            </Badge>
                                        </td>
                                        <td className="px-3 py-2">
                                            <Reference m={m} />
                                            {m.notes && (
                                                <div className="text-xs text-muted-foreground">
                                                    {m.notes}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-3 py-2">
                                            {m.user ?? '—'}
                                        </td>
                                        <td className="px-3 py-2 text-right text-green-700 tabular-nums dark:text-green-500">
                                            {qty > 0 ? formatQuantity(qty) : ''}
                                        </td>
                                        <td className="px-3 py-2 text-right text-red-600 tabular-nums">
                                            {qty < 0
                                                ? formatQuantity(-qty)
                                                : ''}
                                        </td>
                                        <td className="px-3 py-2 text-right font-medium tabular-nums">
                                            {formatQuantity(m.balance)}
                                        </td>
                                        <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                                            {formatMoney(m.cost)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {movements.last_page > 1 && (
                    <div className="flex justify-end gap-2">
                        {movements.prev_page_url && (
                            <Button variant="outline" size="sm" asChild>
                                <Link href={movements.prev_page_url}>
                                    Más recientes
                                </Link>
                            </Button>
                        )}
                        {movements.next_page_url && (
                            <Button variant="outline" size="sm" asChild>
                                <Link href={movements.next_page_url}>
                                    Anteriores
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

Kardex.layout = {
    breadcrumbs: [
        { title: 'Inventario', href: InventoryController.index() },
        { title: 'Kardex', href: '#' },
    ],
};
