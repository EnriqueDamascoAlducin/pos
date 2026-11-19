@php
    $money = fn ($v) => '$' . number_format((float) $v, 2);
@endphp
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <title>Recibo de abono {{ $payment->id }}</title>
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
        .sign { margin-top: 28px; border-top: 1px solid #000; text-align: center; padding-top: 2px; }
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
        @if (!empty($settings['business_address'])) <div>{{ $settings['business_address'] }}</div> @endif
        @if (!empty($settings['business_phone'])) <div>Tel. {{ $settings['business_phone'] }}</div> @endif
    </div>
    <hr>
    <div class="center bold big">RECIBO DE ABONO</div>
    <hr>
    <table>
        <tr><td>Recibo:</td><td class="right bold">{{ $payment->id }}</td></tr>
        <tr><td>Fecha:</td><td class="right">{{ $payment->created_at->format('d/m/Y H:i') }}</td></tr>
        <tr><td>Recibió:</td><td class="right">{{ $payment->user->name }}</td></tr>
        <tr><td>Cliente:</td><td class="right">{{ $payment->customer->name }}</td></tr>
    </table>
    <hr>
    <table>
        <tr class="bold big"><td>Abono</td><td class="right">{{ $money($payment->amount) }}</td></tr>
        <tr><td>Forma de pago</td><td class="right">{{ $payment->method->label() }}</td></tr>
        @if ($payment->reference) <tr><td>Referencia</td><td class="right">{{ $payment->reference }}</td></tr> @endif
        <tr class="bold"><td>Saldo actual</td><td class="right">{{ $money($payment->customer->balance) }}</td></tr>
    </table>
    <div class="sign">Firma de quien recibe</div>
    <div class="center" style="font-size:10px;margin-top:6px">Este recibo no es un comprobante fiscal.</div>

    <div class="actions">
        <button onclick="window.print()">Imprimir</button>
        <button onclick="window.close()">Cerrar</button>
    </div>

    @if ($autoprint)
        <script>window.addEventListener('load', () => setTimeout(() => window.print(), 150));</script>
    @endif
</body>
</html>
