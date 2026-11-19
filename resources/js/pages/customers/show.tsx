import { Form, Head, router } from '@inertiajs/react';
import { Pencil, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import CustomerController from '@/actions/App/Http/Controllers/CustomerController';
import SaleController from '@/actions/App/Http/Controllers/SaleController';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatMoney } from '@/lib/format';
import CustomerFormDialog from '@/components/customers/customer-form-dialog';
import type { CustomerRow } from '@/components/customers/customer-form-dialog';

type Movement = {
    date: string;
    type: 'charge' | 'payment';
    concept: string;
    reference_id: number;
    charge: string;
    payment: string;
    balance: string;
};

type Props = {
    customer: CustomerRow & { available_credit: string };
    movements: Movement[];
    hasOpenSession: boolean;
    can: { manage: boolean; payment: boolean };
};

function openWindow(url: string) {
    window.open(url, 'ticket', 'width=380,height=640');
}

export default function CustomerShow({
    customer,
    movements,
    hasOpenSession,
    can,
}: Props) {
    const [editing, setEditing] = useState(false);
    const [method, setMethod] = useState<'cash' | 'card' | 'transfer'>(
        hasOpenSession ? 'cash' : 'transfer',
    );
    const balance = Number(customer.balance);

    // Al registrar un abono, el servidor manda su id para imprimir el recibo.
    useEffect(() => {
        return router.on('flash', (event) => {
            const payment = (event as CustomEvent).detail?.flash?.payment as
                | { id: number }
                | undefined;
            if (payment) {
                openWindow(CustomerController.receipt.url(payment.id));
            }
        });
    }, []);

    return (
        <>
            <Head title={`Estado de cuenta · ${customer.name}`} />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <h1 className="text-xl font-semibold">
                            {customer.name}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {[customer.phone, customer.email, customer.address]
                                .filter(Boolean)
                                .join(' · ') || 'Sin datos de contacto'}
                        </p>
                    </div>
                    {can.manage && (
                        <Button
                            variant="outline"
                            onClick={() => setEditing(true)}
                        >
                            <Pencil /> Editar
                        </Button>
                    )}
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-xl border p-4">
                        <div className="text-sm text-muted-foreground">
                            Saldo (debe)
                        </div>
                        <div
                            className={`text-3xl font-semibold tabular-nums ${balance > 0 ? 'text-red-600' : ''}`}
                        >
                            {formatMoney(balance)}
                        </div>
                    </div>
                    <div className="rounded-xl border p-4">
                        <div className="text-sm text-muted-foreground">
                            Límite de crédito
                        </div>
                        <div className="text-3xl font-semibold tabular-nums">
                            {formatMoney(customer.credit_limit)}
                        </div>
                    </div>
                    <div className="rounded-xl border p-4">
                        <div className="text-sm text-muted-foreground">
                            Crédito disponible
                        </div>
                        <div className="text-3xl font-semibold text-green-700 tabular-nums dark:text-green-500">
                            {formatMoney(
                                Math.max(Number(customer.available_credit), 0),
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
                    <section className="overflow-x-auto rounded-xl border">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50 text-left text-xs text-muted-foreground uppercase">
                                <tr>
                                    <th className="px-3 py-2">Fecha</th>
                                    <th className="px-3 py-2">Concepto</th>
                                    <th className="px-3 py-2 text-right">
                                        Cargo
                                    </th>
                                    <th className="px-3 py-2 text-right">
                                        Abono
                                    </th>
                                    <th className="px-3 py-2 text-right">
                                        Saldo
                                    </th>
                                    <th className="w-10" />
                                </tr>
                            </thead>
                            <tbody>
                                {movements.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan={6}
                                            className="px-3 py-8 text-center text-muted-foreground"
                                        >
                                            Sin compras a crédito ni abonos.
                                        </td>
                                    </tr>
                                )}
                                {movements.map((m) => (
                                    <tr
                                        key={`${m.type}-${m.reference_id}`}
                                        className="border-t"
                                    >
                                        <td className="px-3 py-2 whitespace-nowrap">
                                            {new Date(
                                                m.date.replace(' ', 'T'),
                                            ).toLocaleString('es-MX', {
                                                dateStyle: 'short',
                                                timeStyle: 'short',
                                            })}
                                        </td>
                                        <td className="px-3 py-2">
                                            {m.concept}
                                        </td>
                                        <td className="px-3 py-2 text-right text-red-600 tabular-nums">
                                            {m.type === 'charge'
                                                ? formatMoney(m.charge)
                                                : ''}
                                        </td>
                                        <td className="px-3 py-2 text-right text-green-700 tabular-nums dark:text-green-500">
                                            {m.type === 'payment'
                                                ? formatMoney(m.payment)
                                                : ''}
                                        </td>
                                        <td className="px-3 py-2 text-right font-medium tabular-nums">
                                            {formatMoney(m.balance)}
                                        </td>
                                        <td className="px-1 py-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                aria-label={
                                                    m.type === 'charge'
                                                        ? 'Ver ticket'
                                                        : 'Ver recibo'
                                                }
                                                onClick={() =>
                                                    openWindow(
                                                        m.type === 'charge'
                                                            ? SaleController.ticket.url(
                                                                  m.reference_id,
                                                                  {
                                                                      query: {
                                                                          print: 0,
                                                                      },
                                                                  },
                                                              )
                                                            : CustomerController.receipt.url(
                                                                  m.reference_id,
                                                                  {
                                                                      query: {
                                                                          print: 0,
                                                                      },
                                                                  },
                                                              ),
                                                    )
                                                }
                                            >
                                                <Printer />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>

                    {can.payment && (
                        <section className="h-fit rounded-xl border p-4">
                            <h2 className="mb-3 font-medium">
                                Registrar abono
                            </h2>
                            {balance <= 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    El cliente no tiene saldo pendiente.
                                </p>
                            ) : (
                                <Form
                                    {...CustomerController.payment.form(
                                        customer.id,
                                    )}
                                    resetOnSuccess
                                    options={{ preserveScroll: true }}
                                    className="grid gap-3"
                                >
                                    {({ errors, processing }) => (
                                        <>
                                            <div className="grid gap-1.5">
                                                <Label htmlFor="p-amount">
                                                    Monto
                                                </Label>
                                                <Input
                                                    id="p-amount"
                                                    name="amount"
                                                    type="number"
                                                    step="0.01"
                                                    min="0.01"
                                                    max={balance}
                                                    inputMode="decimal"
                                                    required
                                                    className="h-11 text-lg tabular-nums"
                                                />
                                                <button
                                                    type="button"
                                                    className="w-fit text-xs text-muted-foreground underline"
                                                    onClick={(e) => {
                                                        const input = (
                                                            e.currentTarget
                                                                .form as HTMLFormElement
                                                        ).elements.namedItem(
                                                            'amount',
                                                        ) as HTMLInputElement;
                                                        input.value =
                                                            balance.toFixed(2);
                                                    }}
                                                >
                                                    Liquidar{' '}
                                                    {formatMoney(balance)}
                                                </button>
                                                <InputError
                                                    message={errors.amount}
                                                />
                                            </div>
                                            <div className="grid gap-1.5">
                                                <Label htmlFor="p-method">
                                                    Forma de pago
                                                </Label>
                                                <select
                                                    id="p-method"
                                                    name="method"
                                                    value={method}
                                                    onChange={(e) =>
                                                        setMethod(
                                                            e.target
                                                                .value as typeof method,
                                                        )
                                                    }
                                                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm dark:bg-input/30"
                                                >
                                                    <option
                                                        value="cash"
                                                        disabled={
                                                            !hasOpenSession
                                                        }
                                                    >
                                                        Efectivo
                                                        {hasOpenSession
                                                            ? ''
                                                            : ' (requiere turno abierto)'}
                                                    </option>
                                                    <option value="card">
                                                        Tarjeta
                                                    </option>
                                                    <option value="transfer">
                                                        Transferencia
                                                    </option>
                                                </select>
                                                <InputError
                                                    message={errors.method}
                                                />
                                            </div>
                                            {method !== 'cash' && (
                                                <div className="grid gap-1.5">
                                                    <Label htmlFor="p-ref">
                                                        Referencia
                                                    </Label>
                                                    <Input
                                                        id="p-ref"
                                                        name="reference"
                                                    />
                                                </div>
                                            )}
                                            <Button
                                                type="submit"
                                                disabled={processing}
                                            >
                                                Registrar abono e imprimir
                                                recibo
                                            </Button>
                                            {method === 'cash' && (
                                                <p className="text-xs text-muted-foreground">
                                                    El efectivo se suma al corte
                                                    de tu turno.
                                                </p>
                                            )}
                                        </>
                                    )}
                                </Form>
                            )}
                        </section>
                    )}
                </div>
            </div>

            {can.manage && (
                <CustomerFormDialog
                    customer={customer}
                    open={editing}
                    onOpenChange={setEditing}
                />
            )}
        </>
    );
}

CustomerShow.layout = {
    breadcrumbs: [
        { title: 'Clientes', href: CustomerController.index() },
        { title: 'Estado de cuenta', href: '#' },
    ],
};
