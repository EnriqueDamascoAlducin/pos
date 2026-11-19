import { KeyRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import PosController from '@/actions/App/Http/Controllers/PosController';
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
import { formatMoney } from '@/lib/format';
import { adjustmentsOf, lineTotal, round2, unitPrice } from '@/types/sale';
import type { CartLine } from '@/types/sale';

export type AdjustResult = {
    unitPrice: string;
    discount: string;
    token?: string;
    supervisor?: string;
};

type Props = {
    /** Índice de la partida a ajustar (null = cerrado). */
    index: number | null;
    cart: CartLine[];
    /** Quien cobra puede hacer ajustes sin autorización (encargado o admin). */
    canAdjust: boolean;
    onClose: () => void;
    onApply: (index: number, result: AdjustResult) => void;
};

function xsrfToken(): string {
    const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
}

export default function AdjustLineDialog({
    index,
    cart,
    canAdjust,
    onClose,
    onApply,
}: Props) {
    const line = index !== null ? cart[index] : null;
    const [price, setPrice] = useState('');
    const [discount, setDiscount] = useState('');
    const [percent, setPercent] = useState(false);
    const [number, setNumber] = useState('');
    const [pin, setPin] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [processing, setProcessing] = useState(false);
    const priceRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (line) {
            const qty = Number(line.quantity) || 0;
            setPrice(
                line.unitPrice !== ''
                    ? line.unitPrice
                    : unitPrice(line.product, qty).toFixed(2),
            );
            setDiscount(line.discount);
            setPercent(false);
            setNumber('');
            setPin('');
            setError(null);
            setTimeout(() => priceRef.current?.select(), 50);
        }
        // Solo al abrir el diálogo para otra partida.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [index]);

    if (!line || index === null) {
        return null;
    }

    const qty = Number(line.quantity) || 0;
    const listPrice = unitPrice(line.product, qty);
    const priceNum = Number(price);
    const gross = round2((Number.isNaN(priceNum) ? 0 : priceNum) * qty);
    const discountAmount = percent
        ? round2((gross * (Number(discount) || 0)) / 100)
        : round2(Number(discount) || 0);
    const changedPrice =
        price !== '' && Math.abs(priceNum - listPrice) >= 0.005;

    const preview: CartLine = {
        ...line,
        unitPrice: changedPrice ? priceNum.toFixed(2) : '',
        discount: discountAmount > 0 ? discountAmount.toFixed(2) : '',
    };

    const invalid =
        price === '' || Number.isNaN(priceNum) || priceNum < 0
            ? 'Precio inválido.'
            : discountAmount < 0 || discountAmount > gross
              ? 'El descuento no puede ser mayor que el importe de la partida.'
              : null;

    const apply = async () => {
        if (invalid) {
            setError(invalid);
            return;
        }

        const result: AdjustResult = {
            unitPrice: preview.unitPrice,
            discount: preview.discount,
        };

        // Sin ajuste (o quien cobra puede autorizar) → no se pide clave.
        const nextCart = cart.map((l, i) => (i === index ? preview : l));
        const adjustments = adjustmentsOf(nextCart);

        if (canAdjust || adjustments.length === 0) {
            onApply(index, result);
            return;
        }

        if (!number.trim() || !pin.trim()) {
            setError('Pide al encargado que escriba su número y su clave.');
            return;
        }

        setProcessing(true);
        setError(null);

        try {
            const res = await fetch(PosController.authorizeAdjustments.url(), {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-XSRF-TOKEN': xsrfToken(),
                },
                body: JSON.stringify({
                    employee_number: number,
                    pin,
                    adjustments,
                }),
            });
            const body = await res.json();

            if (!res.ok) {
                const first = body?.errors
                    ? (Object.values(body.errors)[0] as string[])[0]
                    : body?.message;
                setError(first ?? 'No se pudo autorizar.');
                setPin('');
                return;
            }

            onApply(index, {
                ...result,
                token: body.token,
                supervisor: body.supervisor,
            });
        } catch {
            setError('Sin conexión con el servidor. Intenta de nuevo.');
        } finally {
            setProcessing(false);
        }
    };

    return (
        <Dialog open onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-md">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        void apply();
                    }}
                    className="grid gap-4"
                >
                    <DialogHeader>
                        <DialogTitle>Ajustar partida</DialogTitle>
                        <DialogDescription>
                            {line.product.name} · {qty} {line.product.unit} ·
                            precio normal {formatMoney(listPrice)}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label htmlFor="adj-price">Precio unitario</Label>
                            <Input
                                id="adj-price"
                                ref={priceRef}
                                type="number"
                                step="0.01"
                                min="0"
                                inputMode="decimal"
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label
                                htmlFor="adj-discount"
                                className="flex items-center justify-between"
                            >
                                Descuento
                                <span className="flex overflow-hidden rounded-md border text-xs">
                                    <button
                                        type="button"
                                        onClick={() => setPercent(false)}
                                        className={`px-2 py-0.5 ${percent ? '' : 'bg-primary text-primary-foreground'}`}
                                    >
                                        $
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPercent(true)}
                                        className={`px-2 py-0.5 ${percent ? 'bg-primary text-primary-foreground' : ''}`}
                                    >
                                        %
                                    </button>
                                </span>
                            </Label>
                            <Input
                                id="adj-discount"
                                type="number"
                                step="0.01"
                                min="0"
                                inputMode="decimal"
                                value={discount}
                                placeholder="0"
                                onChange={(e) => setDiscount(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex items-end justify-between rounded-lg bg-muted p-3 text-sm">
                        <span className="text-muted-foreground">
                            Importe de la partida
                            {discountAmount > 0 && (
                                <span className="block">
                                    Descuento −{formatMoney(discountAmount)}
                                </span>
                            )}
                        </span>
                        <span className="text-2xl font-semibold tabular-nums">
                            {formatMoney(lineTotal(preview))}
                        </span>
                    </div>

                    {!canAdjust && (
                        <div className="grid gap-3 rounded-lg border p-3">
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <KeyRound className="size-4" /> Autorización del
                                encargado
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="grid gap-1.5">
                                    <Label htmlFor="adj-number">
                                        Número del encargado
                                    </Label>
                                    <Input
                                        id="adj-number"
                                        inputMode="numeric"
                                        autoComplete="off"
                                        value={number}
                                        onChange={(e) =>
                                            setNumber(e.target.value)
                                        }
                                    />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor="adj-pin">Clave</Label>
                                    <Input
                                        id="adj-pin"
                                        type="password"
                                        inputMode="numeric"
                                        autoComplete="off"
                                        maxLength={6}
                                        value={pin}
                                        onChange={(e) => setPin(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {error && <p className="text-sm text-red-600">{error}</p>}

                    <DialogFooter className="gap-2 sm:justify-between">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() =>
                                onApply(index, { unitPrice: '', discount: '' })
                            }
                            disabled={
                                line.unitPrice === '' &&
                                !(Number(line.discount) > 0)
                            }
                        >
                            Quitar ajuste
                        </Button>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onClose}
                            >
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={processing}>
                                {processing
                                    ? 'Autorizando…'
                                    : canAdjust
                                      ? 'Aplicar'
                                      : 'Autorizar y aplicar'}
                            </Button>
                        </div>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
