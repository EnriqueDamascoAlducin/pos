import { useEffect, useRef, useState } from 'react';
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
import { round2 } from '@/types/sale';
import type { PaymentInput, PosCustomer } from '@/types/sale';

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    total: number;
    customer: PosCustomer | null;
    canCredit: boolean;
    processing: boolean;
    onConfirm: (payments: PaymentInput[]) => void;
};

const BILLS = [20, 50, 100, 200, 500, 1000];

export default function PaymentDialog({
    open,
    onOpenChange,
    total,
    customer,
    canCredit,
    processing,
    onConfirm,
}: Props) {
    const [cash, setCash] = useState('');
    const [card, setCard] = useState('');
    const [transfer, setTransfer] = useState('');
    const [reference, setReference] = useState('');
    const [credit, setCredit] = useState('');
    const cashRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open) {
            setCash(total.toFixed(2));
            setCard('');
            setTransfer('');
            setReference('');
            setCredit('');
            setTimeout(() => cashRef.current?.select(), 50);
        }
    }, [open, total]);

    const nonCash = round2(
        (Number(card) || 0) + (Number(transfer) || 0) + (Number(credit) || 0),
    );
    const due = round2(Math.max(total - nonCash, 0));
    const cashNum = Number(cash) || 0;
    const missing = round2(Math.max(due - cashNum, 0));
    const change = round2(Math.max(cashNum - due, 0));
    const creditAvailable = Number(customer?.available_credit ?? 0);

    const errors: string[] = [];
    if (nonCash > total + 0.001)
        errors.push('Tarjeta, transferencia y crédito exceden el total.');
    if (Number(credit) > 0 && !customer)
        errors.push('Selecciona un cliente para vender a crédito.');
    if (Number(credit) > creditAvailable + 0.001 && customer)
        errors.push(`Crédito disponible: ${formatMoney(creditAvailable)}.`);
    if (missing > 0) errors.push(`Faltan ${formatMoney(missing)}.`);

    const canSubmit = errors.length === 0 && !processing;

    const submit = () => {
        if (!canSubmit) return;

        const payments: PaymentInput[] = [];
        if (Number(card) > 0)
            payments.push({
                method: 'card',
                amount: card,
                reference: reference || undefined,
            });
        if (Number(transfer) > 0)
            payments.push({
                method: 'transfer',
                amount: transfer,
                reference: reference || undefined,
            });
        if (Number(credit) > 0)
            payments.push({ method: 'credit', amount: credit });
        if (cashNum > 0 && due > 0)
            payments.push({ method: 'cash', amount: cash });

        onConfirm(payments);
    };

    /** Pone el resto en un método (botón "resto"). */
    const fillRest = (setter: (v: string) => void, current: string) => {
        const others = round2(nonCash - (Number(current) || 0));
        setter(round2(Math.max(total - others, 0)).toFixed(2));
        setCash('0');
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        submit();
                    }}
                    className="grid gap-4"
                >
                    <DialogHeader>
                        <DialogTitle>Cobrar</DialogTitle>
                        <DialogDescription>
                            Total a pagar{' '}
                            <span className="block text-3xl font-bold text-foreground tabular-nums">
                                {formatMoney(total)}
                            </span>
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-2">
                        <Label htmlFor="pay-cash">Efectivo recibido</Label>
                        <Input
                            id="pay-cash"
                            ref={cashRef}
                            type="number"
                            step="0.01"
                            min="0"
                            inputMode="decimal"
                            value={cash}
                            onChange={(e) => setCash(e.target.value)}
                            className="h-12 text-2xl tabular-nums"
                        />
                        <div className="flex flex-wrap gap-1">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setCash(due.toFixed(2))}
                            >
                                Exacto
                            </Button>
                            {BILLS.filter((b) => b >= due)
                                .slice(0, 4)
                                .map((b) => (
                                    <Button
                                        key={b}
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setCash(String(b))}
                                    >
                                        ${b}
                                    </Button>
                                ))}
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <Label
                                htmlFor="pay-card"
                                className="flex justify-between"
                            >
                                Tarjeta
                                <button
                                    type="button"
                                    className="text-xs text-muted-foreground underline"
                                    onClick={() => fillRest(setCard, card)}
                                >
                                    resto
                                </button>
                            </Label>
                            <Input
                                id="pay-card"
                                type="number"
                                step="0.01"
                                min="0"
                                value={card}
                                onChange={(e) => setCard(e.target.value)}
                            />
                        </div>
                        <div className="grid gap-1.5">
                            <Label
                                htmlFor="pay-transfer"
                                className="flex justify-between"
                            >
                                Transferencia
                                <button
                                    type="button"
                                    className="text-xs text-muted-foreground underline"
                                    onClick={() =>
                                        fillRest(setTransfer, transfer)
                                    }
                                >
                                    resto
                                </button>
                            </Label>
                            <Input
                                id="pay-transfer"
                                type="number"
                                step="0.01"
                                min="0"
                                value={transfer}
                                onChange={(e) => setTransfer(e.target.value)}
                            />
                        </div>
                        {(Number(card) > 0 || Number(transfer) > 0) && (
                            <div className="grid gap-1.5 sm:col-span-2">
                                <Label htmlFor="pay-ref">
                                    Referencia / autorización
                                </Label>
                                <Input
                                    id="pay-ref"
                                    value={reference}
                                    onChange={(e) =>
                                        setReference(e.target.value)
                                    }
                                />
                            </div>
                        )}
                        {canCredit && customer && (
                            <div className="grid gap-1.5 sm:col-span-2">
                                <Label
                                    htmlFor="pay-credit"
                                    className="flex justify-between"
                                >
                                    <span>
                                        Crédito a {customer.name}{' '}
                                        <span className="text-xs text-muted-foreground">
                                            (disponible{' '}
                                            {formatMoney(creditAvailable)})
                                        </span>
                                    </span>
                                    <button
                                        type="button"
                                        className="text-xs text-muted-foreground underline"
                                        onClick={() =>
                                            fillRest(setCredit, credit)
                                        }
                                    >
                                        resto
                                    </button>
                                </Label>
                                <Input
                                    id="pay-credit"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={credit}
                                    onChange={(e) => setCredit(e.target.value)}
                                />
                            </div>
                        )}
                    </div>

                    <div className="flex items-end justify-between rounded-lg bg-muted p-3">
                        <span className="text-sm text-muted-foreground">
                            Cambio
                        </span>
                        <span className="text-3xl font-bold tabular-nums">
                            {formatMoney(change)}
                        </span>
                    </div>

                    {errors.length > 0 && (
                        <ul className="text-sm text-red-600">
                            {errors.map((e) => (
                                <li key={e}>{e}</li>
                            ))}
                        </ul>
                    )}

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                        >
                            Regresar (Esc)
                        </Button>
                        <Button type="submit" size="lg" disabled={!canSubmit}>
                            {processing ? 'Cobrando…' : 'Cobrar (Enter)'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
