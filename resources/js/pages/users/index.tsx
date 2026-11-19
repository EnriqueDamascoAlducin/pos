import { Form, Head, usePage } from '@inertiajs/react';
import { KeyRound, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import UserController from '@/actions/App/Http/Controllers/UserController';
import InputError from '@/components/input-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Option } from '@/types/pos';

type UserRow = {
    id: number;
    employee_number: string | null;
    name: string;
    email: string | null;
    active: boolean;
    role: string | null;
    branch_id: number | null;
    branch: string | null;
    has_pin: boolean;
};

type Role = { name: string; permissions: string[] };

type Props = {
    users: UserRow[];
    roles: Role[];
    branches: Option[];
    nextEmployeeNumber: string;
};

const ROLE_LABELS: Record<string, string> = {
    admin: 'Administrador',
    encargado: 'Encargado',
    cajero: 'Cajero',
};

/** Roles que pueden autorizar descuentos y cambios de precio (tienen el permiso "Aplicar descuentos"). */
const CAN_AUTHORIZE = ['admin', 'encargado'];

const selectClass =
    'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm dark:bg-input/30';

export default function UsersIndex({
    users,
    roles,
    branches,
    nextEmployeeNumber,
}: Props) {
    const { auth } = usePage().props;
    const [editing, setEditing] = useState<UserRow | null>(null);
    const [open, setOpen] = useState(false);
    const [role, setRole] = useState('cajero');

    const openForm = (user: UserRow | null) => {
        setEditing(user);
        setRole(user?.role ?? 'cajero');
        setOpen(true);
    };

    const formProps = editing
        ? UserController.update.form(editing.id)
        : UserController.store.form();
    const selectedRole = roles.find((r) => r.name === role);
    const authorizes = CAN_AUTHORIZE.includes(role);

    return (
        <>
            <Head title="Usuarios" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h1 className="text-xl font-semibold">Usuarios</h1>
                        <p className="text-sm text-muted-foreground">
                            Cada persona entra con su número de usuario y su
                            contraseña.
                        </p>
                    </div>
                    <Button onClick={() => openForm(null)}>
                        <Plus /> Nuevo usuario
                    </Button>
                </div>

                <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-left text-xs text-muted-foreground uppercase">
                            <tr>
                                <th className="px-3 py-2">Número</th>
                                <th className="px-3 py-2">Nombre</th>
                                <th className="px-3 py-2">Rol</th>
                                <th className="px-3 py-2">Sucursal</th>
                                <th className="px-3 py-2">Autoriza</th>
                                <th className="px-3 py-2">Estado</th>
                                <th className="px-3 py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((u) => (
                                <tr
                                    key={u.id}
                                    className={`border-t ${u.active ? '' : 'text-muted-foreground'}`}
                                >
                                    <td className="px-3 py-2 font-mono font-medium">
                                        {u.employee_number ?? '—'}
                                    </td>
                                    <td className="px-3 py-2">
                                        <span className="font-medium">
                                            {u.name}
                                        </span>
                                        {u.id === auth.user.id && (
                                            <span className="ml-2 text-xs text-muted-foreground">
                                                (tú)
                                            </span>
                                        )}
                                        {u.email && (
                                            <div className="text-xs text-muted-foreground">
                                                {u.email}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-3 py-2">
                                        {u.role
                                            ? (ROLE_LABELS[u.role] ?? u.role)
                                            : '—'}
                                    </td>
                                    <td className="px-3 py-2">
                                        {u.branch ?? 'Todas'}
                                    </td>
                                    <td className="px-3 py-2">
                                        {u.role &&
                                        CAN_AUTHORIZE.includes(u.role) ? (
                                            u.has_pin ? (
                                                <span className="inline-flex items-center gap-1 text-xs">
                                                    <KeyRound className="size-3.5" />{' '}
                                                    Con clave
                                                </span>
                                            ) : (
                                                <span className="text-xs text-amber-700 dark:text-amber-400">
                                                    Sin clave
                                                </span>
                                            )
                                        ) : (
                                            <span className="text-xs text-muted-foreground">
                                                —
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2">
                                        {u.active ? (
                                            <Badge variant="secondary">
                                                Activo
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline">
                                                Desactivado
                                            </Badge>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label="Editar"
                                            onClick={() => openForm(u)}
                                        >
                                            <Pencil />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>
                            {editing ? 'Editar usuario' : 'Nuevo usuario'}
                        </DialogTitle>
                        <DialogDescription>
                            {editing
                                ? 'Deja la contraseña y la clave vacías para no cambiarlas.'
                                : 'El usuario entra con su número y su contraseña.'}
                        </DialogDescription>
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
                                <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
                                    <div className="grid gap-1.5">
                                        <Label htmlFor="u-number">
                                            Número *
                                        </Label>
                                        <Input
                                            id="u-number"
                                            name="employee_number"
                                            inputMode="numeric"
                                            defaultValue={
                                                editing?.employee_number ??
                                                nextEmployeeNumber
                                            }
                                            required
                                            className="font-mono"
                                        />
                                        <InputError
                                            message={errors.employee_number}
                                        />
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label htmlFor="u-name">Nombre *</Label>
                                        <Input
                                            id="u-name"
                                            name="name"
                                            defaultValue={editing?.name}
                                            required
                                            autoFocus
                                        />
                                        <InputError message={errors.name} />
                                    </div>
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="grid gap-1.5">
                                        <Label htmlFor="u-password">
                                            {editing
                                                ? 'Nueva contraseña'
                                                : 'Contraseña *'}
                                        </Label>
                                        <Input
                                            id="u-password"
                                            name="password"
                                            type="password"
                                            autoComplete="new-password"
                                            required={!editing}
                                            placeholder="Mínimo 8 caracteres"
                                        />
                                        <InputError message={errors.password} />
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label htmlFor="u-email">
                                            Correo (opcional)
                                        </Label>
                                        <Input
                                            id="u-email"
                                            name="email"
                                            type="email"
                                            defaultValue={editing?.email ?? ''}
                                            autoComplete="off"
                                        />
                                        <InputError message={errors.email} />
                                    </div>
                                </div>

                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="grid gap-1.5">
                                        <Label htmlFor="u-role">Rol *</Label>
                                        <select
                                            id="u-role"
                                            name="role"
                                            value={role}
                                            onChange={(e) =>
                                                setRole(e.target.value)
                                            }
                                            className={selectClass}
                                        >
                                            {roles.map((r) => (
                                                <option
                                                    key={r.name}
                                                    value={r.name}
                                                >
                                                    {ROLE_LABELS[r.name] ??
                                                        r.name}
                                                </option>
                                            ))}
                                        </select>
                                        <InputError message={errors.role} />
                                    </div>
                                    <div className="grid gap-1.5">
                                        <Label htmlFor="u-branch">
                                            Sucursal
                                        </Label>
                                        <select
                                            id="u-branch"
                                            name="branch_id"
                                            defaultValue={
                                                editing?.branch_id ??
                                                branches[0]?.id ??
                                                ''
                                            }
                                            className={selectClass}
                                        >
                                            <option value="">Todas</option>
                                            {branches.map((b) => (
                                                <option key={b.id} value={b.id}>
                                                    {b.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {authorizes && (
                                    <div className="grid gap-1.5 rounded-lg border p-3">
                                        <Label
                                            htmlFor="u-pin"
                                            className="flex items-center gap-1.5"
                                        >
                                            <KeyRound className="size-4" />{' '}
                                            Clave de autorización
                                        </Label>
                                        <Input
                                            id="u-pin"
                                            name="pin"
                                            type="password"
                                            inputMode="numeric"
                                            autoComplete="new-password"
                                            maxLength={6}
                                            placeholder={
                                                editing?.has_pin
                                                    ? 'Tiene clave · escribe una nueva para cambiarla'
                                                    : '4 a 6 dígitos'
                                            }
                                            className="font-mono"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Con su número y esta clave autoriza
                                            descuentos y cambios de precio en la
                                            caja de un cajero.
                                        </p>
                                        {editing?.has_pin && (
                                            <label className="flex items-center gap-2 text-xs">
                                                <input
                                                    type="checkbox"
                                                    name="remove_pin"
                                                    value="1"
                                                />{' '}
                                                Quitar la clave
                                            </label>
                                        )}
                                        <InputError message={errors.pin} />
                                    </div>
                                )}

                                {selectedRole && (
                                    <div className="rounded-lg bg-muted/60 p-3 text-xs">
                                        <div className="mb-1 font-medium">
                                            Este rol puede:
                                        </div>
                                        <ul className="grid gap-x-4 gap-y-0.5 text-muted-foreground sm:grid-cols-2">
                                            {selectedRole.permissions.map(
                                                (p) => (
                                                    <li key={p}>• {p}</li>
                                                ),
                                            )}
                                        </ul>
                                    </div>
                                )}

                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        name="active"
                                        value="1"
                                        defaultChecked={editing?.active ?? true}
                                    />
                                    Activo (puede iniciar sesión)
                                </label>
                                <InputError message={errors.active} />

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

UsersIndex.layout = {
    breadcrumbs: [{ title: 'Usuarios', href: UserController.index() }],
};
