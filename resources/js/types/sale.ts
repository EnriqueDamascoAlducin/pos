export type PosProduct = {
    id: number;
    name: string;
    barcode: string | null;
    sku: string | null;
    price: string;
    wholesale_price: string | null;
    wholesale_min_quantity: string | null;
    tax_rate: string;
    price_includes_tax: boolean;
    unit: string;
    allows_decimals: boolean;
    min_sale_quantity: string;
    sale_step: string;
    tracks_inventory: boolean;
    stock: string;
    exact: boolean;
};

/** Trabaja en milésimas para evitar errores de punto flotante (0.1 + 0.2). */
const milli = (n: number | string) => Math.round(Number(n) * 1000);

const fmtQty = (n: number | string) => String(Number(Number(n).toFixed(3)));

/**
 * Valida cantidad mínima y múltiplo de venta. Igual que Product::saleQuantityError()
 * en el servidor, que es quien decide al final.
 */
export function quantityError(
    p: PosProduct,
    quantity: string | number,
): string | null {
    const q = milli(quantity);
    const min = milli(p.min_sale_quantity);
    const step = milli(p.sale_step);

    if (!(q > 0)) return 'Cantidad inválida';
    if (!p.allows_decimals && q % 1000 !== 0) return 'Solo piezas completas';
    if (q < min) return `Mínimo ${fmtQty(p.min_sale_quantity)} ${p.unit}`;
    if (step > 0 && q % step !== 0) {
        return step === 1000
            ? 'Solo piezas completas'
            : `Múltiplos de ${fmtQty(p.sale_step)} ${p.unit}`;
    }

    return null;
}

/** Ajusta una cantidad a la válida más cercana hacia arriba (respeta mínimo y múltiplo). */
export function snapQuantity(p: PosProduct, quantity: number): string {
    const step = Math.max(milli(p.sale_step), 1);
    const snapped = Math.max(
        Math.ceil(milli(quantity) / step) * step,
        milli(p.min_sale_quantity),
    );

    return fmtQty(snapped / 1000);
}

/** Siguiente cantidad al presionar + o − (de múltiplo en múltiplo, sin bajar del mínimo). */
export function stepQuantity(
    p: PosProduct,
    quantity: string,
    direction: 1 | -1,
): string {
    const step = Math.max(milli(p.sale_step), 1);
    const next = milli(quantity) + direction * step;

    return fmtQty(Math.max(next, milli(p.min_sale_quantity)) / 1000);
}

export type CartLine = {
    product: PosProduct;
    quantity: string;
    /** Descuento en pesos para toda la partida ('' = sin descuento). */
    discount: string;
    /** Precio unitario cambiado al cobrar ('' = precio de lista). */
    unitPrice: string;
};

/** ¿La partida trae descuento o precio cambiado? */
export const isAdjusted = (l: CartLine) =>
    l.unitPrice !== '' || Number(l.discount) > 0;

/** Ajustes de la venta, en el formato que espera el servidor. */
export const adjustmentsOf = (cart: CartLine[]) =>
    cart.filter(isAdjusted).map((l) => ({
        product_id: l.product.id,
        unit_price: l.unitPrice === '' ? null : l.unitPrice,
        discount: l.discount || 0,
    }));

export type PosCustomer = {
    id: number;
    name: string;
    available_credit: string;
};

export type PaymentInput = {
    method: 'cash' | 'card' | 'transfer' | 'credit';
    amount: string;
    reference?: string;
};

export type SaleDone = {
    id: number;
    folio: number;
    total: string;
    change: string;
};

export const round2 = (n: number) =>
    Math.round((n + Number.EPSILON) * 100) / 100;

/** Precio unitario aplicado según cantidad (mayoreo). Igual que Product::priceFor() en el servidor. */
export function unitPrice(p: PosProduct, quantity: number): number {
    if (
        p.wholesale_price !== null &&
        p.wholesale_min_quantity !== null &&
        quantity >= Number(p.wholesale_min_quantity)
    ) {
        return Number(p.wholesale_price);
    }

    return Number(p.price);
}

/** Total de una partida (vista previa; el servidor recalcula y manda). */
export function linePrice(line: CartLine): number {
    return line.unitPrice !== ''
        ? Number(line.unitPrice)
        : unitPrice(line.product, Number(line.quantity) || 0);
}

export function lineTotal(line: CartLine): number {
    const qty = Number(line.quantity) || 0;
    const net = round2(linePrice(line) * qty) - (Number(line.discount) || 0);

    return line.product.price_includes_tax
        ? round2(net)
        : round2(net + round2(net * Number(line.product.tax_rate)));
}
