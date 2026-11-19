export type CashSessionData = {
    id: number;
    register: string;
    user: string | null;
    opened_at: string;
    closed_at: string | null;
    opening_amount: string;
    expected_amount: string | null;
    counted_amount: string | null;
    difference: string | null;
    notes: string | null;
};

export type CashSummary = {
    opening_amount: string;
    sales_count: number;
    cancelled_count: number;
    sales_total: string;
    sales_by_method: Record<'cash' | 'card' | 'transfer' | 'credit', string>;
    customer_payments_cash: string;
    cash_in: string;
    cash_out: string;
    expected_cash: string;
};

export type CashMovementRow = {
    id: number;
    type: 'in' | 'out';
    amount: string;
    reason: string;
    created_at: string;
};

export const paymentLabels: Record<string, string> = {
    cash: 'Efectivo',
    card: 'Tarjeta',
    transfer: 'Transferencia',
    credit: 'Crédito',
};
