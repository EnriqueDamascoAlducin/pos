import { Boxes, DollarSign, TrendingUp, Warehouse } from 'lucide-react';
import { formatMoney, formatQuantity } from '@/lib/format';
import type { InventoryTotals } from '@/types/pos';

export default function InventoryValueCards({
    totals,
}: {
    totals: InventoryTotals;
}) {
    const cards = [
        {
            label: 'Valor en bodega (compra)',
            value: formatMoney(totals.cost_value),
            hint: 'Existencia × precio de compra',
            icon: Warehouse,
        },
        {
            label: 'Valor en bodega (venta)',
            value: formatMoney(totals.sale_value),
            hint: 'Existencia × precio de venta',
            icon: DollarSign,
        },
        {
            label: 'Utilidad potencial',
            value: formatMoney(totals.profit),
            hint: 'Si se vende todo a precio de lista',
            icon: TrendingUp,
        },
        {
            label: 'Unidades en bodega',
            value: formatQuantity(totals.units),
            hint: `${totals.products} productos con existencia`,
            icon: Boxes,
        },
    ];

    return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
                <div
                    key={card.label}
                    className="rounded-xl border border-sidebar-border/70 p-4 dark:border-sidebar-border"
                >
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                        {card.label}
                        <card.icon className="size-4" />
                    </div>
                    <div className="mt-2 text-2xl font-semibold tabular-nums">
                        {card.value}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                        {card.hint}
                    </div>
                </div>
            ))}
        </div>
    );
}
