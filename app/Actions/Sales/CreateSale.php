<?php

namespace App\Actions\Sales;

use App\Actions\Inventory\RegisterInventoryMovement;
use App\Enums\InventoryMovementType;
use App\Enums\PaymentMethod;
use App\Enums\SaleStatus;
use App\Models\CashSession;
use App\Models\Customer;
use App\Models\Product;
use App\Models\Sale;
use App\Models\User;
use App\Support\Decimal;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Cobra una venta. Todo ocurre en una sola transacción:
 * venta + partidas + pagos + descuento de inventario + saldo del cliente.
 *
 * Los precios SIEMPRE se toman de la base de datos, nunca del navegador.
 */
class CreateSale
{
    public function __construct(private RegisterInventoryMovement $inventory) {}

    /**
     * @param  array<int, array{product_id: int, quantity: string|float|int, discount?: string|float|int|null, unit_price?: string|float|int|null}>  $items
     * @param  array<int, array{method: string, amount: string|float|int, reference?: string|null}>  $payments
     *
     * En pagos en efectivo, `amount` es lo que entrega el cliente; el cambio se calcula aquí.
     * `unit_price` cambia el precio de lista de la partida; quien llama debe haber validado
     * la autorización (ver SaleAdjustmentAuthorization) y pasar en $authorizedBy quién la dio.
     */
    public function handle(
        User $user,
        CashSession $session,
        array $items,
        array $payments,
        ?int $customerId = null,
        ?int $authorizedBy = null,
    ): Sale {
        if ($items === []) {
            throw ValidationException::withMessages(['items' => 'La venta no tiene productos.']);
        }

        return DB::transaction(function () use ($user, $session, $items, $payments, $customerId, $authorizedBy) {
            $session = CashSession::query()
                ->with('cashRegister')
                ->whereKey($session->id)
                ->lockForUpdate()
                ->firstOrFail();

            if (! $session->isOpen()) {
                throw ValidationException::withMessages(['cash_session_id' => 'El turno de caja está cerrado.']);
            }

            if ($session->user_id !== $user->id) {
                throw ValidationException::withMessages(['cash_session_id' => 'El turno de caja pertenece a otro usuario.']);
            }

            $branchId = $session->cashRegister->branch_id;

            // ---- Partidas ----
            $products = Product::query()
                ->with('unit:id,abbreviation,allows_decimals')
                ->whereIn('id', array_column($items, 'product_id'))
                ->where('active', true)
                ->get()
                ->keyBy('id');

            $lines = [];
            $subtotal = $discountTotal = $taxTotal = $total = $costTotal = '0';

            foreach ($items as $i => $item) {
                $product = $products->get($item['product_id'])
                    ?? throw ValidationException::withMessages(["items.$i.product_id" => 'Producto no disponible.']);

                $quantity = Decimal::round((string) $item['quantity'], 3);

                if (! Decimal::gt($quantity, '0')) {
                    throw ValidationException::withMessages(["items.$i.quantity" => 'La cantidad debe ser mayor a cero.']);
                }

                // Cantidad mínima y múltiplos de venta (p. ej. no vender 0.2 cepillos).
                if ($error = $product->saleQuantityError($quantity)) {
                    throw ValidationException::withMessages(["items.$i.quantity" => $error]);
                }

                $listPrice = $product->priceFor($quantity);
                $price = $listPrice;
                $priceChanged = false;

                // Cambio de precio autorizado al cobrar.
                if (isset($item['unit_price']) && $item['unit_price'] !== '') {
                    $price = Decimal::round((string) $item['unit_price']);

                    if (Decimal::lt($price, '0')) {
                        throw ValidationException::withMessages(["items.$i.unit_price" => 'Precio inválido.']);
                    }

                    $priceChanged = bccomp($price, $listPrice, 2) !== 0;
                }

                $gross = Decimal::mul($price, $quantity);
                $discount = Decimal::round((string) ($item['discount'] ?? '0'));

                if (Decimal::lt($discount, '0') || Decimal::gt($discount, $gross)) {
                    throw ValidationException::withMessages(["items.$i.discount" => 'Descuento inválido.']);
                }

                $net = Decimal::sub($gross, $discount);
                $rate = (string) $product->tax_rate;

                if ($product->price_includes_tax) {
                    // El precio ya trae IVA: se desglosa.
                    $lineTotal = $net;
                    $base = Decimal::round(bcdiv($net, bcadd('1', $rate, 6), 6));
                    $tax = Decimal::sub($lineTotal, $base);
                } else {
                    $base = $net;
                    $tax = Decimal::mul($net, $rate);
                    $lineTotal = Decimal::add($base, $tax);
                }

                $lines[] = [
                    'product' => $product,
                    'quantity' => $quantity,
                    'price' => $price,
                    'list_price' => $priceChanged ? $listPrice : null,
                    'cost' => (string) $product->cost,
                    'discount' => $discount,
                    'tax_rate' => $rate,
                    'tax' => $tax,
                    'total' => $lineTotal,
                ];

                $subtotal = Decimal::add($subtotal, $base);
                $discountTotal = Decimal::add($discountTotal, $discount);
                $taxTotal = Decimal::add($taxTotal, $tax);
                $total = Decimal::add($total, $lineTotal);
                $costTotal = Decimal::add($costTotal, Decimal::mul($product->cost, $quantity));
            }

            // ---- Pagos ----
            $customer = null;
            if ($customerId) {
                $customer = Customer::query()->whereKey($customerId)->lockForUpdate()->first()
                    ?? throw ValidationException::withMessages(['customer_id' => 'Cliente no encontrado.']);
            }

            $paymentRows = $this->resolvePayments($payments, $total, $customer);

            // ---- Guardar ----
            $sale = Sale::create([
                'folio' => $this->nextFolio($branchId),
                'branch_id' => $branchId,
                'cash_session_id' => $session->id,
                'user_id' => $user->id,
                'authorized_by' => $authorizedBy,
                'customer_id' => $customer?->id,
                'subtotal' => $subtotal,
                'discount' => $discountTotal,
                'tax' => $taxTotal,
                'total' => $total,
                'cost_total' => $costTotal,
                'status' => SaleStatus::Completed,
            ]);

            foreach ($lines as $line) {
                $sale->items()->create([
                    'product_id' => $line['product']->id,
                    'description' => $line['product']->name,
                    'quantity' => $line['quantity'],
                    'price' => $line['price'],
                    'list_price' => $line['list_price'],
                    'cost' => $line['cost'],
                    'discount' => $line['discount'],
                    'tax_rate' => $line['tax_rate'],
                    'tax' => $line['tax'],
                    'total' => $line['total'],
                ]);

                $this->inventory->handle(
                    product: $line['product'],
                    branchId: $branchId,
                    type: InventoryMovementType::Sale,
                    quantity: '-'.$line['quantity'],
                    user: $user,
                    reference: $sale,
                    cost: $line['cost'],
                );
            }

            $sale->payments()->createMany($paymentRows);

            $credit = collect($paymentRows)->firstWhere('method', PaymentMethod::Credit);
            if ($credit && $customer) {
                $customer->update(['balance' => Decimal::add((string) $customer->balance, $credit['amount'])]);
            }

            return $sale->load('items', 'payments', 'customer', 'user');
        });
    }

    /**
     * Aplica los pagos al total. Los pagos no-efectivo se aplican primero;
     * el efectivo cubre el resto y el excedente se devuelve como cambio.
     *
     * @return array<int, array<string, mixed>>
     */
    private function resolvePayments(array $payments, string $total, ?Customer $customer): array
    {
        if ($payments === []) {
            throw ValidationException::withMessages(['payments' => 'Agrega al menos una forma de pago.']);
        }

        $nonCash = [];
        $cashReceived = '0';

        foreach ($payments as $i => $payment) {
            $method = PaymentMethod::tryFrom($payment['method'] ?? '')
                ?? throw ValidationException::withMessages(["payments.$i.method" => 'Forma de pago inválida.']);

            $amount = Decimal::round((string) $payment['amount']);

            if (! Decimal::gt($amount, '0')) {
                throw ValidationException::withMessages(["payments.$i.amount" => 'El monto debe ser mayor a cero.']);
            }

            if ($method === PaymentMethod::Cash) {
                $cashReceived = Decimal::add($cashReceived, $amount);

                continue;
            }

            $nonCash[] = ['method' => $method, 'amount' => $amount, 'reference' => $payment['reference'] ?? null];
        }

        $nonCashTotal = Decimal::add('0', ...array_column($nonCash, 'amount'));

        if (Decimal::gt($nonCashTotal, $total)) {
            throw ValidationException::withMessages(['payments' => 'Los pagos con tarjeta, transferencia o crédito exceden el total.']);
        }

        $credit = Decimal::add('0', ...array_column(
            array_filter($nonCash, fn ($p) => $p['method'] === PaymentMethod::Credit),
            'amount',
        ));

        if (Decimal::gt($credit, '0')) {
            if (! $customer) {
                throw ValidationException::withMessages(['customer_id' => 'Selecciona un cliente para vender a crédito.']);
            }

            if (Decimal::gt($credit, $customer->availableCredit())) {
                throw ValidationException::withMessages([
                    'payments' => "Crédito insuficiente. Disponible: \${$customer->availableCredit()}.",
                ]);
            }
        }

        $remaining = Decimal::sub($total, $nonCashTotal);

        if (Decimal::lt($cashReceived, $remaining)) {
            throw ValidationException::withMessages(['payments' => "Pago incompleto. Faltan \${$this->format(Decimal::sub($remaining, $cashReceived))}."]);
        }

        $rows = array_map(fn ($p) => [
            'method' => $p['method'],
            'amount' => $p['amount'],
            'received' => null,
            'change' => '0',
            'reference' => $p['reference'],
        ], $nonCash);

        if (Decimal::gt($cashReceived, '0')) {
            $rows[] = [
                'method' => PaymentMethod::Cash,
                'amount' => $remaining,
                'received' => $cashReceived,
                'change' => Decimal::sub($cashReceived, $remaining),
                'reference' => null,
            ];
        }

        return $rows;
    }

    private function nextFolio(int $branchId): int
    {
        $last = Sale::query()->where('branch_id', $branchId)->lockForUpdate()->max('folio');

        return ((int) $last) + 1;
    }

    private function format(string $amount): string
    {
        return number_format((float) $amount, 2);
    }
}
