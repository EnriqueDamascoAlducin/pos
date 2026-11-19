import { Form, Head, router } from '@inertiajs/react';
import { confirmDialog } from '@/components/confirm-dialog';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import SupplierController from '@/actions/App/Http/Controllers/SupplierController';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatMoney } from '@/lib/format';
import type { Paginated } from '@/types/pos';

type Supplier = {
    id: number;
    name: string;
    contact: string | null;
    phone: string | null;
    email: string | null;
    purchases_count: number;
    purchases_sum_total: string | null;
};

type Props = {
    suppliers: Paginated<Supplier>;
    filters: { search: string };
};

export default function SuppliersIndex({ suppliers, filters }: Props) {
    const [editing, setEditing] = useState<Supplier | null>(null);
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState(filters.search ?? '');

    const openForm = (supplier: Supplier | null) => {
        setEditing(supplier);
        setOpen(true);
    };

    const formProps = editing
        ? SupplierController.update.form(editing.id)
        : SupplierController.store.form();

    return (
        <>
            <Head title="Proveedores" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h1 className="text-xl font-semibold">Proveedores</h1>
                    <Button onClick={() => openForm(null)}>
                        <Plus /> Nuevo proveedor
                    </Button>
                </div>

                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        router.get(
                            SupplierController.index.url(),
                            { search: search || undefined },
                            { preserveState: true, replace: true },
                        );
                    }}
                >
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar proveedor"
                        className="max-w-sm"
                    />
                </form>

                <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-left text-xs text-muted-foreground uppercase">
                            <tr>
                                <th className="px-3 py-2">Nombre</th>
                                <th className="px-3 py-2">Contacto</th>
                                <th className="px-3 py-2">Teléfono</th>
                                <th className="px-3 py-2 text-right">
                                    Compras
                                </th>
                                <th className="px-3 py-2 text-right">
                                    Total comprado
                                </th>
                                <th className="px-3 py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {suppliers.data.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={6}
                                        className="px-3 py-8 text-center text-muted-foreground"
                                    >
                                        No hay proveedores.
                                    </td>
                                </tr>
                            )}
                            {suppliers.data.map((s) => (
                                <tr key={s.id} className="border-t">
                                    <td className="px-3 py-2 font-medium">
                                        {s.name}
                                    </td>
                                    <td className="px-3 py-2">
                                        {s.contact ?? '—'}
                                    </td>
                                    <td className="px-3 py-2">
                                        {s.phone ?? '—'}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums">
                                        {s.purchases_count}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums">
                                        {formatMoney(s.purchases_sum_total)}
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex justify-end gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                aria-label="Editar"
                                                onClick={() => openForm(s)}
                                            >
                                                <Pencil />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                aria-label="Eliminar"
                                                onClick={async () => {
                                                    const ok =
                                                        await confirmDialog({
                                                            title: `¿Eliminar a "${s.name}"?`,
                                                            description:
                                                                'Ya no aparecerá al registrar compras. Las compras anteriores conservan su proveedor.',
                                                            confirmText:
                                                                'Eliminar',
                                                            destructive: true,
                                                        });

                                                    if (ok) {
                                                        router.delete(
                                                            SupplierController.destroy.url(
                                                                s.id,
                                                            ),
                                                            {
                                                                preserveScroll: true,
                                                            },
                                                        );
                                                    }
                                                }}
                                            >
                                                <Trash2 />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {editing ? 'Editar proveedor' : 'Nuevo proveedor'}
                        </DialogTitle>
                    </DialogHeader>
                    <Form
                        key={editing?.id ?? 'new'}
                        {...formProps}
                        options={{ preserveScroll: true }}
                        onSuccess={() => setOpen(false)}
                        className="grid gap-4"
                    >
                        {({ errors, processing }) => (
                            <>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="s-name">Nombre *</Label>
                                    <Input
                                        id="s-name"
                                        name="name"
                                        defaultValue={editing?.name}
                                        required
                                        autoFocus
                                    />
                                    <InputError message={errors.name} />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="s-contact">Contacto</Label>
                                    <Input
                                        id="s-contact"
                                        name="contact"
                                        defaultValue={editing?.contact ?? ''}
                                    />
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="grid gap-1.5">
                                        <Label htmlFor="s-phone">
                                            Teléfono
                                        </Label>
                                        <Input
                                            id="s-phone"
                                            name="phone"
                                            defaultValue={editing?.phone ?? ''}
                                        />
                                        <InputError message={errors.phone} />
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label htmlFor="s-email">Correo</Label>
                                        <Input
                                            id="s-email"
                                            name="email"
                                            type="email"
                                            defaultValue={editing?.email ?? ''}
                                        />
                                        <InputError message={errors.email} />
                                    </div>
                                </div>
                                <DialogFooter>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setOpen(false)}
                                    >
                                        Cancelar
                                    </Button>
                                    <Button type="submit" disabled={processing}>
                                        Guardar
                                    </Button>
                                </DialogFooter>
                            </>
                        )}
                    </Form>
                </DialogContent>
            </Dialog>
        </>
    );
}

SuppliersIndex.layout = {
    breadcrumbs: [{ title: 'Proveedores', href: SupplierController.index() }],
};
