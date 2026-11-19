import { Form, Head } from '@inertiajs/react';
import CashSessionController from '@/actions/App/Http/Controllers/CashSessionController';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Register = {
    id: number;
    name: string;
    branch: string;
    busy_by: string | null;
};

export default function CashOpen({ registers }: { registers: Register[] }) {
    const firstFree = registers.find((r) => !r.busy_by);

    return (
        <>
            <Head title="Abrir turno" />
            <div className="flex flex-1 items-start justify-center p-4">
                <div className="w-full max-w-md rounded-xl border p-6">
                    <h1 className="text-xl font-semibold">
                        Abrir turno de caja
                    </h1>
                    <p className="mb-6 text-sm text-muted-foreground">
                        Necesitas un turno abierto para poder vender.
                    </p>

                    <Form
                        {...CashSessionController.store.form()}
                        className="grid gap-4"
                    >
                        {({ errors, processing }) => (
                            <>
                                <div className="grid gap-2">
                                    <Label>Caja</Label>
                                    <div className="grid gap-2">
                                        {registers.map((r) => (
                                            <label
                                                key={r.id}
                                                className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${r.busy_by ? 'opacity-50' : 'cursor-pointer hover:bg-muted/50'}`}
                                            >
                                                <input
                                                    type="radio"
                                                    name="cash_register_id"
                                                    value={r.id}
                                                    disabled={!!r.busy_by}
                                                    defaultChecked={
                                                        r.id === firstFree?.id
                                                    }
                                                />
                                                <span className="flex-1">
                                                    <span className="font-medium">
                                                        {r.name}
                                                    </span>
                                                    <span className="block text-xs text-muted-foreground">
                                                        {r.branch}
                                                        {r.busy_by &&
                                                            ` · En uso por ${r.busy_by}`}
                                                    </span>
                                                </span>
                                            </label>
                                        ))}
                                        {registers.length === 0 && (
                                            <p className="text-sm text-muted-foreground">
                                                No hay cajas dadas de alta en tu
                                                sucursal.
                                            </p>
                                        )}
                                    </div>
                                    <InputError
                                        message={errors.cash_register_id}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="opening_amount">
                                        Fondo inicial (efectivo)
                                    </Label>
                                    <Input
                                        id="opening_amount"
                                        name="opening_amount"
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        defaultValue="0"
                                        inputMode="decimal"
                                        autoFocus
                                        required
                                    />
                                    <InputError
                                        message={errors.opening_amount}
                                    />
                                </div>

                                <Button
                                    type="submit"
                                    disabled={processing || !firstFree}
                                    size="lg"
                                >
                                    Abrir turno
                                </Button>
                            </>
                        )}
                    </Form>
                </div>
            </div>
        </>
    );
}

CashOpen.layout = {
    breadcrumbs: [
        { title: 'Abrir turno', href: CashSessionController.create() },
    ],
};
