const money = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
});

const quantity = new Intl.NumberFormat('es-MX', {
    maximumFractionDigits: 3,
});

export function formatMoney(value: string | number | null | undefined): string {
    return money.format(Number(value ?? 0));
}

export function formatQuantity(
    value: string | number | null | undefined,
): string {
    return quantity.format(Number(value ?? 0));
}

/** Margen de ganancia sobre el precio de venta, en %. */
export function marginPercent(
    cost: string | number,
    price: string | number,
): number | null {
    const c = Number(cost);
    const p = Number(price);

    if (!p || Number.isNaN(c) || Number.isNaN(p)) {
        return null;
    }

    return ((p - c) / p) * 100;
}
