import { Head, Link, router } from '@inertiajs/react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import PurchaseController from '@/actions/App/Http/Controllers/PurchaseController';
import SupplierController from '@/actions/App/Http/Controllers/SupplierController';
import ProductSearch from '@/components/inventory/product-search';
import type { StockProduct } from '@/components/inventory/product-search';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatMoney, formatQuantity } from '@/lib/format';
import type { Option } from '@/types/pos';
import { round2 } from '@/types/sale';

type Line = { product: StockProduct; quantity: string; cost: string };

export default function PurchasesCreate({
    suppliers,
}: {
    suppliers: Option[];
}) {
    const [lines, setLines] = useState<Line[]>([]);
    const [supplierId, setSupplierId] = useState('');
    const [invoice, setInvoice] = useState('');
    const [notes, setNotes] = useState('');
    const [updateCosts, setUpdateCosts] = useState(true);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [processing, setProcessing] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);
    const qtyRefs = useRef<Record<number, HTMLInputElement | null>>({});

    const addProduct = (product: StockProduct) => {
        const existing = lines.find((l) => l.product.id === product.id);
        if (existing) {
            setLines((prev) =>
                prev.map((l) =>
                    l.product.id === product.id
                        ? {
                              ...l,
                              quantity: String((Number(l.quantity) || 0) + 1),
                          }
                        : l,
                ),
            );
        } else {
            setLines((prev) => [
                ...prev,
                {
                    product,
                    quantity: '1',
                    cost: Number(product.cost).toFixed(2),
                },
            ]);
        }
        // Tras escanear, pasa a capturar la cantidad.
        setTimeout(() => qtyRefs.current[product.id]?.select(), 0);
    };

    const update = (id: number, patch: Partial<Line>) =>
        setLines((prev) =>
            prev.map((l) => (l.product.id === id ? { ...l, ...patch } : l)),
        );

    const total = round2(
        lines.reduce(
            (sum, l) =>
                sum + round2((Number(l.cost) || 0) * (Number(l.quantity) || 0)),
            0,
        ),
    );

    const submit = () => {
        router.post(
            PurchaseController.store.url(),
            {
                supplier_id: supplierId || null,
                invoice_number: invoice || null,
                notes: notes || null,
                update_costs: updateCosts,
                items: lines.map((l) => ({
                    product_id: l.product.id,
                    quantity: l.quantity,
                    cost: l.cost,
                })),
            },
            {
                onStart: () => setProcessing(true),
                onFinish: () => setProcessing(false),
                onError: (errs) => {
                    setErrors(errs);
                    toast.error(Object.values(errs)[0]);
                },
            },
        );
    };

    return (
        <>
            <Head title="Nueva compra" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <h1 className="text-xl font-semibold">Registrar compra</h1>

                <div className="grid gap-4 rounded-xl border p-4 sm:grid-cols-3">
                    <div className="grid gap-1.5">
                        <Label
                            htmlFor="supplier"
                            className="flex justify-between"
                        >
                            Proveedor
                            <Link
                                href={SupplierController.index()}
                                className="text-xs font-normal text-muted-foreground underline"
                            >
                                Administrar
                            </Link>
                        </Label>
                        <select
                            id="supplier"
                            value={supplierId}
                            onChange={(e) => setSupplierId(e.target.value)}
                            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm dark:bg-input/30"
                        >
                            <option value="">Sin proveedor</option>
                            {suppliers.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="invoice">Factura / remisión</Label>
                        <Input
                            id="invoice"
                            value={invoice}
                            onChange={(e) => setInvoice(e.target.value)}
                        />
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor="notes">Notas</Label>
                        <Input
                            id="notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </div>
                </div>

                <ProductSearch
                    ref={searchRef}
                    onSelect={addProduct}
                    placeholder="Escanea o busca el producto recibido"
                />

                <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-left text-xs text-muted-foreground uppercase">
                            <tr>
                                <th className="px-3 py-2">Producto</th>
                                <th className="px-3 py-2 text-right">
                                    Exist. actual
                                </th>
                                <th className="w-32 px-3 py-2 text-right">
                                    Cantidad
                                </th>
                                <th className="w-36 px-3 py-2 text-right">
                                    Costo unitario
                                </th>
                                <th className="px-3 py-2 text-right">
                                    P. venta
                                </th>
                                <th className="px-3 py-2 text-right">
                                    Importe
                                </th>
                                <th className="w-10" />
                            </tr>
                        </thead>
                        <tbody>
                            {lines.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={7}
                                        className="px-3 py-12 text-center text-muted-foreground"
                                    >
                                        Escanea o busca los productos que
                                        llegaron.
                                    </td>
                                </tr>
                            )}
                            {lines.map((l, i) => {
                                const cost = Number(l.cost) || 0;
                                const price = Number(l.product.price);
                                const costChanged =
                                    Math.abs(cost - Number(l.product.cost)) >=
                                    0.005;

                                return (
                                    <tr
                                        key={l.product.id}
                                        className="border-t align-top"
                                    >
                                        <td className="px-3 py-2">
                                            <div className="font-medium">
                                                {l.product.name}
                                            </div>
                                            <div className="font-mono text-xs text-muted-foreground">
                                                {l.product.barcode ??
                                                    l.product.sku ??
                                                    ''}
                                            </div>
                                            {(errors[`items.${i}.quantity`] ||
                                                errors[`items.${i}.cost`]) && (
                                                <div className="text-xs text-red-600">
                                                    {errors[
                                                        `items.${i}.quantity`
                                                    ] ??
                                                        errors[
                                                            `items.${i}.cost`
                                                        ]}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                                            {formatQuantity(l.product.stock)}{' '}
                                            {l.product.unit}
                                        </td>
                                        <td className="px-3 py-2">
                                            <Input
                                                ref={(el) => {
                                                    qtyRefs.current[
                                                        l.product.id
                                                    ] = el;
                                                }}
                                                type="number"
                                                min="0"
                                                step={
                                                    l.product.allows_decimals
                                                        ? '0.001'
                                                        : '1'
                                                }
                                                value={l.quantity}
                                                onChange={(e) =>
                                                    update(l.product.id, {
                                                        quantity:
                                                            e.target.value,
                                                    })
                                                }
                                                onKeyDown={(e) =>
                                                    e.key === 'Enter' &&
                                                    searchRef.current?.focus()
                                                }
                                                className="h-8 text-right tabular-nums"
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <Input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={l.cost}
                                                onChange={(e) =>
                                                    update(l.product.id, {
                                                        cost: e.target.value,
                                                    })
                                                }
                                                onKeyDown={(e) =>
                                                    e.key === 'Enter' &&
                                                    searchRef.current?.focus()
                                                }
                                                className="h-8 text-right tabular-nums"
                                            />
                                            {costChanged && (
                                                <div className="mt-1 text-right text-xs text-muted-foreground">
                                                    antes{' '}
                                                    {formatMoney(
                                                        l.product.cost,
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {formatMoney(price)}
                                            {cost >= price && (
                                                <div className="flex items-center justify-end gap-1 text-xs text-red-600">
                                                    <AlertTriangle className="size-3" />{' '}
                                                    sin margen
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-right font-medium tabular-nums">
                                            {formatMoney(
                                                round2(
                                                    cost *
                                                        (Number(l.quantity) ||
                                                            0),
                                                ),
                                            )}
                                        </td>
                                        <td className="px-1 py-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                aria-label="Quitar"
                                                onClick={() =>
                                                    setLines((prev) =>
                                                        prev.filter(
                                                            (x) =>
                                                                x.product.id !==
                                                                l.product.id,
                                                        ),
                                                    )
                                                }
                                            >
                                                <Trash2 />
                                            </Button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        {lines.length > 0 && (
                            <tfoot className="border-t font-semibold">
                                <tr>
                                    <td className="px-3 py-2" colSpan={5}>
                                        Total ({lines.length} productos)
                                    </td>
                                    <td className="px-3 py-2 text-right text-lg tabular-nums">
                                        {formatMoney(total)}
                                    </td>
                                    <td />
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={updateCosts}
                            onChange={(e) => setUpdateCosts(e.target.checked)}
                        />
                        Actualizar el precio de compra de los productos con este
                        costo
                    </label>
                    <div className="flex gap-2">
                        <Button variant="outline" asChild>
                            <Link href={PurchaseController.index()}>
                                Cancelar
                            </Link>
                        </Button>
                        <Button
                            size="lg"
                            disabled={lines.length === 0 || processing}
                            onClick={submit}
                        >
                            {processing
                                ? 'Guardando…'
                                : 'Registrar compra y sumar al inventario'}
                        </Button>
                    </div>
                </div>
            </div>
        </>
    );
}

PurchasesCreate.layout = {
    breadcrumbs: [
        { title: 'Compras', href: PurchaseController.index() },
        { title: 'Nueva', href: PurchaseController.create() },
    ],
};
