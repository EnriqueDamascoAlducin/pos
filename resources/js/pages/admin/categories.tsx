import { Form, Head, router } from '@inertiajs/react';
import { confirmDialog } from '@/components/confirm-dialog';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import CategoryController from '@/actions/App/Http/Controllers/Admin/CategoryController';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Category = { id: number; name: string; products_count: number };

export default function Categories({ categories }: { categories: Category[] }) {
    const [editing, setEditing] = useState<number | null>(null);

    const destroy = async (c: Category) => {
        const ok = await confirmDialog({
            title: `¿Eliminar la categoría "${c.name}"?`,
            description: c.products_count
                ? `Tiene ${c.products_count} productos; quedarán como "Sin categoría". Los productos no se borran.`
                : 'No tiene productos asignados.',
            confirmText: 'Eliminar',
            destructive: true,
        });

        if (ok) {
            router.delete(CategoryController.destroy.url(c.id), {
                preserveScroll: true,
            });
        }
    };

    return (
        <>
            <Head title="Categorías" />
            <div className="flex max-w-2xl flex-1 flex-col gap-4 p-4">
                <h1 className="text-xl font-semibold">Categorías</h1>

                <Form
                    {...CategoryController.store.form()}
                    resetOnSuccess
                    options={{ preserveScroll: true }}
                    className="flex gap-2"
                >
                    {({ errors, processing }) => (
                        <div className="flex w-full flex-col gap-1">
                            <div className="flex gap-2">
                                <Input
                                    name="name"
                                    placeholder="Nueva categoría"
                                    required
                                />
                                <Button type="submit" disabled={processing}>
                                    Agregar
                                </Button>
                            </div>
                            <InputError message={errors.name} />
                        </div>
                    )}
                </Form>

                <div className="rounded-xl border">
                    {categories.length === 0 && (
                        <p className="p-6 text-center text-sm text-muted-foreground">
                            Aún no hay categorías.
                        </p>
                    )}
                    {categories.map((c) => (
                        <div
                            key={c.id}
                            className="flex items-center gap-2 border-t px-3 py-2 first:border-t-0"
                        >
                            {editing === c.id ? (
                                <Form
                                    {...CategoryController.update.form(c.id)}
                                    options={{ preserveScroll: true }}
                                    onSuccess={() => setEditing(null)}
                                    className="flex flex-1 items-center gap-2"
                                >
                                    {({ errors }) => (
                                        <>
                                            <div className="flex-1">
                                                <Input
                                                    name="name"
                                                    defaultValue={c.name}
                                                    autoFocus
                                                    required
                                                    className="h-8"
                                                />
                                                <InputError
                                                    message={errors.name}
                                                />
                                            </div>
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
                                        </>
                                    )}
                                </Form>
                            ) : (
                                <>
                                    <span className="flex-1 text-sm font-medium">
                                        {c.name}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {c.products_count} productos
                                    </span>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        aria-label="Editar"
                                        onClick={() => setEditing(c.id)}
                                    >
                                        <Pencil />
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        aria-label="Eliminar"
                                        onClick={() => destroy(c)}
                                    >
                                        <Trash2 />
                                    </Button>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
}

Categories.layout = {
    breadcrumbs: [{ title: 'Categorías', href: CategoryController.index() }],
};
