import { Form } from '@inertiajs/react';
import CustomerController from '@/actions/App/Http/Controllers/CustomerController';
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

export type CustomerRow = {
    id: number;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    credit_limit: string;
    balance: string;
    active: boolean;
};

export default function CustomerFormDialog({
    customer,
    open,
    onOpenChange,
}: {
    customer: CustomerRow | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const formProps = customer
        ? CustomerController.update.form(customer.id)
        : CustomerController.store.form();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {customer ? 'Editar cliente' : 'Nuevo cliente'}
                    </DialogTitle>
                </DialogHeader>
                <Form
                    key={customer?.id ?? 'new'}
                    {...formProps}
                    options={{ preserveScroll: true }}
                    onSuccess={() => onOpenChange(false)}
                    className="grid gap-4"
                >
                    {({ errors, processing }) => (
                        <>
                            <div className="grid gap-1.5">
                                <Label htmlFor="c-name">Nombre *</Label>
                                <Input
                                    id="c-name"
                                    name="name"
                                    defaultValue={customer?.name}
                                    required
                                    autoFocus
                                />
                                <InputError message={errors.name} />
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="grid gap-1.5">
                                    <Label htmlFor="c-phone">Teléfono</Label>
                                    <Input
                                        id="c-phone"
                                        name="phone"
                                        defaultValue={customer?.phone ?? ''}
                                    />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="c-email">Correo</Label>
                                    <Input
                                        id="c-email"
                                        name="email"
                                        type="email"
                                        defaultValue={customer?.email ?? ''}
                                    />
                                    <InputError message={errors.email} />
                                </div>
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="c-address">Dirección</Label>
                                <Input
                                    id="c-address"
                                    name="address"
                                    defaultValue={customer?.address ?? ''}
                                />
                            </div>
                            <div className="grid gap-1.5">
                                <Label htmlFor="c-limit">
                                    Límite de crédito
                                </Label>
                                <Input
                                    id="c-limit"
                                    name="credit_limit"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    defaultValue={customer?.credit_limit ?? '0'}
                                    required
                                />
                                <p className="text-xs text-muted-foreground">
                                    Cuánto puede deber como máximo. Con 0 no se
                                    le puede vender a crédito.
                                </p>
                                <InputError message={errors.credit_limit} />
                            </div>
                            {customer && (
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        name="active"
                                        value="1"
                                        defaultChecked={customer.active}
                                    />
                                    Activo (aparece en el punto de venta)
                                </label>
                            )}
                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => onOpenChange(false)}
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
    );
}
