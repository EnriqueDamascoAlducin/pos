import { Head, Link, router } from '@inertiajs/react';
import { Pencil, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import CustomerController from '@/actions/App/Http/Controllers/CustomerController';
import CustomerFormDialog from '@/components/customers/customer-form-dialog';
import type { CustomerRow } from '@/components/customers/customer-form-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatMoney } from '@/lib/format';
import type { Paginated } from '@/types/pos';

type Props = {
    customers: Paginated<CustomerRow>;
    receivable: { total: string; customers: number };
    filters: { search?: string; with_balance?: string | boolean };
    can: { manage: boolean };
};

export default function CustomersIndex({
    customers,
    receivable,
    filters,
    can,
}: Props) {
    const [search, setSearch] = useState(filters.search ?? '');
    const [editing, setEditing] = useState<CustomerRow | null>(null);
    const [open, setOpen] = useState(false);
    const withBalance =
        filters.with_balance === true ||
        filters.with_balance === '1' ||
        filters.with_balance === 'true';

    const apply = (patch: Record<string, string | undefined>) =>
        router.get(
            CustomerController.index.url(),
            {
                search: search || undefined,
                with_balance: withBalance ? '1' : undefined,
                ...patch,
            },
            { preserveState: true, replace: true },
        );

    return (
        <>
            <Head title="Clientes" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h1 className="text-xl font-semibold">Clientes</h1>
                    {can.manage && (
                        <Button
                            onClick={() => {
                                setEditing(null);
                                setOpen(true);
                            }}
                        >
                            <Plus /> Nuevo cliente
                        </Button>
                    )}
                </div>

                <button
                    type="button"
                    onClick={() =>
                        apply({ with_balance: withBalance ? undefined : '1' })
                    }
                    className="max-w-sm rounded-xl border p-4 text-left hover:bg-muted/40"
                >
                    <div className="text-sm text-muted-foreground">
                        Cuentas por cobrar
                    </div>
                    <div className="text-2xl font-semibold tabular-nums">
                        {formatMoney(receivable.total)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                        {receivable.customers} clientes con saldo ·{' '}
                        {withBalance ? 'ver todos' : 'ver solo esos'}
                    </div>
                </button>

                <form
                    className="flex flex-wrap items-center gap-3"
                    onSubmit={(e) => {
                        e.preventDefault();
                        apply({});
                    }}
                >
                    <div className="relative min-w-60 flex-1">
                        <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Buscar por nombre o teléfono"
                            className="pl-8"
                        />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={withBalance}
                            onChange={(e) =>
                                apply({
                                    with_balance: e.target.checked
                                        ? '1'
                                        : undefined,
                                })
                            }
                        />
                        Solo con saldo
                    </label>
                </form>

                <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-left text-xs text-muted-foreground uppercase">
                            <tr>
                                <th className="px-3 py-2">Cliente</th>
                                <th className="px-3 py-2">Teléfono</th>
                                <th className="px-3 py-2 text-right">Límite</th>
                                <th className="px-3 py-2 text-right">Debe</th>
                                <th className="px-3 py-2 text-right">
                                    Disponible
                                </th>
                                <th className="px-3 py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {customers.data.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={6}
                                        className="px-3 py-8 text-center text-muted-foreground"
                                    >
                                        No hay clientes.
                                    </td>
                                </tr>
                            )}
                            {customers.data.map((c) => {
                                const balance = Number(c.balance);
                                const available =
                                    Number(c.credit_limit) - balance;

                                return (
                                    <tr
                                        key={c.id}
                                        className={`border-t ${c.active ? '' : 'text-muted-foreground'}`}
                                    >
                                        <td className="px-3 py-2">
                                            <Link
                                                href={CustomerController.show(
                                                    c.id,
                                                )}
                                                className="font-medium hover:underline"
                                            >
                                                {c.name}
                                            </Link>
                                            {!c.active && (
                                                <Badge
                                                    variant="outline"
                                                    className="ml-2"
                                                >
                                                    Inactivo
                                                </Badge>
                                            )}
                                        </td>
                                        <td className="px-3 py-2">
                                            {c.phone ?? '—'}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {formatMoney(c.credit_limit)}
                                        </td>
                                        <td
                                            className={`px-3 py-2 text-right font-medium tabular-nums ${balance > 0 ? 'text-red-600' : ''}`}
                                        >
                                            {formatMoney(balance)}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums">
                                            {formatMoney(
                                                Math.max(available, 0),
                                            )}
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="flex justify-end gap-1">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    asChild
                                                >
                                                    <Link
                                                        href={CustomerController.show(
                                                            c.id,
                                                        )}
                                                    >
                                                        Estado de cuenta
                                                    </Link>
                                                </Button>
                                                {can.manage && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        aria-label="Editar"
                                                        onClick={() => {
                                                            setEditing(c);
                                                            setOpen(true);
                                                        }}
                                                    >
                                                        <Pencil />
                                                    </Button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {customers.last_page > 1 && (
                    <div className="flex justify-end gap-2">
                        {customers.prev_page_url && (
                            <Button variant="outline" size="sm" asChild>
                                <Link href={customers.prev_page_url}>
                                    Anterior
                                </Link>
                            </Button>
                        )}
                        {customers.next_page_url && (
                            <Button variant="outline" size="sm" asChild>
                                <Link href={customers.next_page_url}>
                                    Siguiente
                                </Link>
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {can.manage && (
                <CustomerFormDialog
                    customer={editing}
                    open={open}
                    onOpenChange={setOpen}
                />
            )}
        </>
    );
}

CustomersIndex.layout = {
    breadcrumbs: [{ title: 'Clientes', href: CustomerController.index() }],
};
