import { Form } from '@inertiajs/react';
import { useState } from 'react';
import InventoryController from '@/actions/App/Http/Controllers/InventoryController';
import InputError from '@/components/input-error';
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
import { formatQuantity } from '@/lib/format';

export type AdjustTarget = {
    id: number;
    name: string;
    stock: string | number;
    unit: string;
    allowsDecimals: boolean;
};

type Mode = 'count' | 'in' | 'out';

const MODES: { value: Mode; label: string; help: string }[] = [
    {
        value: 'count',
        label: 'Conteo físico',
        help: 'Captura cuántos hay realmente; el sistema ajusta la diferencia.',
    },
    {
        value: 'out',
        label: 'Salida / merma',
        help: 'Producto dañado, caducado, robo, consumo interno…',
    },
    {
        value: 'in',
        label: 'Entrada',
        help: 'Entrada que no viene de una compra (devolución a almacén, regalo…).',
    },
];

export default function AdjustDialog({
    target,
    onClose,
}: {
    target: AdjustTarget | null;
    onClose: () => void;
}) {
    const [mode, setMode] = useState<Mode>('count');
    const [quantity, setQuantity] = useState('');

    const current = Number(target?.stock ?? 0);
    const q = Number(quantity) || 0;
    const result =
        mode === 'count' ? q : mode === 'in' ? current + q : current - q;
    const delta = result - current;

    return (
        <Dialog
            open={target !== null}
            onOpenChange={(open) => {
                if (!open) {
                    onClose();
                    setMode('count');
                    setQuantity('');
                }
            }}
        >
            <DialogContent>
                {target && (
                    <Form
                        {...InventoryController.adjust.form(target.id)}
                        options={{ preserveScroll: true }}
                        onSuccess={() => {
                            onClose();
                            setMode('count');
                            setQuantity('');
                        }}
                        className="grid gap-4"
                    >
                        {({ errors, processing }) => (
                            <>
                                <DialogHeader>
                                    <DialogTitle>
                                        Ajustar inventario
                                    </DialogTitle>
                                    <DialogDescription>
                                        {target.name} · existencia actual{' '}
                                        <strong>
                                            {formatQuantity(current)}{' '}
                                            {target.unit}
                                        </strong>
                                    </DialogDescription>
                                </DialogHeader>

                                <div className="grid gap-2">
                                    {MODES.map((m) => (
                                        <label
                                            key={m.value}
                                            className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${mode === m.value ? 'border-primary bg-muted/50' : ''}`}
                                        >
                                            <input
                                                type="radio"
                                                name="mode"
                                                value={m.value}
                                                checked={mode === m.value}
                                                onChange={() =>
                                                    setMode(m.value)
                                                }
                                            />
                                            <span>
                                                <span className="font-medium">
                                                    {m.label}
                                                </span>
                                                <span className="block text-xs text-muted-foreground">
                                                    {m.help}
                                                </span>
                                            </span>
                                        </label>
                                    ))}
                                </div>

                                <div className="grid gap-1.5">
                                    <Label htmlFor="adj-qty">
                                        {mode === 'count'
                                            ? 'Cantidad contada'
                                            : 'Cantidad'}
                                    </Label>
                                    <Input
                                        id="adj-qty"
                                        name="quantity"
                                        type="number"
                                        min="0"
                                        step={
                                            target.allowsDecimals
                                                ? '0.001'
                                                : '1'
                                        }
                                        value={quantity}
                                        onChange={(e) =>
                                            setQuantity(e.target.value)
                                        }
                                        autoFocus
                                        required
                                    />
                                    <InputError message={errors.quantity} />
                                    {quantity !== '' && (
                                        <p
                                            className={`text-sm ${result < 0 ? 'text-red-600' : 'text-muted-foreground'}`}
                                        >
                                            Quedarán{' '}
                                            <strong>
                                                {formatQuantity(result)}
                                            </strong>{' '}
                                            {target.unit} (
                                            {delta >= 0 ? '+' : ''}
                                            {formatQuantity(delta)})
                                        </p>
                                    )}
                                </div>

                                <div className="grid gap-1.5">
                                    <Label htmlFor="adj-reason">Motivo *</Label>
                                    <Input
                                        id="adj-reason"
                                        name="reason"
                                        required
                                        placeholder="Ej. inventario mensual, caducado…"
                                    />
                                    <InputError message={errors.reason} />
                                    <InputError message={errors.product} />
                                </div>

                                <DialogFooter>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={onClose}
                                    >
                                        Cancelar
                                    </Button>
                                    <Button type="submit" disabled={processing}>
                                        Guardar ajuste
                                    </Button>
                                </DialogFooter>
                            </>
                        )}
                    </Form>
                )}
            </DialogContent>
        </Dialog>
    );
}
