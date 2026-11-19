@php
    $money = fn ($v) => '$' . number_format((float) $v, 2);
    $qty = fn ($v) => rtrim(rtrim(number_format((float) $v, 3, '.', ''), '0'), '.');
    $methods = collect(\App\Enums\PaymentMethod::cases())->mapWithKeys(fn ($m) => [$m->value => $m->label()]);
@endphp
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <title>Ticket {{ $sale->folio }}</title>
    <style>
        @page { size: 80mm auto; margin: 0; }
        * { box-sizing: border-box; }
        body { width: 80mm; margin: 0; padding: 4mm; font-family: 'Courier New', monospace; font-size: 12px; color: #000; background: #fff; }
        .center { text-align: center; }
        .right { text-align: right; }
        .bold { font-weight: bold; }
        .big { font-size: 15px; }
        hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
        table { width: 100%; border-collapse: collapse; }
        td { vertical-align: top; padding: 1px 0; }
        .cancelled { border: 2px solid #000; padding: 4px; margin: 6px 0; font-size: 16px; }
        .actions { margin-top: 12px; display: flex; gap: 8px; }
        .actions button { flex: 1; padding: 8px; font-size: 14px; cursor: pointer; }
        @media print { .actions { display: none; } }
    </style>
</head>
<body>
    <div class="center">
        @if ($logoUrl)
            <img src="{{ $logoUrl }}" alt="" style="max-width: 50mm; max-height: 25mm; margin-bottom: 4px; filter: grayscale(1);">
        @endif
        <div class="bold big">{{ $settings['business_name'] ?? config('app.name') }}</div>
        @if (!empty($settings['business_rfc'])) <div>RFC: {{ $settings['business_rfc'] }}</div> @endif
        @if (!empty($settings['business_address'])) <div>{{ $settings['business_address'] }}</div> @endif
        @if (!empty($settings['business_phone'])) <div>Tel. {{ $settings['business_phone'] }}</div> @endif
        <div>{{ $sale->branch->name }}</div>
    </div>
    <hr>
    <table>
        <tr><td>Folio:</td><td class="right bold">{{ $sale->folio }}</td></tr>
        <tr><td>Fecha:</td><td class="right">{{ $sale->created_at->format('d/m/Y H:i') }}</td></tr>
        <tr><td>Atendió:</td><td class="right">{{ $sale->user->name }}</td></tr>
        @if ($sale->customer) <tr><td>Cliente:</td><td class="right">{{ $sale->customer->name }}</td></tr> @endif
    </table>

    @if ($sale->status === \App\Enums\SaleStatus::Cancelled)
        <div class="center bold cancelled">*** CANCELADA ***</div>
    @endif

    <hr>
    <table>
        @foreach ($sale->items as $item)
            <tr><td colspan="2">{{ $item->description }}</td></tr>
            <tr>
                <td>&nbsp;&nbsp;{{ $qty($item->quantity) }} x {{ $money($item->price) }}
                    @if ($item->list_price !== null) <br>&nbsp;&nbsp;Precio normal {{ $money($item->list_price) }} @endif
                    @if ((float) $item->discount > 0) <br>&nbsp;&nbsp;Desc. -{{ $money($item->discount) }} @endif
                </td>
                <td class="right">{{ $money($item->total) }}</td>
            </tr>
        @endforeach
    </table>
    <hr>
    <table>
        <tr><td>Subtotal</td><td class="right">{{ $money($sale->subtotal) }}</td></tr>
        @if ((float) $sale->discount > 0) <tr><td>Descuento</td><td class="right">-{{ $money($sale->discount) }}</td></tr> @endif
        <tr><td>IVA</td><td class="right">{{ $money($sale->tax) }}</td></tr>
        <tr class="bold big"><td>TOTAL</td><td class="right">{{ $money($sale->total) }}</td></tr>
    </table>
    <hr>
    <table>
        @foreach ($sale->payments as $payment)
            <tr>
                <td>{{ $methods[$payment->method->value] }}</td>
                <td class="right">{{ $money($payment->received ?? $payment->amount) }}</td>
            </tr>
            @if ((float) $payment->change > 0)
                <tr class="bold"><td>Cambio</td><td class="right">{{ $money($payment->change) }}</td></tr>
            @endif
        @endforeach
    </table>
    <hr>
    <div class="center">{{ $settings['ticket_footer'] ?? '' }}</div>
    <div class="center" style="font-size:10px;margin-top:4px">Este ticket no es un comprobante fiscal.</div>

    <div class="actions">
        <button onclick="window.print()">Imprimir</button>
        <button onclick="window.close()">Cerrar</button>
    </div>

    @if ($autoprint)
        <script>window.addEventListener('load', () => setTimeout(() => window.print(), 150));</script>
    @endif
</body>
</html>
