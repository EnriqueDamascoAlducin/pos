import type { FormComponentRef } from '@inertiajs/core';
import { Form, Head, usePage } from '@inertiajs/react';
import { useRef, useState } from 'react';
import { confirmDialog } from '@/components/confirm-dialog';
import CashSessionController from '@/actions/App/Http/Controllers/CashSessionController';
import {
    CashMovementsTable,
    CashSummaryCard,
} from '@/components/cash/cash-summary';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatMoney } from '@/lib/format';
import type {
    CashMovementRow,
    CashSessionData,
    CashSummary,
} from '@/types/cash';

type Props = {
    session: CashSessionData;
    summary: CashSummary;
    movements: CashMovementRow[];
};

export default function CashCurrent({ session, summary, movements }: Props) {
    const { auth } = usePage().props;
    const [counted, setCounted] = useState('');
    const diff =
        counted === '' ? null : Number(counted) - Number(summary.expected_cash);

    // El formulario de corte solo se envía después de confirmar en el diálogo.
    const closeFormRef = useRef<FormComponentRef>(null);
    const closeConfirmed = useRef(false);

    const confirmClose = () => {
        if (closeConfirmed.current) {
            closeConfirmed.current = false;
            return true;
        }

        const difference =
            diff === null || Math.abs(diff) < 0.005
                ? 'La caja cuadra.'
                : diff > 0
                  ? `Sobran ${formatMoney(diff)}.`
                  : `Faltan ${formatMoney(-diff)}.`;

        void confirmDialog({
            title: '¿Cerrar el turno?',
            description: `Efectivo contado ${formatMoney(counted)} contra ${formatMoney(summary.expected_cash)} esperados. ${difference} Ya no podrás vender con este turno.`,
            confirmText: 'Cerrar turno',
            destructive: true,
        }).then((ok) => {
            if (ok) {
                closeConfirmed.current = true;
                closeFormRef.current?.submit();
            }
        });

        return false;
    };

    return (
        <>
            <Head title="Caja" />
            <div className="flex flex-1 flex-col gap-6 p-4">
                <div>
                    <h1 className="text-xl font-semibold">
                        {session.register}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Turno abierto desde{' '}
                        {new Date(session.opened_at).toLocaleString('es-MX')}
                    </p>
                </div>

                <CashSummaryCard summary={summary} />

                <div className="grid gap-4 lg:grid-cols-2">
                    {auth.permissions.includes('cash.movements') && (
                        <section className="rounded-xl border p-4">
                            <h2 className="mb-3 font-medium">
                                Entradas y salidas de efectivo
                            </h2>
                            <Form
                                {...CashSessionController.movement.form()}
                                resetOnSuccess
                                options={{ preserveScroll: true }}
                                className="mb-4 grid gap-3 sm:grid-cols-[auto_1fr_8rem_auto] sm:items-start"
                            >
                                {({ errors, processing }) => (
                                    <>
                                        <select
                                            name="type"
                                            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm dark:bg-input/30"
                                            defaultValue="out"
                                        >
                                            <option value="out">Salida</option>
                                            <option value="in">Entrada</option>
                                        </select>
                                        <div>
                                            <Input
                                                name="reason"
                                                placeholder="Motivo (ej. pago a proveedor)"
                                                required
                                            />
                                            <InputError
                                                message={errors.reason}
                                            />
                                        </div>
                                        <div>
                                            <Input
                                                name="amount"
                                                type="number"
                                                step="0.01"
                                                min="0.01"
                                                placeholder="Monto"
                                                required
                                            />
                                            <InputError
                                                message={errors.amount}
                                            />
                                        </div>
                                        <Button
                                            type="submit"
                                            variant="secondary"
                                            disabled={processing}
                                        >
                                            Registrar
                                        </Button>
                                    </>
                                )}
                            </Form>
                            <CashMovementsTable movements={movements} />
                        </section>
                    )}

                    <section className="rounded-xl border p-4">
                        <h2 className="mb-3 font-medium">Corte de caja</h2>
                        <Form
                            ref={closeFormRef}
                            {...CashSessionController.close.form()}
                            onBefore={confirmClose}
                            className="grid gap-3"
                        >
                            {({ errors, processing }) => (
                                <>
                                    <div className="grid gap-2">
                                        <Label htmlFor="counted_amount">
                                            Efectivo contado en caja
                                        </Label>
                                        <Input
                                            id="counted_amount"
                                            name="counted_amount"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={counted}
                                            onChange={(e) =>
                                                setCounted(e.target.value)
                                            }
                                            required
                                        />
                                        <InputError
                                            message={errors.counted_amount}
                                        />
                                    </div>
                                    {diff !== null && (
                                        <p
                                            className={`text-sm font-medium ${Math.abs(diff) < 0.005 ? 'text-green-700 dark:text-green-500' : 'text-red-600'}`}
                                        >
                                            {Math.abs(diff) < 0.005
                                                ? 'La caja cuadra.'
                                                : diff > 0
                                                  ? `Sobran ${formatMoney(diff)}`
                                                  : `Faltan ${formatMoney(-diff)}`}
                                        </p>
                                    )}
                                    <div className="grid gap-2">
                                        <Label htmlFor="notes">Notas</Label>
                                        <Input
                                            id="notes"
                                            name="notes"
                                            placeholder="Opcional"
                                        />
                                    </div>
                                    <Button
                                        type="submit"
                                        variant="destructive"
                                        disabled={processing}
                                    >
                                        Cerrar turno
                                    </Button>
                                </>
                            )}
                        </Form>
                    </section>
                </div>
            </div>
        </>
    );
}

CashCurrent.layout = {
    breadcrumbs: [{ title: 'Caja', href: CashSessionController.current() }],
};
