import { Form, Head } from '@inertiajs/react';
import { FileCode2 } from 'lucide-react';
import PurchaseController from '@/actions/App/Http/Controllers/PurchaseController';
import PurchaseImportController from '@/actions/App/Http/Controllers/PurchaseImportController';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function PurchaseImport() {
    return (
        <>
            <Head title="Importar factura" />
            <div className="flex flex-1 items-start justify-center p-4">
                <div className="w-full max-w-lg rounded-xl border p-6">
                    <div className="mb-4 flex items-center gap-3">
                        <FileCode2 className="size-8 text-muted-foreground" />
                        <div>
                            <h1 className="text-xl font-semibold">
                                Importar factura del proveedor
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                Sube el <strong>XML</strong> de la factura
                                (CFDI). Revisas los productos antes de guardar.
                            </p>
                        </div>
                    </div>

                    <Form
                        {...PurchaseImportController.upload.form()}
                        className="grid gap-4"
                    >
                        {({ errors, processing }) => (
                            <>
                                <div className="grid gap-1.5">
                                    <Input
                                        name="file"
                                        type="file"
                                        accept=".xml,text/xml,application/xml"
                                        required
                                    />
                                    <InputError message={errors.file} />
                                </div>
                                <Button type="submit" disabled={processing}>
                                    {processing
                                        ? 'Leyendo factura…'
                                        : 'Leer factura'}
                                </Button>
                            </>
                        )}
                    </Form>

                    <ul className="mt-6 grid gap-1 text-xs text-muted-foreground">
                        <li>
                            • Usa el archivo .xml, no el PDF: el XML trae los
                            datos exactos que valida el SAT.
                        </li>
                        <li>
                            • Si solo tienes el PDF, pídele el XML al proveedor
                            o descárgalo del portal del SAT.
                        </li>
                        <li>
                            • Los productos se reconocen por su SKU (No. de
                            identificación de la factura).
                        </li>
                        <li>
                            • Una misma factura no se puede importar dos veces.
                        </li>
                    </ul>
                </div>
            </div>
        </>
    );
}

PurchaseImport.layout = {
    breadcrumbs: [
        { title: 'Compras', href: PurchaseController.index() },
        { title: 'Importar factura', href: PurchaseImportController.create() },
    ],
};
