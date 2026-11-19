import { Head, Link, router } from '@inertiajs/react';
import { promptDialog } from '@/components/confirm-dialog';
import { Ban, Plus } from 'lucide-react';
import PurchaseController from '@/actions/App/Http/Controllers/PurchaseController';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatMoney, formatQuantity } from '@/lib/format';
import type { Option } from '@/types/pos';

type Purchase = {
    id: number;
    invoice_number: string | null;
    notes: string | null;
    total: string;
    status: 'received' | 'cancelled';
    received_at: string | null;
    created_at: string;
    supplier: Option | null;
    user: Option;
    branch: Option;
    items: {
        id: number;
        quantity: string;
        cost: string;
        total: string;
        product: {
            id: number;
            name: string;
            sku: string | null;
            barcode: string | null;
            unit: { abbreviation: string };
        };
    }[];
};

export default function PurchaseShow({ purchase }: { purchase: Purchase }) {
    const cancelled = purchase.status === 'cancelled';

    const cancel = async () => {
        const reason = await promptDialog({
            title: `¿Cancelar la compra #${purchase.id}?`,
            description: `Se retirará del inventario la mercancía de esta compra (${formatMoney(purchase.total)}).`,
            label: 'Motivo de la cancelación',
            placeholder: 'Ej. capturada dos veces…',
            confirmText: 'Cancelar compra',
            cancelText: 'No cancelar',
            destructive: true,
        });
        if (reason) {
            router.post(
                PurchaseController.cancel.url(purchase.id),
                { reason },
                { preserveScroll: true },
            );
        }
    };

    return (
        <>
            <Head title={`Compra #${purchase.id}`} />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <h1 className="flex items-center gap-2 text-xl font-semibold">
                            Compra #{purchase.id}
                            {cancelled && (
                                <Badge variant="destructive">Cancelada</Badge>
                            )}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {new Date(purchase.created_at).toLocaleString(
                                'es-MX',
                            )}{' '}
                            · {purchase.branch.name} · Capturó{' '}
                            {purchase.user.name}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        {!cancelled && (
                            <Button variant="outline" onClick={cancel}>
                                <Ban /> Cancelar compra
                            </Button>
                        )}
                        <Button asChild>
                            <Link href={PurchaseController.create()}>
                                <Plus /> Otra compra
                            </Link>
                        </Button>
                    </div>
                </div>

                <div className="grid gap-4 rounded-xl border p-4 text-sm sm:grid-cols-3">
                    <div>
                        <div className="text-muted-foreground">Proveedor</div>
                        <div className="font-medium">
                            {purchase.supplier?.name ?? 'Sin proveedor'}
                        </div>
                    </div>
                    <div>
                        <div className="text-muted-foreground">
                            Factura / remisión
                        </div>
                        <div className="font-medium">
                            {purchase.invoice_number ?? '—'}
                        </div>
                    </div>
                    <div>
                        <div className="text-muted-foreground">Total</div>
                        <div className="text-xl font-semibold tabular-nums">
                            {formatMoney(purchase.total)}
                        </div>
                    </div>
                    {purchase.notes && (
                        <p className="whitespace-pre-line sm:col-span-3">
                            {purchase.notes}
                        </p>
                    )}
                </div>

                <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-left text-xs text-muted-foreground uppercase">
                            <tr>
                                <th className="px-3 py-2">SKU / Código</th>
                                <th className="px-3 py-2">Producto</th>
                                <th className="px-3 py-2 text-right">
                                    Cantidad
                                </th>
                                <th className="px-3 py-2 text-right">Costo</th>
                                <th className="px-3 py-2 text-right">
                                    Importe
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {purchase.items.map((i) => (
                                <tr key={i.id} className="border-t">
                                    <td className="px-3 py-2 font-mono text-xs">
                                        {i.product.sku ??
                                            i.product.barcode ??
                                            '—'}
                                    </td>
                                    <td className="px-3 py-2">
                                        {i.product.name}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums">
                                        {formatQuantity(i.quantity)}{' '}
                                        {i.product.unit.abbreviation}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums">
                                        {formatMoney(i.cost)}
                                    </td>
                                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                                        {formatMoney(i.total)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}

PurchaseShow.layout = {
    breadcrumbs: [
        { title: 'Compras', href: PurchaseController.index() },
        { title: 'Detalle', href: '#' },
    ],
};
