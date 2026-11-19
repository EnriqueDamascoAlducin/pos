import { Form, Head, router } from '@inertiajs/react';
import {
    AlertTriangle,
    CheckCircle2,
    Download,
    FileSpreadsheet,
    RefreshCw,
    Upload,
} from 'lucide-react';
import { useState } from 'react';
import ProductController from '@/actions/App/Http/Controllers/ProductController';
import ProductImportController from '@/actions/App/Http/Controllers/ProductImportController';
import { confirmDialog } from '@/components/confirm-dialog';
import InputError from '@/components/input-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatMoney, formatQuantity } from '@/lib/format';

type ColumnGuide = {
    key: string;
    required: boolean;
    description: string;
    example: string;
};

type PreviewRow = {
    line: number;
    action: 'create' | 'update' | 'error';
    errors: string[];
    name: string;
    code: string;
    cost: string | null;
    price: string | null;
    stock: string | null;
    stock_applies: boolean;
    unit: string | null;
    category: string | null;
    new_category: string | null;
    existing_name: string | null;
    reactivates: boolean;
};

type Preview = {
    token: string;
    adjust_existing: boolean;
    stats: {
        total: number;
        create: number;
        update: number;
        errors: number;
        new_categories: number;
        stock_units: string;
    };
    columns: string[];
    ignored_columns: string[];
    rows: PreviewRow[];
    hidden_valid_rows: number;
};

type Props = {
    columns: ColumnGuide[];
    units: { name: string; abbreviation: string; allows_decimals: boolean }[];
    maxRows: number;
    preview: Preview | null;
};

export default function ProductImport({
    columns,
    units,
    maxRows,
    preview,
}: Props) {
    return (
        <>
            <Head title="Importar productos" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h1 className="text-xl font-semibold">
                            Importar productos
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Carga tu catálogo desde un archivo CSV (Excel →
                            Guardar como → CSV UTF-8).
                        </p>
                    </div>
                    <Button variant="outline" asChild>
                        <a href={ProductImportController.template.url()}>
                            <Download /> Descargar plantilla
                        </a>
                    </Button>
                </div>

                {preview ? (
                    <PreviewStep preview={preview} />
                ) : (
                    <UploadStep
                        columns={columns}
                        units={units}
                        maxRows={maxRows}
                    />
                )}
            </div>
        </>
    );
}

/* ------------------------------ Paso 1 ------------------------------ */

function UploadStep({ columns, units, maxRows }: Omit<Props, 'preview'>) {
    return (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <section className="h-fit rounded-xl border p-4">
                <h2 className="mb-3 font-medium">1. Sube tu archivo</h2>
                <Form
                    {...ProductImportController.upload.form()}
                    className="grid gap-4"
                >
                    {({ errors, processing }) => (
                        <>
                            <div className="grid gap-1.5">
                                <Label htmlFor="file">Archivo CSV</Label>
                                <Input
                                    id="file"
                                    name="file"
                                    type="file"
                                    accept=".csv,text/csv"
                                    required
                                />
                                <InputError message={errors.file} />
                                <p className="text-xs text-muted-foreground">
                                    Hasta {maxRows.toLocaleString('es-MX')}{' '}
                                    productos por archivo. Acepta separador coma
                                    o punto y coma, y archivos guardados desde
                                    Excel.
                                </p>
                            </div>

                            <label className="flex items-start gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    name="adjust_existing"
                                    value="1"
                                    className="mt-1"
                                />
                                <span>
                                    Actualizar también la existencia de
                                    productos que ya están dados de alta
                                    <span className="block text-xs text-muted-foreground">
                                        Se registra como conteo físico. Si no lo
                                        marcas, en esos productos solo se
                                        actualizan nombre, precios y demás
                                        datos.
                                    </span>
                                </span>
                            </label>

                            <Button type="submit" disabled={processing}>
                                <Upload />{' '}
                                {processing
                                    ? 'Revisando archivo…'
                                    : 'Revisar archivo'}
                            </Button>
                            <p className="text-xs text-muted-foreground">
                                Todavía no se guarda nada: primero verás una
                                vista previa.
                            </p>
                        </>
                    )}
                </Form>

                {units.length > 0 && (
                    <div className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                            Unidades disponibles:{' '}
                        </span>
                        {units
                            .map((u) => `${u.abbreviation} (${u.name})`)
                            .join(', ')}
                    </div>
                )}
            </section>

            <section className="rounded-xl border">
                <h2 className="px-4 pt-3 font-medium">Columnas del archivo</h2>
                <p className="px-4 pb-2 text-xs text-muted-foreground">
                    La primera fila son los encabezados. El orden no importa y
                    puedes omitir las opcionales.
                </p>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-left text-xs text-muted-foreground uppercase">
                            <tr>
                                <th className="px-4 py-2">Columna</th>
                                <th className="px-3 py-2">Descripción</th>
                                <th className="px-3 py-2">Ejemplo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {columns.map((c) => (
                                <tr key={c.key} className="border-t">
                                    <td className="px-4 py-1.5 font-mono text-xs whitespace-nowrap">
                                        {c.key}
                                        {c.required && (
                                            <span className="ml-1 text-red-600">
                                                *
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-3 py-1.5 text-muted-foreground">
                                        {c.description}
                                    </td>
                                    <td className="px-3 py-1.5 font-mono text-xs whitespace-nowrap">
                                        {c.example}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}

/* ------------------------------ Paso 2 ------------------------------ */

function PreviewStep({ preview }: { preview: Preview }) {
    const { stats } = preview;
    const [onlyErrors, setOnlyErrors] = useState(stats.errors > 0);
    const [processing, setProcessing] = useState(false);
    const importable = stats.create + stats.update;
    const rows = onlyErrors
        ? preview.rows.filter((r) => r.action === 'error')
        : preview.rows;

    const runImport = async () => {
        const ok = await confirmDialog({
            title: `¿Importar ${importable} productos?`,
            description:
                stats.errors > 0
                    ? `${stats.create} nuevos y ${stats.update} actualizados. Las ${stats.errors} filas con error NO se importarán; puedes corregirlas y subir el archivo otra vez después.`
                    : `${stats.create} nuevos y ${stats.update} actualizados.`,
            confirmText: 'Importar',
            destructive: false,
        });
        if (!ok) return;

        router.post(
            ProductImportController.store.url(preview.token),
            { adjust_existing: preview.adjust_existing ? 1 : 0 },
            {
                onStart: () => setProcessing(true),
                onFinish: () => setProcessing(false),
            },
        );
    };

    const cancel = () =>
        router.delete(ProductImportController.destroy.url(preview.token));

    return (
        <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="Productos nuevos" value={stats.create} tone="ok" />
                <Stat label="Ya existen (se actualizan)" value={stats.update} />
                <Stat
                    label="Filas con error"
                    value={stats.errors}
                    tone={stats.errors > 0 ? 'error' : undefined}
                />
                <Stat
                    label="Existencia a cargar"
                    value={formatQuantity(stats.stock_units)}
                    hint={
                        stats.new_categories > 0
                            ? `y ${stats.new_categories} categorías nuevas`
                            : undefined
                    }
                />
            </div>

            {preview.ignored_columns.length > 0 && (
                <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    Columnas que no se reconocieron y se ignorarán:{' '}
                    <strong>{preview.ignored_columns.join(', ')}</strong>.
                    Revisa los nombres en la plantilla si alguna debía
                    importarse.
                </p>
            )}

            {!preview.adjust_existing && stats.update > 0 && (
                <p className="text-sm text-muted-foreground">
                    En los {stats.update} productos que ya existen no se
                    modificará la existencia (no marcaste esa opción).
                </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={onlyErrors}
                        onChange={(e) => setOnlyErrors(e.target.checked)}
                    />
                    Ver solo filas con error
                </label>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={cancel}
                        disabled={processing}
                    >
                        <RefreshCw /> Subir otro archivo
                    </Button>
                    <Button
                        onClick={runImport}
                        disabled={importable === 0 || processing}
                    >
                        <FileSpreadsheet />{' '}
                        {processing
                            ? 'Importando…'
                            : `Importar ${importable} productos`}
                    </Button>
                </div>
            </div>

            <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs text-muted-foreground uppercase">
                        <tr>
                            <th className="px-3 py-2">Fila</th>
                            <th className="px-3 py-2">Estado</th>
                            <th className="px-3 py-2">Código</th>
                            <th className="px-3 py-2">Producto</th>
                            <th className="px-3 py-2 text-right">P. compra</th>
                            <th className="px-3 py-2 text-right">P. venta</th>
                            <th className="px-3 py-2 text-right">Existencia</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 && (
                            <tr>
                                <td
                                    colSpan={7}
                                    className="px-3 py-8 text-center text-muted-foreground"
                                >
                                    {onlyErrors
                                        ? 'No hay filas con error.'
                                        : 'El archivo no tiene productos.'}
                                </td>
                            </tr>
                        )}
                        {rows.map((r) => (
                            <tr
                                key={r.line}
                                className={`border-t align-top ${r.action === 'error' ? 'bg-red-50/60 dark:bg-red-950/20' : ''}`}
                            >
                                <td className="px-3 py-2 text-muted-foreground tabular-nums">
                                    {r.line}
                                </td>
                                <td className="px-3 py-2">
                                    {r.action === 'create' && (
                                        <Badge>Nuevo</Badge>
                                    )}
                                    {r.action === 'update' && (
                                        <Badge variant="secondary">
                                            {r.reactivates
                                                ? 'Se reactiva'
                                                : 'Actualiza'}
                                        </Badge>
                                    )}
                                    {r.action === 'error' && (
                                        <Badge variant="destructive">
                                            Error
                                        </Badge>
                                    )}
                                </td>
                                <td className="px-3 py-2 font-mono text-xs">
                                    {r.code || '—'}
                                </td>
                                <td className="px-3 py-2">
                                    <div className="font-medium">
                                        {r.name || '(sin nombre)'}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {[r.category, r.unit]
                                            .filter(Boolean)
                                            .join(' · ')}
                                        {r.new_category && ' (categoría nueva)'}
                                        {r.action === 'update' &&
                                            r.existing_name &&
                                            r.existing_name !== r.name && (
                                                <> · antes: {r.existing_name}</>
                                            )}
                                    </div>
                                    {r.errors.length > 0 && (
                                        <ul className="mt-1 grid gap-0.5 text-xs text-red-600">
                                            {r.errors.map((e) => (
                                                <li
                                                    key={e}
                                                    className="flex gap-1"
                                                >
                                                    <AlertTriangle className="mt-0.5 size-3 shrink-0" />{' '}
                                                    {e}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                    {r.cost !== null
                                        ? formatMoney(r.cost)
                                        : '—'}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                    {r.price !== null
                                        ? formatMoney(r.price)
                                        : '—'}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">
                                    {r.stock === null ? (
                                        '—'
                                    ) : (
                                        <span
                                            className={
                                                r.stock_applies
                                                    ? ''
                                                    : 'text-muted-foreground line-through'
                                            }
                                        >
                                            {formatQuantity(r.stock)}
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {!onlyErrors && preview.hidden_valid_rows > 0 && (
                <p className="text-center text-xs text-muted-foreground">
                    …y {preview.hidden_valid_rows.toLocaleString('es-MX')}{' '}
                    productos válidos más que no se muestran aquí, pero sí se
                    importan.
                </p>
            )}
        </>
    );
}

function Stat({
    label,
    value,
    tone,
    hint,
}: {
    label: string;
    value: number | string;
    tone?: 'ok' | 'error';
    hint?: string;
}) {
    return (
        <div className="rounded-xl border p-4">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {tone === 'ok' && (
                    <CheckCircle2 className="size-4 text-green-600" />
                )}
                {tone === 'error' && (
                    <AlertTriangle className="size-4 text-red-600" />
                )}
                {label}
            </div>
            <div
                className={`mt-1 text-2xl font-semibold tabular-nums ${tone === 'error' ? 'text-red-600' : ''}`}
            >
                {value}
            </div>
            {hint && (
                <div className="text-xs text-muted-foreground">{hint}</div>
            )}
        </div>
    );
}

ProductImport.layout = {
    breadcrumbs: [
        { title: 'Productos', href: ProductController.index() },
        { title: 'Importar', href: ProductImportController.create() },
    ],
};
