import { Form, Head } from '@inertiajs/react';
import { useState } from 'react';
import BusinessSettingsController from '@/actions/App/Http/Controllers/Admin/BusinessSettingsController';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Settings = {
    business_name: string | null;
    business_rfc: string | null;
    business_address: string | null;
    business_phone: string | null;
    ticket_footer: string | null;
    default_tax_rate: string | null;
    allow_negative_stock: string | null;
};

export default function BusinessSettings({
    settings,
    logoUrl,
}: {
    settings: Settings;
    logoUrl: string | null;
}) {
    const [preview, setPreview] = useState<string | null>(logoUrl);
    const [removeLogo, setRemoveLogo] = useState(false);

    return (
        <>
            <Head title="Datos del negocio" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div>
                    <h1 className="text-xl font-semibold">Datos del negocio</h1>
                    <p className="text-sm text-muted-foreground">
                        Aparecen en el ticket, el menú y los reportes.
                    </p>
                </div>

                <Form
                    {...BusinessSettingsController.update.form()}
                    options={{ preserveScroll: true }}
                    className="grid max-w-3xl gap-4"
                >
                    {({ errors, processing }) => (
                        <>
                            <section className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
                                <div className="grid gap-1.5 sm:col-span-2">
                                    <Label htmlFor="b-name">
                                        Nombre del negocio *
                                    </Label>
                                    <Input
                                        id="b-name"
                                        name="business_name"
                                        defaultValue={
                                            settings.business_name ?? ''
                                        }
                                        required
                                    />
                                    <InputError
                                        message={errors.business_name}
                                    />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="b-rfc">RFC</Label>
                                    <Input
                                        id="b-rfc"
                                        name="business_rfc"
                                        defaultValue={
                                            settings.business_rfc ?? ''
                                        }
                                        maxLength={13}
                                        className="uppercase"
                                    />
                                    <InputError message={errors.business_rfc} />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="b-phone">Teléfono</Label>
                                    <Input
                                        id="b-phone"
                                        name="business_phone"
                                        defaultValue={
                                            settings.business_phone ?? ''
                                        }
                                    />
                                </div>
                                <div className="grid gap-1.5 sm:col-span-2">
                                    <Label htmlFor="b-address">Dirección</Label>
                                    <Input
                                        id="b-address"
                                        name="business_address"
                                        defaultValue={
                                            settings.business_address ?? ''
                                        }
                                    />
                                </div>
                            </section>

                            <section className="grid gap-4 rounded-xl border p-4 sm:grid-cols-[auto_1fr] sm:items-center">
                                <div className="flex size-28 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
                                    {preview && !removeLogo ? (
                                        <img
                                            src={preview}
                                            alt="Logo"
                                            className="max-h-full max-w-full object-contain"
                                        />
                                    ) : (
                                        <span className="text-xs text-muted-foreground">
                                            Sin logo
                                        </span>
                                    )}
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="b-logo">
                                        Logo (PNG o JPG, máx. 1 MB)
                                    </Label>
                                    <Input
                                        id="b-logo"
                                        name="logo"
                                        type="file"
                                        accept="image/png,image/jpeg,image/webp"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                setPreview(
                                                    URL.createObjectURL(file),
                                                );
                                                setRemoveLogo(false);
                                            }
                                        }}
                                    />
                                    <InputError message={errors.logo} />
                                    {logoUrl && (
                                        <label className="flex items-center gap-2 text-sm">
                                            <input
                                                type="checkbox"
                                                name="remove_logo"
                                                value="1"
                                                checked={removeLogo}
                                                onChange={(e) =>
                                                    setRemoveLogo(
                                                        e.target.checked,
                                                    )
                                                }
                                            />
                                            Quitar logo
                                        </label>
                                    )}
                                    <p className="text-xs text-muted-foreground">
                                        Se imprime en blanco y negro en el
                                        ticket.
                                    </p>
                                </div>
                            </section>

                            <section className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
                                <div className="grid gap-1.5 sm:col-span-2">
                                    <Label htmlFor="b-footer">
                                        Pie de ticket
                                    </Label>
                                    <Input
                                        id="b-footer"
                                        name="ticket_footer"
                                        defaultValue={
                                            settings.ticket_footer ?? ''
                                        }
                                    />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="b-tax">
                                        IVA por defecto para productos nuevos
                                    </Label>
                                    <select
                                        id="b-tax"
                                        name="default_tax_rate"
                                        defaultValue={String(
                                            Number(
                                                settings.default_tax_rate ??
                                                    '0.16',
                                            ),
                                        )}
                                        className="h-9 rounded-md border border-input bg-transparent px-3 text-sm dark:bg-input/30"
                                    >
                                        <option value="0.16">16%</option>
                                        <option value="0.08">
                                            8% (frontera)
                                        </option>
                                        <option value="0">0% / Exento</option>
                                    </select>
                                </div>
                                <label className="flex items-start gap-2 self-end pb-1 text-sm">
                                    <input
                                        type="checkbox"
                                        name="allow_negative_stock"
                                        value="1"
                                        defaultChecked={
                                            settings.allow_negative_stock ===
                                            '1'
                                        }
                                        className="mt-1"
                                    />
                                    <span>
                                        Permitir vender sin existencia
                                        <span className="block text-xs text-muted-foreground">
                                            Desactivado (recomendado): no se
                                            puede cobrar más de lo que hay en
                                            existencia. Activado: solo se
                                            muestra un aviso y la existencia
                                            puede quedar en negativo.
                                        </span>
                                    </span>
                                </label>
                            </section>

                            <div>
                                <Button type="submit" disabled={processing}>
                                    Guardar configuración
                                </Button>
                            </div>
                        </>
                    )}
                </Form>
            </div>
        </>
    );
}

BusinessSettings.layout = {
    breadcrumbs: [
        { title: 'Datos del negocio', href: BusinessSettingsController.edit() },
    ],
};
