export type Option = { id: number; name: string };

export type Unit = Option & { abbreviation: string; allows_decimals: boolean };

export type Product = {
    id: number;
    category_id: number | null;
    unit_id: number;
    sku: string | null;
    barcode: string | null;
    name: string;
    description: string | null;
    cost: string;
    price: string;
    wholesale_price: string | null;
    wholesale_min_quantity: string | null;
    tax_rate: string;
    price_includes_tax: boolean;
    min_stock: string;
    min_sale_quantity: string;
    sale_step: string;
    tracks_inventory: boolean;
    sells_by_weight: boolean;
    active: boolean;
    category?: Option | null;
    unit?: { id: number; abbreviation: string };
};

/** Producto con el valor de su existencia en bodega. */
export type ValuedProduct = Product & {
    stock: string | number;
    stock_cost_value: string | number;
    stock_sale_value: string | number;
    stock_profit: string | number;
};

export type InventoryTotals = {
    products: number;
    units: string;
    cost_value: string;
    sale_value: string;
    profit: string;
};

export type Paginated<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    from: number | null;
    to: number | null;
    total: number;
    prev_page_url: string | null;
    next_page_url: string | null;
};
