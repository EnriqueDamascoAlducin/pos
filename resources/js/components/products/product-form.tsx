import { Form, Link } from '@inertiajs/react';
import { useState } from 'react';
import ProductController from '@/actions/App/Http/Controllers/ProductController';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatMoney, formatQuantity, marginPercent } from '@/lib/format';
import type { Option, Unit, ValuedProduct } from '@/types/pos';

type Props = {
    product?: ValuedProduct;
    categories: Option[];
    units: Unit[];
    defaultTaxRate?: string;
};

const selectClass =
    'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs dark:bg-input/30';

function Field({
    label,
    error,
    children,
    hint,
}: {
    label: string;
    error?: string;
    hint?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="grid gap-1.5">
            <Label>{label}</Label>
            {children}
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            <InputError message={error} />
        </div>
    );
}

/** "1.000" → "1", "0.100" → "0.1" */
const trimQty = (v: string) => String(Number(v));

export default function ProductForm({
    product,
    categories,
    units,
    defaultTaxRate,
}: Props) {
    const isEdit = !!product;
    const [cost, setCost] = useState(product?.cost ?? '');
    const [price, setPrice] = useState(product?.price ?? '');
    const [initialStock, setInitialStock] = useState('');

    // Reglas de venta: piezas completas desde 1; a granel desde 0.1 en cualquier fracción.
    const [unitId, setUnitId] = useState<number>(
        product?.unit_id ??
            (units.find((u) => u.abbreviation === 'pza') ?? units[0])?.id,
    );
    const [granel, setGranel] = useState(product?.sells_by_weight ?? false);
    const [minQty, setMinQty] = useState(
        trimQty(product?.min_sale_quantity ?? '1'),
    );
    const [step, setStep] = useState(trimQty(product?.sale_step ?? '1'));

    const unit = units.find((u) => u.id === unitId);
    const unitAbbr = unit?.abbreviation ?? 'pza';
    const decimals = granel || !!unit?.allows_decimals;

    const toggleGranel = (on: boolean) => {
        setGranel(on);
        // Solo cambia los valores si siguen en el default del otro modo.
        if (on && minQty === '1' && step === '1') {
            setMinQty('0.1');
            setStep('0.001');
        } else if (!on && minQty === '0.1' && step === '0.001') {
            setMinQty('1');
            setStep('1');
        }
    };

    const margin = marginPercent(cost, price);
    const stock = isEdit ? Number(product.stock) : Number(initialStock || 0);

    const formProps = isEdit
        ? ProductController.update.form(product.id)
        : ProductController.store.form();

    return (
        <Form {...formProps} className="grid gap-6 lg:grid-cols-3">
            {({ errors, processing }) => (
                <>
                    <div className="grid content-start gap-4 lg:col-span-2">
                        <section className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
                            <h2 className="font-medium sm:col-span-2">
                                Datos generales
                            </h2>

                            <div className="sm:col-span-2">
                                <Field label="Nombre *" error={errors.name}>
                                    <Input
                                        name="name"
                                        defaultValue={product?.name}
                                        required
                                        autoFocus
                                    />
                                </Field>
                            </div>

                            <Field label="SKU" error={errors.sku}>
                                <Input
                                    name="sku"
                                    defaultValue={product?.sku ?? ''}
                                />
                            </Field>

                            <Field
                                label="Código de barras"
                                error={errors.barcode}
                                hint="Puedes escanearlo con el lector"
                            >
                                <Input
                                    name="barcode"
                                    defaultValue={product?.barcode ?? ''}
                                    onKeyDown={(e) =>
                                        e.key === 'Enter' && e.preventDefault()
                                    }
                                />
                            </Field>

                            <Field label="Categoría" error={errors.category_id}>
                                <select
                                    name="category_id"
                                    defaultValue={product?.category_id ?? ''}
                                    className={selectClass}
                                >
                                    <option value="">Sin categoría</option>
                                    {categories.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name}
                                        </option>
                                    ))}
                                </select>
                            </Field>

                            <Field label="Unidad *" error={errors.unit_id}>
                                <select
                                    name="unit_id"
                                    value={unitId}
                                    onChange={(e) =>
                                        setUnitId(Number(e.target.value))
                                    }
                                    className={selectClass}
                                    required
                                >
                                    {units.map((u) => (
                                        <option key={u.id} value={u.id}>
                                            {u.name} ({u.abbreviation})
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        </section>

                        <section className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
                            <h2 className="font-medium sm:col-span-2">
                                Precios
                            </h2>

                            <Field
                                label="Precio de compra *"
                                error={errors.cost}
                                hint="Lo que te cuesta cada unidad"
                            >
                                <Input
                                    name="cost"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    inputMode="decimal"
                                    value={cost}
                                    onChange={(e) => setCost(e.target.value)}
                                    required
                                />
                            </Field>

                            <Field
                                label="Precio de venta *"
                                error={errors.price}
                                hint="Precio al público"
                            >
                                <Input
                                    name="price"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    inputMode="decimal"
                                    value={price}
                                    onChange={(e) => setPrice(e.target.value)}
                                    required
                                />
                            </Field>

                            {margin !== null && (
                                <p
                                    className={`text-sm sm:col-span-2 ${margin < 0 ? 'text-red-600' : 'text-muted-foreground'}`}
                                >
                                    Ganancia por unidad:{' '}
                                    <strong>
                                        {formatMoney(
                                            Number(price) - Number(cost),
                                        )}
                                    </strong>{' '}
                                    ({margin.toFixed(1)}% de margen)
                                    {margin < 0 &&
                                        ' — estás vendiendo por debajo del costo'}
                                </p>
                            )}

                            <Field
                                label="Precio de mayoreo"
                                error={errors.wholesale_price}
                            >
                                <Input
                                    name="wholesale_price"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    defaultValue={
                                        product?.wholesale_price ?? ''
                                    }
                                />
                            </Field>

                            <Field
                                label="Mayoreo a partir de"
                                error={errors.wholesale_min_quantity}
                                hint="Cantidad mínima para aplicar mayoreo"
                            >
                                <Input
                                    name="wholesale_min_quantity"
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    defaultValue={
                                        product?.wholesale_min_quantity ?? ''
                                    }
                                />
                            </Field>

                            <Field label="IVA" error={errors.tax_rate}>
                                <select
                                    name="tax_rate"
                                    defaultValue={
                                        product
                                            ? String(Number(product.tax_rate))
                                            : (defaultTaxRate ?? '0.16')
                                    }
                                    className={selectClass}
                                >
                                    <option value="0.16">16%</option>
                                    <option value="0.08">8% (frontera)</option>
                                    <option value="0">0% / Exento</option>
                                </select>
                            </Field>

                            <label className="flex items-center gap-2 self-end pb-2 text-sm">
                                <input
                                    type="checkbox"
                                    name="price_includes_tax"
                                    value="1"
                                    defaultChecked={
                                        product?.price_includes_tax ?? true
                                    }
                                />
                                El precio de venta ya incluye IVA
                            </label>
                        </section>

                        <section className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
                            <h2 className="font-medium sm:col-span-2">
                                Cómo se vende
                            </h2>

                            <label className="flex items-center gap-2 text-sm sm:col-span-2">
                                <input
                                    type="checkbox"
                                    name="sells_by_weight"
                                    value="1"
                                    checked={granel}
                                    onChange={(e) =>
                                        toggleGranel(e.target.checked)
                                    }
                                />
                                Se vende a granel (báscula)
                            </label>

                            <Field
                                label="Cantidad mínima de venta *"
                                error={errors.min_sale_quantity}
                                hint={`Lo menos que se puede vender en una partida (${unitAbbr})`}
                            >
                                <Input
                                    name="min_sale_quantity"
                                    type="number"
                                    min={decimals ? '0.001' : '1'}
                                    step={decimals ? '0.001' : '1'}
                                    value={minQty}
                                    onChange={(e) => setMinQty(e.target.value)}
                                    required
                                />
                            </Field>

                            <Field
                                label="Se vende en múltiplos de *"
                                error={errors.sale_step}
                                hint={
                                    decimals
                                        ? 'Ej. 0.001 = cualquier fracción; 0.5 = de medio en medio'
                                        : 'Ej. 1 = por pieza; 6 = de 6 en 6'
                                }
                            >
                                <Input
                                    name="sale_step"
                                    type="number"
                                    min={decimals ? '0.001' : '1'}
                                    step={decimals ? '0.001' : '1'}
                                    value={step}
                                    onChange={(e) => setStep(e.target.value)}
                                    required
                                />
                            </Field>

                            <p className="text-xs text-muted-foreground sm:col-span-2">
                                {decimals
                                    ? `Se puede vender en fracciones de ${unitAbbr}.`
                                    : `Se vende por ${unitAbbr} completa: el punto de venta no aceptará decimales (por ejemplo, 0.2 piezas).`}
                            </p>
                        </section>

                        <section className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
                            <h2 className="font-medium sm:col-span-2">
                                Inventario
                            </h2>

                            {!isEdit && (
                                <Field
                                    label="Existencia inicial"
                                    error={errors.initial_stock}
                                    hint="Se registra como movimiento de inventario"
                                >
                                    <Input
                                        name="initial_stock"
                                        type="number"
                                        step="0.001"
                                        min="0"
                                        value={initialStock}
                                        onChange={(e) =>
                                            setInitialStock(e.target.value)
                                        }
                                    />
                                </Field>
                            )}

                            <Field
                                label="Existencia mínima"
                                error={errors.min_stock}
                                hint="Para alertas de resurtido"
                            >
                                <Input
                                    name="min_stock"
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    defaultValue={product?.min_stock ?? '0'}
                                />
                            </Field>

                            <div className="grid gap-2 text-sm sm:col-span-2">
                                {(
                                    [
                                        [
                                            'tracks_inventory',
                                            'Controlar inventario',
                                            product?.tracks_inventory ?? true,
                                        ],
                                        [
                                            'active',
                                            'Activo (disponible para venta)',
                                            product?.active ?? true,
                                        ],
                                    ] as const
                                ).map(([name, label, checked]) => (
                                    <label
                                        key={name}
                                        className="flex items-center gap-2"
                                    >
                                        <input
                                            type="checkbox"
                                            name={name}
                                            value="1"
                                            defaultChecked={checked}
                                        />
                                        {label}
                                    </label>
                                ))}
                            </div>
                        </section>
                    </div>

                    <aside className="grid content-start gap-4">
                        <section className="rounded-xl border p-4">
                            <h2 className="mb-3 font-medium">
                                Valor en bodega
                            </h2>
                            <dl className="grid gap-2 text-sm">
                                <div className="flex justify-between">
                                    <dt className="text-muted-foreground">
                                        Existencia
                                    </dt>
                                    <dd className="tabular-nums">
                                        {formatQuantity(stock)}
                                    </dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-muted-foreground">
                                        A precio de compra
                                    </dt>
                                    <dd className="font-medium tabular-nums">
                                        {formatMoney(stock * Number(cost || 0))}
                                    </dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-muted-foreground">
                                        A precio de venta
                                    </dt>
                                    <dd className="font-medium tabular-nums">
                                        {formatMoney(
                                            stock * Number(price || 0),
                                        )}
                                    </dd>
                                </div>
                                <div className="flex justify-between border-t pt-2">
                                    <dt className="text-muted-foreground">
                                        Utilidad potencial
                                    </dt>
                                    <dd className="font-medium text-green-700 tabular-nums dark:text-green-500">
                                        {formatMoney(
                                            stock *
                                                (Number(price || 0) -
                                                    Number(cost || 0)),
                                        )}
                                    </dd>
                                </div>
                            </dl>
                            {isEdit && (
                                <p className="mt-3 text-xs text-muted-foreground">
                                    La existencia se modifica con compras o
                                    ajustes de inventario, no desde aquí.
                                </p>
                            )}
                        </section>

                        <div className="flex gap-2">
                            <Button
                                type="submit"
                                disabled={processing}
                                className="flex-1"
                            >
                                {isEdit
                                    ? 'Guardar cambios'
                                    : 'Registrar producto'}
                            </Button>
                            <Button variant="outline" asChild>
                                <Link href={ProductController.index()}>
                                    Cancelar
                                </Link>
                            </Button>
                        </div>
                    </aside>
                </>
            )}
        </Form>
    );
}
