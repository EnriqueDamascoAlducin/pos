import { Head, Link, router } from '@inertiajs/react';
import { confirmDialog } from '@/components/confirm-dialog';
import {
    Minus,
    Plus,
    Printer,
    Search,
    Tag,
    Trash2,
    Wallet,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import CashSessionController from '@/actions/App/Http/Controllers/CashSessionController';
import PosController from '@/actions/App/Http/Controllers/PosController';
import SaleController from '@/actions/App/Http/Controllers/SaleController';
import AdjustLineDialog from '@/components/pos/adjust-line-dialog';
import type { AdjustResult } from '@/components/pos/adjust-line-dialog';
import PaymentDialog from '@/components/pos/payment-dialog';
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
import { formatMoney, formatQuantity } from '@/lib/format';
import {
    lineTotal,
    quantityError,
    round2,
    snapQuantity,
    stepQuantity,
    unitPrice,
    isAdjusted,
    linePrice,
} from '@/types/sale';
import type {
    CartLine,
    PaymentInput,
    PosCustomer,
    PosProduct,
    SaleDone,
} from '@/types/sale';

type Props = {
    session: { id: number; register: string; opened_at: string };
    customers: PosCustomer[];
    can: { discount: boolean; credit: boolean };
    /** Si el negocio permite vender sin existencia (Datos del negocio). */
    allowNegativeStock: boolean;
};

const AUTOPRINT_KEY = 'pos.autoprint';

function readAutoprint(): boolean {
    try {
        return localStorage.getItem(AUTOPRINT_KEY) !== '0';
    } catch {
        return true;
    }
}

async function searchProducts(q: string): Promise<PosProduct[]> {
    const res = await fetch(
        `${PosController.search.url()}?q=${encodeURIComponent(q)}`,
        {
            headers: {
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
        },
    );

    return res.ok ? res.json() : [];
}

function openTicket(saleId: number) {
    window.open(
        SaleController.ticket.url(saleId),
        'ticket',
        'width=380,height=640',
    );
}

/** "Solo hay 40 pza" si la partida pide más de lo que hay en existencia. */
function stockShortage(line: CartLine): string | null {
    const p = line.product;
    if (!p.tracks_inventory || Number(line.quantity) <= Number(p.stock)) {
        return null;
    }
    return Number(p.stock) <= 0
        ? 'Sin existencia'
        : `Solo hay ${formatQuantity(p.stock)} ${p.unit}`;
}

export default function Pos({
    session,
    customers,
    can,
    allowNegativeStock,
}: Props) {
    const [cart, setCart] = useState<CartLine[]>([]);
    const [selected, setSelected] = useState<number>(-1);
    const [term, setTerm] = useState('');
    const [results, setResults] = useState<PosProduct[]>([]);
    const [highlight, setHighlight] = useState(0);
    const [customerId, setCustomerId] = useState<number | null>(null);
    const [paying, setPaying] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [done, setDone] = useState<SaleDone | null>(null);
    const [adjusting, setAdjusting] = useState<number | null>(null);
    const [authToken, setAuthToken] = useState<string | null>(null);
    const [authorizer, setAuthorizer] = useState<string | null>(null);
    const [autoprint, setAutoprint] = useState(readAutoprint);

    const searchRef = useRef<HTMLInputElement>(null);
    const qtyRefs = useRef<(HTMLInputElement | null)[]>([]);
    const searchSeq = useRef(0);

    const customer = customers.find((c) => c.id === customerId) ?? null;
    const total = useMemo(
        () => round2(cart.reduce((sum, l) => sum + lineTotal(l), 0)),
        [cart],
    );
    const units = cart.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);

    const focusSearch = () => setTimeout(() => searchRef.current?.focus(), 0);

    // ---------- Carrito ----------
    /**
     * Agrega un producto. Sin cantidad explícita entra con su cantidad mínima, y si ya
     * estaba en la venta sube un múltiplo. Con "3*código" se valida la cantidad pedida.
     */
    const addProduct = useCallback(
        (product: PosProduct, quantity?: number) => {
            const clear = () => {
                setTerm('');
                setResults([]);
                focusSearch();
            };

            if (quantity !== undefined) {
                const error = quantityError(product, quantity);
                if (error) {
                    toast.error(`${product.name}: ${error.toLowerCase()}.`);
                    clear();
                    return;
                }
            }

            const initial =
                quantity !== undefined
                    ? String(quantity)
                    : snapQuantity(product, Number(product.min_sale_quantity));

            setCart((prev) => {
                const idx = prev.findIndex((l) => l.product.id === product.id);
                if (idx >= 0) {
                    const next = [...prev];
                    const current = next[idx].quantity;
                    next[idx] = {
                        ...next[idx],
                        quantity:
                            quantity !== undefined
                                ? String(
                                      Number(
                                          (
                                              (Number(current) || 0) + quantity
                                          ).toFixed(3),
                                      ),
                                  )
                                : stepQuantity(product, current, 1),
                    };
                    setSelected(idx);
                    return next;
                }
                setSelected(prev.length);
                return [
                    ...prev,
                    { product, quantity: initial, discount: '', unitPrice: '' },
                ];
            });

            if (
                product.tracks_inventory &&
                Number(product.stock) < Number(initial)
            ) {
                const msg = `"${product.name}": solo hay ${formatQuantity(product.stock)} ${product.unit} en existencia.`;
                if (allowNegativeStock) toast.warning(msg);
                else toast.error(msg);
            }

            clear();
        },
        [allowNegativeStock],
    );

    const updateLine = (idx: number, patch: Partial<CartLine>) =>
        setCart((prev) =>
            prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
        );

    const removeLine = (idx: number) => {
        setCart((prev) => prev.filter((_, i) => i !== idx));
        setSelected((s) => Math.min(s, cart.length - 2));
        focusSearch();
    };

    const clearSale = () => {
        setCart([]);
        setSelected(-1);
        setCustomerId(null);
        setAuthToken(null);
        setAuthorizer(null);
        focusSearch();
    };

    /** Aplica el ajuste de una partida; si vino autorizado, guarda el pase para el cobro. */
    const applyAdjustment = (index: number, result: AdjustResult) => {
        updateLine(index, {
            unitPrice: result.unitPrice,
            discount: result.discount,
        });
        if (result.token) {
            setAuthToken(result.token);
            setAuthorizer(result.supervisor ?? null);
            toast.success(`Autorizado por ${result.supervisor}`);
        }
        setAdjusting(null);
        focusSearch();
    };

    // ---------- Búsqueda ----------
    // Sugerencias mientras se escribe (por nombre).
    useEffect(() => {
        const q = term.trim();
        if (q.length < 2 || /^\d*\*/.test(q)) {
            setResults([]);
            return;
        }
        const seq = ++searchSeq.current;
        const t = setTimeout(async () => {
            const found = await searchProducts(q);
            if (seq === searchSeq.current) {
                setResults(found);
                setHighlight(0);
            }
        }, 250);
        return () => clearTimeout(t);
    }, [term]);

    /** Enter en el buscador. Acepta "3*codigo" para capturar cantidad. */
    const submitSearch = async () => {
        if (results.length > 0 && results[highlight] && !term.includes('*')) {
            addProduct(results[highlight]);
            return;
        }

        const raw = term.trim();
        if (!raw) {
            return;
        }

        const match = raw.match(/^(\d+(?:\.\d+)?)\*(.+)$/);
        const quantity = match ? Number(match[1]) : undefined;
        const q = match ? match[2].trim() : raw;

        searchSeq.current++;
        const found = await searchProducts(q);
        const exact = found.find((p) => p.exact);

        if (exact || found.length === 1) {
            addProduct(exact ?? found[0], quantity);
        } else if (found.length === 0) {
            toast.error(`No se encontró "${q}"`);
            setTerm('');
        } else {
            setResults(found);
            setHighlight(0);
        }
    };

    // ---------- Cobro ----------
    const openPayment = useCallback(() => {
        if (cart.length === 0) {
            toast.error('Agrega productos a la venta.');
            return;
        }
        const invalid = cart.find((l) => quantityError(l.product, l.quantity));
        if (invalid) {
            toast.error(
                `${invalid.product.name}: ${quantityError(invalid.product, invalid.quantity)?.toLowerCase()}.`,
            );
            setSelected(cart.indexOf(invalid));
            return;
        }
        // Sin existencia suficiente no se cobra (salvo que el negocio lo permita).
        const short = allowNegativeStock
            ? undefined
            : cart.find((l) => stockShortage(l));
        if (short) {
            toast.error(
                `"${short.product.name}": ${stockShortage(short)?.toLowerCase()} en existencia.`,
            );
            setSelected(cart.indexOf(short));
            return;
        }
        setPaying(true);
    }, [cart, allowNegativeStock]);

    const confirmPayment = (payments: PaymentInput[]) => {
        router.post(
            PosController.store.url(),
            {
                customer_id: customerId,
                items: cart.map((l) => ({
                    product_id: l.product.id,
                    quantity: l.quantity,
                    discount: l.discount || 0,
                    unit_price: l.unitPrice === '' ? null : l.unitPrice,
                })),
                payments,
                authorization_token: authToken,
            },
            {
                preserveScroll: true,
                preserveState: true,
                onStart: () => setProcessing(true),
                onFinish: () => setProcessing(false),
                onError: (errors) => {
                    toast.error(
                        Object.values(errors)[0] ??
                            'No se pudo cobrar la venta.',
                    );
                },
            },
        );
    };

    // Venta guardada: el servidor manda los datos en flash.
    useEffect(() => {
        return router.on('flash', (event) => {
            const sale = (event as CustomEvent).detail?.flash?.sale as
                | SaleDone
                | undefined;
            if (!sale) return;

            setPaying(false);
            setCart([]);
            setSelected(-1);
            setCustomerId(null);
            setAuthToken(null);
            setAuthorizer(null);
            setDone(sale);
            if (readAutoprint()) openTicket(sale.id);
        });
    }, []);

    // ---------- Atajos de teclado ----------
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (paying || done || adjusting !== null) return;

            const inInput =
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLSelectElement;

            switch (e.key) {
                case 'F2':
                    e.preventDefault();
                    searchRef.current?.focus();
                    break;
                case 'F4':
                    e.preventDefault();
                    if (selected >= 0) qtyRefs.current[selected]?.select();
                    break;
                case 'F6':
                    e.preventDefault();
                    if (selected >= 0) setAdjusting(selected);
                    break;
                case 'F12':
                    e.preventDefault();
                    openPayment();
                    break;
                case 'Delete':
                    if (!inInput && selected >= 0) {
                        e.preventDefault();
                        removeLine(selected);
                    }
                    break;
                case 'ArrowUp':
                case 'ArrowDown':
                    if (
                        results.length === 0 &&
                        cart.length > 0 &&
                        (!inInput || e.target === searchRef.current)
                    ) {
                        e.preventDefault();
                        setSelected((s) =>
                            e.key === 'ArrowUp'
                                ? Math.max(s - 1, 0)
                                : Math.min(s + 1, cart.length - 1),
                        );
                    }
                    break;
            }
        };

        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [paying, done, adjusting, selected, cart, results, openPayment]);

    return (
        <>
            <Head title="Punto de venta" />

            <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:flex-row">
                {/* ------- Izquierda: búsqueda y partidas ------- */}
                <div className="flex min-h-0 flex-1 flex-col gap-3">
                    <div className="relative">
                        <Search className="absolute top-3.5 left-3 size-5 text-muted-foreground" />
                        <Input
                            ref={searchRef}
                            value={term}
                            onChange={(e) => setTerm(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void submitSearch();
                                } else if (e.key === 'Escape') {
                                    setTerm('');
                                    setResults([]);
                                } else if (
                                    results.length > 0 &&
                                    (e.key === 'ArrowDown' ||
                                        e.key === 'ArrowUp')
                                ) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setHighlight((h) =>
                                        e.key === 'ArrowDown'
                                            ? Math.min(
                                                  h + 1,
                                                  results.length - 1,
                                              )
                                            : Math.max(h - 1, 0),
                                    );
                                }
                            }}
                            placeholder="Escanea o escribe el producto (F2) · 3*código para cantidad"
                            className="h-12 pl-10 text-lg"
                            autoFocus
                            autoComplete="off"
                        />

                        {results.length > 0 && (
                            <ul className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-lg border bg-popover shadow-lg">
                                {results.map((p, i) => (
                                    <li key={p.id}>
                                        <button
                                            type="button"
                                            onMouseDown={(e) =>
                                                e.preventDefault()
                                            }
                                            onClick={() => addProduct(p)}
                                            onMouseEnter={() => setHighlight(i)}
                                            className={`flex w-full items-center justify-between gap-4 px-3 py-2 text-left text-sm ${i === highlight ? 'bg-accent' : ''}`}
                                        >
                                            <span>
                                                <span className="font-medium">
                                                    {p.name}
                                                </span>
                                                <span className="block font-mono text-xs text-muted-foreground">
                                                    {p.barcode ?? p.sku ?? ''}
                                                </span>
                                            </span>
                                            <span className="text-right">
                                                <span className="block font-medium tabular-nums">
                                                    {formatMoney(p.price)}
                                                </span>
                                                {p.tracks_inventory && (
                                                    <span
                                                        className={`text-xs ${Number(p.stock) <= 0 ? 'text-red-600' : 'text-muted-foreground'}`}
                                                    >
                                                        Exist.{' '}
                                                        {formatQuantity(
                                                            p.stock,
                                                        )}{' '}
                                                        {p.unit}
                                                    </span>
                                                )}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="min-h-64 flex-1 overflow-auto rounded-xl border">
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground uppercase">
                                <tr>
                                    <th className="px-3 py-2">Producto</th>
                                    <th className="w-36 px-3 py-2 text-center">
                                        Cantidad (F4)
                                    </th>
                                    <th className="px-3 py-2 text-right">
                                        Precio
                                    </th>
                                    <th className="w-24 px-3 py-2 text-center">
                                        Ajuste (F6)
                                    </th>
                                    <th className="px-3 py-2 text-right">
                                        Importe
                                    </th>
                                    <th className="w-10" />
                                </tr>
                            </thead>
                            <tbody>
                                {cart.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan={6}
                                            className="px-3 py-16 text-center text-muted-foreground"
                                        >
                                            Escanea un producto para comenzar.
                                        </td>
                                    </tr>
                                )}
                                {cart.map((line, idx) => {
                                    const qty = Number(line.quantity) || 0;
                                    const qtyError = quantityError(
                                        line.product,
                                        line.quantity,
                                    );
                                    const stockMsg = stockShortage(line);
                                    const hasRule =
                                        Number(
                                            line.product.min_sale_quantity,
                                        ) !== 1 ||
                                        Number(line.product.sale_step) !== 1;

                                    return (
                                        <tr
                                            key={line.product.id}
                                            onClick={() => setSelected(idx)}
                                            className={`border-t ${idx === selected ? 'bg-accent/60' : ''}`}
                                        >
                                            <td className="px-3 py-2">
                                                <div className="font-medium">
                                                    {line.product.name}
                                                </div>
                                                <div className="font-mono text-xs text-muted-foreground">
                                                    {line.product.barcode ??
                                                        line.product.sku ??
                                                        ''}
                                                </div>
                                                {hasRule && !qtyError && (
                                                    <div className="text-xs text-muted-foreground">
                                                        Mín.{' '}
                                                        {formatQuantity(
                                                            line.product
                                                                .min_sale_quantity,
                                                        )}{' '}
                                                        · de{' '}
                                                        {formatQuantity(
                                                            line.product
                                                                .sale_step,
                                                        )}{' '}
                                                        en{' '}
                                                        {formatQuantity(
                                                            line.product
                                                                .sale_step,
                                                        )}{' '}
                                                        {line.product.unit}
                                                    </div>
                                                )}
                                                {qtyError && (
                                                    <div className="text-xs font-medium text-red-600">
                                                        {qtyError}
                                                    </div>
                                                )}
                                                {!qtyError && stockMsg && (
                                                    <div
                                                        className={`text-xs font-medium ${allowNegativeStock ? 'text-amber-600 dark:text-amber-400' : 'text-red-600'}`}
                                                    >
                                                        {stockMsg}
                                                        {allowNegativeStock &&
                                                            ' · quedará en negativo'}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-3 py-2">
                                                <div className="flex items-center justify-center gap-1">
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        className="size-7"
                                                        tabIndex={-1}
                                                        onClick={() =>
                                                            updateLine(idx, {
                                                                quantity:
                                                                    stepQuantity(
                                                                        line.product,
                                                                        line.quantity,
                                                                        -1,
                                                                    ),
                                                            })
                                                        }
                                                    >
                                                        <Minus />
                                                    </Button>
                                                    <Input
                                                        ref={(el) => {
                                                            qtyRefs.current[
                                                                idx
                                                            ] = el;
                                                        }}
                                                        type="number"
                                                        min={
                                                            line.product
                                                                .min_sale_quantity
                                                        }
                                                        step={String(
                                                            Number(
                                                                line.product
                                                                    .sale_step,
                                                            ),
                                                        )}
                                                        inputMode={
                                                            line.product
                                                                .allows_decimals
                                                                ? 'decimal'
                                                                : 'numeric'
                                                        }
                                                        aria-invalid={
                                                            !!qtyError ||
                                                            (!!stockMsg &&
                                                                !allowNegativeStock)
                                                        }
                                                        value={line.quantity}
                                                        onChange={(e) =>
                                                            updateLine(idx, {
                                                                quantity:
                                                                    e.target
                                                                        .value,
                                                            })
                                                        }
                                                        onFocus={() =>
                                                            setSelected(idx)
                                                        }
                                                        onKeyDown={(e) =>
                                                            e.key === 'Enter' &&
                                                            focusSearch()
                                                        }
                                                        className="h-8 w-20 text-center tabular-nums"
                                                    />
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        className="size-7"
                                                        tabIndex={-1}
                                                        onClick={() =>
                                                            updateLine(idx, {
                                                                quantity:
                                                                    stepQuantity(
                                                                        line.product,
                                                                        line.quantity,
                                                                        1,
                                                                    ),
                                                            })
                                                        }
                                                    >
                                                        <Plus />
                                                    </Button>
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 text-right tabular-nums">
                                                {formatMoney(linePrice(line))}
                                                {line.unitPrice !== '' ? (
                                                    <span className="block text-xs text-muted-foreground line-through">
                                                        {formatMoney(
                                                            unitPrice(
                                                                line.product,
                                                                qty,
                                                            ),
                                                        )}
                                                    </span>
                                                ) : (
                                                    unitPrice(
                                                        line.product,
                                                        qty,
                                                    ) !==
                                                        Number(
                                                            line.product.price,
                                                        ) && (
                                                        <span className="block text-xs text-green-700 dark:text-green-500">
                                                            mayoreo
                                                        </span>
                                                    )
                                                )}
                                                {Number(line.discount) > 0 && (
                                                    <span className="block text-xs text-green-700 dark:text-green-500">
                                                        desc. −
                                                        {formatMoney(
                                                            line.discount,
                                                        )}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-center">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant={
                                                        isAdjusted(line)
                                                            ? 'secondary'
                                                            : 'ghost'
                                                    }
                                                    tabIndex={-1}
                                                    aria-label="Ajustar precio o descuento"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelected(idx);
                                                        setAdjusting(idx);
                                                    }}
                                                >
                                                    <Tag />
                                                    {isAdjusted(line)
                                                        ? 'Ajustado'
                                                        : ''}
                                                </Button>
                                            </td>
                                            <td className="px-3 py-2 text-right font-semibold tabular-nums">
                                                {formatMoney(lineTotal(line))}
                                            </td>
                                            <td className="px-1 py-2">
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="ghost"
                                                    tabIndex={-1}
                                                    aria-label="Quitar"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        removeLine(idx);
                                                    }}
                                                >
                                                    <Trash2 />
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <p className="text-xs text-muted-foreground">
                        F2 buscar · F4 cantidad · F6 ajustar precio/descuento ·
                        ↑↓ seleccionar · Supr quitar · F12 cobrar
                        {authorizer &&
                            ` · Ajustes autorizados por ${authorizer}`}
                    </p>
                </div>

                {/* ------- Derecha: totales y cobro ------- */}
                <aside className="flex w-full flex-col gap-3 lg:w-80">
                    <div className="rounded-xl border p-3 text-sm">
                        <div className="flex items-center justify-between">
                            <span className="font-medium">
                                {session.register}
                            </span>
                            <Link
                                href={CashSessionController.current()}
                                className="text-xs text-muted-foreground underline"
                            >
                                Caja / corte
                            </Link>
                        </div>
                        <div className="text-xs text-muted-foreground">
                            Turno desde{' '}
                            {new Date(session.opened_at).toLocaleTimeString(
                                'es-MX',
                                { hour: '2-digit', minute: '2-digit' },
                            )}
                        </div>
                    </div>

                    <div className="grid gap-1.5 rounded-xl border p-3">
                        <label
                            className="text-sm text-muted-foreground"
                            htmlFor="customer"
                        >
                            Cliente
                        </label>
                        <select
                            id="customer"
                            value={customerId ?? ''}
                            onChange={(e) =>
                                setCustomerId(
                                    e.target.value
                                        ? Number(e.target.value)
                                        : null,
                                )
                            }
                            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm dark:bg-input/30"
                        >
                            <option value="">Público en general</option>
                            {customers.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                        {customer && can.credit && (
                            <span className="text-xs text-muted-foreground">
                                Crédito disponible:{' '}
                                {formatMoney(customer.available_credit)}
                            </span>
                        )}
                    </div>

                    <div className="rounded-xl border bg-muted/40 p-4">
                        <div className="flex justify-between text-sm text-muted-foreground">
                            <span>Artículos</span>
                            <span className="tabular-nums">
                                {formatQuantity(units)}
                            </span>
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">
                            Total
                        </div>
                        <div className="text-4xl font-bold tracking-tight tabular-nums">
                            {formatMoney(total)}
                        </div>
                    </div>

                    <Button
                        size="lg"
                        className="h-14 text-lg"
                        onClick={openPayment}
                        disabled={cart.length === 0}
                    >
                        <Wallet /> Cobrar (F12)
                    </Button>
                    <Button
                        variant="outline"
                        onClick={async () => {
                            if (!cart.length) return;

                            const ok = await confirmDialog({
                                title: '¿Cancelar la venta actual?',
                                description: `Se quitarán los ${cart.length} productos capturados. No se guarda nada.`,
                                confirmText: 'Sí, cancelar venta',
                                cancelText: 'Seguir vendiendo',
                                destructive: true,
                            });

                            if (ok) clearSale();
                            else focusSearch();
                        }}
                        disabled={cart.length === 0}
                    >
                        Cancelar venta
                    </Button>

                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                            type="checkbox"
                            checked={autoprint}
                            onChange={(e) => {
                                setAutoprint(e.target.checked);
                                try {
                                    localStorage.setItem(
                                        AUTOPRINT_KEY,
                                        e.target.checked ? '1' : '0',
                                    );
                                } catch {
                                    /* sin almacenamiento */
                                }
                            }}
                        />
                        Imprimir ticket automáticamente
                    </label>
                </aside>
            </div>

            <AdjustLineDialog
                index={adjusting}
                cart={cart}
                canAdjust={can.discount}
                onClose={() => {
                    setAdjusting(null);
                    focusSearch();
                }}
                onApply={applyAdjustment}
            />

            <PaymentDialog
                open={paying}
                onOpenChange={(o) => {
                    setPaying(o);
                    if (!o) focusSearch();
                }}
                total={total}
                customer={customer}
                canCredit={can.credit}
                processing={processing}
                onConfirm={confirmPayment}
            />

            <Dialog
                open={done !== null}
                onOpenChange={(o) => {
                    if (!o) {
                        setDone(null);
                        focusSearch();
                    }
                }}
            >
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>
                            Venta {done?.folio} registrada
                        </DialogTitle>
                        <DialogDescription>
                            Total {formatMoney(done?.total)}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="rounded-lg bg-muted p-4 text-center">
                        <div className="text-sm text-muted-foreground">
                            Cambio
                        </div>
                        <div className="text-5xl font-bold tabular-nums">
                            {formatMoney(done?.change)}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => done && openTicket(done.id)}
                        >
                            <Printer /> Ticket
                        </Button>
                        <Button
                            autoFocus
                            onClick={() => {
                                setDone(null);
                                focusSearch();
                            }}
                        >
                            Nueva venta (Enter)
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

Pos.layout = {
    breadcrumbs: [{ title: 'Punto de venta', href: PosController.index() }],
};
