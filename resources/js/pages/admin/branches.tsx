import { Form, Head, router } from '@inertiajs/react';
import { promptDialog } from '@/components/confirm-dialog';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import BranchController from '@/actions/App/Http/Controllers/Admin/BranchController';
import InputError from '@/components/input-error';
import { Badge } from '@/components/ui/badge';
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

type Register = {
    id: number;
    name: string;
    active: boolean;
    open_by: string | null;
};

type Branch = {
    id: number;
    name: string;
    address: string | null;
    phone: string | null;
    active: boolean;
    users_count: number;
    registers: Register[];
};

export default function Branches({ branches }: { branches: Branch[] }) {
    const [editing, setEditing] = useState<Branch | null>(null);
    const [open, setOpen] = useState(false);

    const openForm = (branch: Branch | null) => {
        setEditing(branch);
        setOpen(true);
    };

    const renameRegister = async (r: Register) => {
        const name = await promptDialog({
            title: 'Renombrar caja',
            label: 'Nombre de la caja',
            defaultValue: r.name,
            confirmText: 'Guardar',
            maxLength: 50,
        });
        if (name && name !== r.name) {
            router.put(
                BranchController.updateRegister.url(r.id),
                { name, active: r.active },
                { preserveScroll: true },
            );
        }
    };

    const toggleRegister = (r: Register) =>
        router.put(
            BranchController.updateRegister.url(r.id),
            { name: r.name, active: !r.active },
            { preserveScroll: true },
        );

    const addRegister = async (b: Branch) => {
        const name = await promptDialog({
            title: `Nueva caja en ${b.name}`,
            label: 'Nombre de la caja',
            defaultValue: `Caja ${b.registers.length + 1}`,
            confirmText: 'Agregar caja',
            maxLength: 50,
        });
        if (name) {
            router.post(
                BranchController.storeRegister.url(b.id),
                { name },
                { preserveScroll: true },
            );
        }
    };

    const formProps = editing
        ? BranchController.update.form(editing.id)
        : BranchController.store.form();

    return (
        <>
            <Head title="Sucursales y cajas" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h1 className="text-xl font-semibold">
                        Sucursales y cajas
                    </h1>
                    <Button onClick={() => openForm(null)}>
                        <Plus /> Nueva sucursal
                    </Button>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    {branches.map((b) => (
                        <section key={b.id} className="rounded-xl border p-4">
                            <div className="mb-3 flex items-start justify-between gap-2">
                                <div>
                                    <h2 className="flex items-center gap-2 font-medium">
                                        {b.name}
                                        {!b.active && (
                                            <Badge variant="outline">
                                                Inactiva
                                            </Badge>
                                        )}
                                    </h2>
                                    <p className="text-xs text-muted-foreground">
                                        {[b.address, b.phone]
                                            .filter(Boolean)
                                            .join(' · ') ||
                                            'Sin dirección'}{' '}
                                        · {b.users_count} usuarios
                                    </p>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Editar sucursal"
                                    onClick={() => openForm(b)}
                                >
                                    <Pencil />
                                </Button>
                            </div>

                            <ul className="grid gap-1">
                                {b.registers.map((r) => (
                                    <li
                                        key={r.id}
                                        className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm"
                                    >
                                        <span
                                            className={`flex-1 ${r.active ? '' : 'text-muted-foreground line-through'}`}
                                        >
                                            {r.name}
                                        </span>
                                        {r.open_by && (
                                            <Badge variant="secondary">
                                                Abierta · {r.open_by}
                                            </Badge>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => renameRegister(r)}
                                        >
                                            Renombrar
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => toggleRegister(r)}
                                            disabled={!!r.open_by && r.active}
                                        >
                                            {r.active
                                                ? 'Desactivar'
                                                : 'Activar'}
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                            <Button
                                variant="outline"
                                size="sm"
                                className="mt-3"
                                onClick={() => addRegister(b)}
                            >
                                <Plus /> Agregar caja
                            </Button>
                        </section>
                    ))}
                </div>
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {editing ? 'Editar sucursal' : 'Nueva sucursal'}
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
                                    <Label htmlFor="br-name">Nombre *</Label>
                                    <Input
                                        id="br-name"
                                        name="name"
                                        defaultValue={editing?.name}
                                        required
                                        autoFocus
                                    />
                                    <InputError message={errors.name} />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="br-address">
                                        Dirección
                                    </Label>
                                    <Input
                                        id="br-address"
                                        name="address"
                                        defaultValue={editing?.address ?? ''}
                                    />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="br-phone">Teléfono</Label>
                                    <Input
                                        id="br-phone"
                                        name="phone"
                                        defaultValue={editing?.phone ?? ''}
                                    />
                                </div>
                                {editing && (
                                    <label className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            name="active"
                                            value="1"
                                            defaultChecked={editing.active}
                                        />
                                        Activa
                                    </label>
                                )}
                                {!editing && (
                                    <p className="text-xs text-muted-foreground">
                                        Se crea con una caja ("Caja 1").
                                    </p>
                                )}
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

Branches.layout = {
    breadcrumbs: [
        { title: 'Sucursales y cajas', href: BranchController.index() },
    ],
};
