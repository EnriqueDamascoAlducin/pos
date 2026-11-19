import { Form, Head, router } from '@inertiajs/react';
import { Check, Pencil, X } from 'lucide-react';
import { useState } from 'react';
import UnitController from '@/actions/App/Http/Controllers/Admin/UnitController';
import InputError from '@/components/input-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Unit = {
    id: number;
    name: string;
    abbreviation: string;
    allows_decimals: boolean;
    active: boolean;
    products_count: number;
};

export default function Units({ units }: { units: Unit[] }) {
    const [editing, setEditing] = useState<number | null>(null);
    const activeCount = units.filter((u) => u.active).length;

    const toggle = (u: Unit) =>
        router.put(
            UnitController.update.url(u.id),
            {
                name: u.name,
                abbreviation: u.abbreviation,
                allows_decimals: u.allows_decimals,
                active: !u.active,
            },
            { preserveScroll: true },
        );

    return (
        <>
            <Head title="Unidades" />
            <div className="flex max-w-3xl flex-1 flex-col gap-4 p-4">
                <div>
                    <h1 className="text-xl font-semibold">
                        Unidades de medida
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Activa solo las que usa tu negocio: son las que aparecen
                        al dar de alta productos. Los productos que ya usan una
                        unidad desactivada la conservan.
                    </p>
                </div>

                <div className="rounded-xl border">
                    {units.map((u) => (
                        <div
                            key={u.id}
                            className={`flex flex-wrap items-center gap-3 border-t px-3 py-2 first:border-t-0 ${u.active ? '' : 'text-muted-foreground'}`}
                        >
                            {editing === u.id ? (
                                <Form
                                    {...UnitController.update.form(u.id)}
                                    options={{ preserveScroll: true }}
                                    onSuccess={() => setEditing(null)}
                                    className="flex flex-1 flex-wrap items-start gap-2"
                                >
                                    {({ errors }) => (
                                        <>
                                            <input
                                                type="hidden"
                                                name="active"
                                                value={u.active ? '1' : '0'}
                                            />
                                            <div className="min-w-40 flex-1">
                                                <Input
                                                    name="name"
                                                    defaultValue={u.name}
                                                    required
                                                    autoFocus
                                                    className="h-8"
                                                />
                                                <InputError
                                                    message={errors.name}
                                                />
                                            </div>
                                            <div className="w-24">
                                                <Input
                                                    name="abbreviation"
                                                    defaultValue={
                                                        u.abbreviation
                                                    }
                                                    required
                                                    className="h-8"
                                                />
                                                <InputError
                                                    message={
                                                        errors.abbreviation
                                                    }
                                                />
                                            </div>
                                            <label className="flex h-8 items-center gap-2 text-sm">
                                                <input
                                                    type="checkbox"
                                                    name="allows_decimals"
                                                    value="1"
                                                    defaultChecked={
                                                        u.allows_decimals
                                                    }
                                                    disabled={
                                                        u.products_count > 0
                                                    }
                                                />
                                                Decimales
                                            </label>
                                            {u.products_count > 0 && (
                                                <input
                                                    type="hidden"
                                                    name="allows_decimals"
                                                    value={
                                                        u.allows_decimals
                                                            ? '1'
                                                            : '0'
                                                    }
                                                />
                                            )}
                                            <Button
                                                type="submit"
                                                size="icon"
                                                variant="ghost"
                                                aria-label="Guardar"
                                            >
                                                <Check />
                                            </Button>
                                            <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                aria-label="Cancelar"
                                                onClick={() => setEditing(null)}
                                            >
                                                <X />
                                            </Button>
                                            <InputError
                                                message={errors.allows_decimals}
                                                className="w-full"
                                            />
                                        </>
                                    )}
                                </Form>
                            ) : (
                                <>
                                    <span className="flex-1">
                                        <span className="font-medium">
                                            {u.name}
                                        </span>{' '}
                                        <span className="font-mono text-xs text-muted-foreground">
                                            ({u.abbreviation})
                                        </span>
                                        <span className="block text-xs text-muted-foreground">
                                            {u.allows_decimals
                                                ? 'Acepta decimales (granel)'
                                                : 'Solo cantidades enteras'}{' '}
                                            · {u.products_count} productos
                                        </span>
                                    </span>
                                    {u.active ? (
                                        <Badge variant="secondary">
                                            Activa
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline">
                                            Desactivada
                                        </Badge>
                                    )}
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => toggle(u)}
                                        disabled={u.active && activeCount === 1}
                                    >
                                        {u.active ? 'Desactivar' : 'Activar'}
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        aria-label="Editar"
                                        onClick={() => setEditing(u.id)}
                                    >
                                        <Pencil />
                                    </Button>
                                </>
                            )}
                        </div>
                    ))}
                </div>

                <section className="rounded-xl border p-4">
                    <h2 className="mb-3 font-medium">Agregar unidad</h2>
                    <Form
                        {...UnitController.store.form()}
                        resetOnSuccess
                        options={{ preserveScroll: true }}
                        className="flex flex-wrap items-start gap-2"
                    >
                        {({ errors, processing }) => (
                            <>
                                <div className="min-w-40 flex-1">
                                    <Input
                                        name="name"
                                        placeholder="Nombre (ej. Juego, Par, Rollo)"
                                        required
                                    />
                                    <InputError message={errors.name} />
                                </div>
                                <div className="w-28">
                                    <Input
                                        name="abbreviation"
                                        placeholder="Abrev. (jgo)"
                                        required
                                    />
                                    <InputError message={errors.abbreviation} />
                                </div>
                                <label className="flex h-9 items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        name="allows_decimals"
                                        value="1"
                                    />{' '}
                                    Acepta decimales
                                </label>
                                <Button type="submit" disabled={processing}>
                                    Agregar
                                </Button>
                            </>
                        )}
                    </Form>
                </section>
            </div>
        </>
    );
}

Units.layout = {
    breadcrumbs: [{ title: 'Unidades', href: UnitController.index() }],
};
