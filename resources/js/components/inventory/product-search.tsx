import { Search } from 'lucide-react';
import { forwardRef, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import InventoryController from '@/actions/App/Http/Controllers/InventoryController';
import { Input } from '@/components/ui/input';
import { formatMoney, formatQuantity } from '@/lib/format';

export type StockProduct = {
    id: number;
    name: string;
    barcode: string | null;
    sku: string | null;
    cost: string;
    price: string;
    unit: string;
    allows_decimals: boolean;
    stock: string;
    exact: boolean;
};

async function fetchProducts(q: string): Promise<StockProduct[]> {
    const res = await fetch(
        `${InventoryController.search.url()}?q=${encodeURIComponent(q)}`,
        {
            headers: {
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
        },
    );

    return res.ok ? res.json() : [];
}

/**
 * Buscador con lector de código de barras: Enter agrega el producto exacto
 * o el resaltado de la lista; también busca por nombre mientras escribes.
 */
const ProductSearch = forwardRef<
    HTMLInputElement,
    { onSelect: (product: StockProduct) => void; placeholder?: string }
>(function ProductSearch({ onSelect, placeholder }, ref) {
    const [term, setTerm] = useState('');
    const [results, setResults] = useState<StockProduct[]>([]);
    const [highlight, setHighlight] = useState(0);
    const seq = useRef(0);

    useEffect(() => {
        const q = term.trim();
        if (q.length < 2) {
            setResults([]);
            return;
        }
        const current = ++seq.current;
        const t = setTimeout(async () => {
            const found = await fetchProducts(q);
            if (current === seq.current) {
                setResults(found);
                setHighlight(0);
            }
        }, 250);
        return () => clearTimeout(t);
    }, [term]);

    const choose = (p: StockProduct) => {
        onSelect(p);
        setTerm('');
        setResults([]);
    };

    const submit = async () => {
        const q = term.trim();
        if (!q) return;

        if (results[highlight]) {
            choose(results[highlight]);
            return;
        }

        seq.current++;
        const found = await fetchProducts(q);
        const exact =
            found.find((p) => p.exact) ??
            (found.length === 1 ? found[0] : undefined);

        if (exact) {
            choose(exact);
        } else if (found.length === 0) {
            toast.error(`No se encontró "${q}"`);
        } else {
            setResults(found);
        }
    };

    return (
        <div className="relative">
            <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input
                ref={ref}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        void submit();
                    } else if (e.key === 'Escape') {
                        setTerm('');
                        setResults([]);
                    } else if (
                        results.length > 0 &&
                        (e.key === 'ArrowDown' || e.key === 'ArrowUp')
                    ) {
                        e.preventDefault();
                        setHighlight((h) =>
                            e.key === 'ArrowDown'
                                ? Math.min(h + 1, results.length - 1)
                                : Math.max(h - 1, 0),
                        );
                    }
                }}
                placeholder={placeholder ?? 'Escanea o escribe el producto'}
                className="pl-8"
                autoComplete="off"
            />
            {results.length > 0 && (
                <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border bg-popover shadow-lg">
                    {results.map((p, i) => (
                        <li key={p.id}>
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onMouseEnter={() => setHighlight(i)}
                                onClick={() => choose(p)}
                                className={`flex w-full justify-between gap-4 px-3 py-2 text-left text-sm ${i === highlight ? 'bg-accent' : ''}`}
                            >
                                <span>
                                    <span className="font-medium">
                                        {p.name}
                                    </span>
                                    <span className="block font-mono text-xs text-muted-foreground">
                                        {p.barcode ?? p.sku ?? ''}
                                    </span>
                                </span>
                                <span className="text-right text-xs text-muted-foreground">
                                    Costo {formatMoney(p.cost)}
                                    <span className="block">
                                        Exist. {formatQuantity(p.stock)}{' '}
                                        {p.unit}
                                    </span>
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
});

export default ProductSearch;
