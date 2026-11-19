import { Head, Link, router } from '@inertiajs/react';
import { AlertTriangle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import PurchaseImportController from '@/actions/App/Http/Controllers/PurchaseImportController';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatMoney, formatQuantity } from '@/lib/format';
import type { Option, Unit } from '@/types/pos';

type Row = {
    index: number;
    sku: string | null;
    sat_code: string | null;
    description: string;
    quantity: string;
    unit_code: string | null;
    unit_name: string | null;
    tax_rate: string;
    unit_cost: string;
    suggested_unit_id: number | null;
    product: {
        id: number;
        name: string;
        sku: string | null;
        cost: string;
        price: string;
        unit: string | null;
        trashed: boolean;
    } | null;
};

type Props = {
    token: string;
    invoice: {
        uuid: string | null;
        number: string | null;
        date: string | null;
        issuer_rfc: string;
        issuer_name: string;
        receiver_rfc: string | null;
        total: string;
    };
    supplier: { id: number; name: string } | null;
    rows: Row[];
    receiverMismatch: boolean;
    units: Unit[];
    categories: Option[];
};

type Decision = {
    include: boolean;
    name: string;
    price: string;
    unit_id: string;
    category_id: string;
};

const selectClass =
    'h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm dark:bg-input/30';

const suggestPrice = (cost: string, margin: number) =>
    (Math.ceil(Number(cost) * (1 + margin / 100) * 100) / 100).toFixed(2);

export default function PurchaseImportReview({
    token,
    invoice,
    supplier,
    rows,
    receiverMismatch,
    units,
    categories,
}: Props) {
    const [margin, setMargin] = useState(30);
    const [updateCosts, setUpdateCosts] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [decisions, setDecisions] = useState<Record<number, Decision>>(() =>
        Object.fromEntries(
            rows.map((r) => [
                r.index,
                {
                    include: true,
                    name: r.description,
                    price: r.product ? '' : suggestPrice(r.unit_cost, 30),
                    unit_id: r.suggested_unit_id
                        ? String(r.suggested_unit_id)
                        : '',
                    category_id: '',
                },
            ]),
        ),
    );

    const update = (index: number, patch: Partial<Decision>) =>
        setDecisions((d) => ({ ...d, [index]: { ...d[index], ...patch } }));

    const applyMargin = (m: number) => {
        setMargin(m);
        setDecisions((d) => {
            const next = { ...d };
            rows.filter((r) => !r.product).forEach((r) => {
                next[r.index] = {
                    ...next[r.index],
                    price: suggestPrice(r.unit_cost, m),
                };
            });
            return next;
        });
    };

    const included = rows.filter((r) => decisions[r.index]?.include);
    const newCount = included.filter((r) => !r.product).length;
    const total = useMemo(
        () =>
            included.reduce(
                (sum, r) => sum + Number(r.unit_cost) * Number(r.quantity),
                0,
            ),
        [included],
    );

    const submit = () => {
        router.post(
            PurchaseImportController.store.url(token),
            {
                update_costs: updateCosts,
                rows: Object.fromEntries(
                    rows.map((r) => {
                        const d = decisions[r.index];
                        return [
                            r.index,
                            {
                                include: d.include,
                                name: d.name || null,
                                price: d.price || null,
                                unit_id: d.unit_id ? Number(d.unit_id) : null,
                                category_id: d.category_id
                                    ? Number(d.category_id)
                                    : null,
                            },
                        ];
                    }),
                ),
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
            <Head title="Revisar factura" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div>
                    <h1 className="text-xl font-semibold">
                        Revisar factura {invoice.number}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Revisa los productos y pon el precio de venta de los
                        nuevos. Nada se guarda hasta que confirmes.
                    </p>
                </div>

                <div className="grid gap-4 rounded-xl border p-4 text-sm sm:grid-cols-4">
                    <div>
                        <div className="text-muted-foreground">Proveedor</div>
                        <div className="font-medium">{invoice.issuer_name}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                            {invoice.issuer_rfc}
                        </div>
                        <div className="mt-1 text-xs">
                            {supplier ? (
                                <span className="text-muted-foreground">
                                    Ya registrado como “{supplier.name}”
                                </span>
                            ) : (
                                <Badge variant="secondary">
                                    Se dará de alta
                                </Badge>
                            )}
                        </div>
                    </div>
                    <div>
                        <div className="text-muted-foreground">Factura</div>
                        <div className="font-medium">{invoice.number}</div>
                        <div className="text-xs text-muted-foreground">
                            {invoice.date
                                ? new Date(invoice.date).toLocaleDateString(
                                      'es-MX',
                                  )
                                : ''}
                        </div>
                    </div>
                    <div>
                        <div className="text-muted-foreground">
                            Total de la factura
                        </div>
                        <div className="text-lg font-semibold tabular-nums">
                            {formatMoney(invoice.total)}
                        </div>
                    </div>
                    <div>
                        <div className="text-muted-foreground">
                            Folio fiscal (UUID)
                        </div>
                        <div className="font-mono text-xs break-all">
                            {invoice.uuid ?? '—'}
                        </div>
                    </div>
                </div>

                {receiverMismatch && (
                    <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        <AlertTriangle className="size-4 shrink-0" />
                        Esta factura no viene a nombre del RFC del negocio (
                        {invoice.receiver_rfc}). Revisa que sea la correcta
                        antes de importarla.
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                        <Label htmlFor="margin">
                            Margen para precios nuevos
                        </Label>
                        <Input
                            id="margin"
                            type="number"
                            min="0"
                            step="1"
                            value={margin}
                            onChange={(e) =>
                                applyMargin(Number(e.target.value) || 0)
                            }
                            className="h-8 w-20 text-right"
                        />
                        <span className="text-muted-foreground">
                            % sobre el costo
                        </span>
                    </div>
                    <label className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={updateCosts}
                            onChange={(e) => setUpdateCosts(e.target.checked)}
                        />
                        Actualizar el precio de compra de los productos que ya
                        existen
                    </label>
                </div>

                <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-left text-xs text-muted-foreground uppercase">
                            <tr>
                                <th className="w-8 px-3 py-2" />
                                <th className="px-3 py-2">SKU</th>
                                <th className="min-w-72 px-3 py-2">Producto</th>
                                <th className="px-3 py-2 text-right">
                                    Cantidad
                                </th>
                                <th className="px-3 py-2 text-right">
                                    Costo c/IVA
                                </th>
                                <th className="w-32 px-3 py-2">Unidad</th>
                                <th className="w-40 px-3 py-2">Categoría</th>
                                <th className="w-32 px-3 py-2 text-right">
                                    Precio de venta
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => {
                                const d = decisions[r.index];
                                const isNew = !r.product;
                                const priceError =
                                    errors[`rows.${r.index}.price`];
                                const unitError =
                                    errors[`rows.${r.index}.unit_id`];
                                const costChanged =
                                    r.product &&
                                    Math.abs(
                                        Number(r.product.cost) -
                                            Number(r.unit_cost),
                                    ) >= 0.005;
                                const lowMargin =
                                    isNew &&
                                    d.price !== '' &&
                                    Number(d.price) <= Number(r.unit_cost);

                                return (
                                    <tr
                                        key={r.index}
                                        className={`border-t align-top ${d.include ? '' : 'opacity-50'}`}
                                    >
                                        <td className="px-3 py-2">
                                            <input
                                                type="checkbox"
                                                checked={d.include}
                                                onChange={(e) =>
                                                    update(r.index, {
                                                        include:
                                                            e.target.checked,
                                                    })
                                                }
                                                aria-label="Importar este producto"
                                            />
                                        </td>
                                        <td className="px-3 py-2 font-mono text-xs">
                                            {r.sku ?? '—'}
                                        </td>
                                        <td className="px-3 py-2">
                                            {isNew ? (
                                                <>
                                                    <Badge
                                                        variant="secondary"
                                                        className="mb-1"
                                                    >
                                                        Nuevo
                                                    </Badge>
                                                    <Input
                                                        value={d.name}
                                                        onChange={(e) =>
                                                            update(r.index, {
                                                                name: e.target
                                                                    .value,
                                                            })
                                                        }
                                                        className="h-8"
                                                        disabled={!d.include}
                                                    />
                                                </>
                                            ) : (
                                                <>
                                                    <div className="font-medium">
                                                        {r.product!.name}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        Ya existe
                                                        {r.product!.trashed
                                                            ? ' (eliminado: se reactivará)'
                                                            : ''}{' '}
                                                        · venta{' '}
                                                        {formatMoney(
                                                            r.product!.price,
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                            <div className="mt-1 text-xs text-muted-foreground">
                                                Factura: {r.description}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {formatQuantity(r.quantity)}
                                            <div className="text-xs text-muted-foreground">
                                                {r.unit_code}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {formatMoney(r.unit_cost)}
                                            {costChanged && (
                                                <div className="text-xs text-muted-foreground">
                                                    antes{' '}
                                                    {formatMoney(
                                                        r.product!.cost,
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-3 py-2">
                                            {isNew ? (
                                                <>
                                                    <select
                                                        value={d.unit_id}
                                                        onChange={(e) =>
                                                            update(r.index, {
                                                                unit_id:
                                                                    e.target
                                                                        .value,
                                                            })
                                                        }
                                                        className={selectClass}
                                                        disabled={!d.include}
                                                    >
                                                        <option value="">
                                                            Elegir…
                                                        </option>
                                                        {units.map((u) => (
                                                            <option
                                                                key={u.id}
                                                                value={u.id}
                                                            >
                                                                {u.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    {unitError && (
                                                        <div className="text-xs text-red-600">
                                                            {unitError}
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <span className="text-muted-foreground">
                                                    {r.product!.unit}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2">
                                            {isNew ? (
                                                <select
                                                    value={d.category_id}
                                                    onChange={(e) =>
                                                        update(r.index, {
                                                            category_id:
                                                                e.target.value,
                                                        })
                                                    }
                                                    className={selectClass}
                                                    disabled={!d.include}
                                                >
                                                    <option value="">
                                                        Sin categoría
                                                    </option>
                                                    {categories.map((c) => (
                                                        <option
                                                            key={c.id}
                                                            value={c.id}
                                                        >
                                                            {c.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">
                                                    —
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            {isNew ? (
                                                <>
                                                    <Input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={d.price}
                                                        onChange={(e) =>
                                                            update(r.index, {
                                                                price: e.target
                                                                    .value,
                                                            })
                                                        }
                                                        className="h-8 text-right tabular-nums"
                                                        aria-invalid={
                                                            !!priceError ||
                                                            lowMargin
                                                        }
                                                        disabled={!d.include}
                                                    />
                                                    {priceError && (
                                                        <div className="text-xs text-red-600">
                                                            {priceError}
                                                        </div>
                                                    )}
                                                    {lowMargin && (
                                                        <div className="text-xs text-red-600">
                                                            sin margen
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                <span className="tabular-nums">
                                                    {formatMoney(
                                                        r.product!.price,
                                                    )}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                        {included.length} de {rows.length} productos ·{' '}
                        {newCount} nuevos · total a costo{' '}
                        <strong className="text-foreground tabular-nums">
                            {formatMoney(total)}
                        </strong>
                    </p>
                    <div className="flex gap-2">
                        <Button variant="outline" asChild>
                            <Link href={PurchaseImportController.create()}>
                                Subir otro archivo
                            </Link>
                        </Button>
                        <Button
                            size="lg"
                            onClick={submit}
                            disabled={processing || included.length === 0}
                        >
                            {processing
                                ? 'Importando…'
                                : 'Importar y sumar al inventario'}
                        </Button>
                    </div>
                </div>
            </div>
        </>
    );
}

PurchaseImportReview.layout = {
    breadcrumbs: [
        { title: 'Compras', href: '/purchases' },
        { title: 'Revisar factura', href: '#' },
    ],
};
