<?php

namespace App\Support\Cfdi;

use App\Support\Decimal;
use DOMDocument;
use DOMElement;
use DOMXPath;
use Illuminate\Validation\ValidationException;

/**
 * Lee una factura electrónica (CFDI 3.3 o 4.0) del SAT a partir de su XML.
 *
 * Solo extrae lo necesario para registrar una compra: proveedor (emisor), folio, UUID
 * y los conceptos con su cantidad, unidad y costo. No valida el sello ni el timbre.
 */
final class CfdiInvoice
{
    /**
     * @param  list<array{sku: string|null, sat_code: string|null, description: string, quantity: string, unit_code: string|null, unit_name: string|null, unit_value: string, amount: string, discount: string, tax_rate: string, unit_cost: string}>  $concepts
     */
    private function __construct(
        public readonly string $type,
        public readonly ?string $uuid,
        public readonly ?string $series,
        public readonly ?string $folio,
        public readonly ?string $date,
        public readonly string $currency,
        public readonly string $issuerRfc,
        public readonly string $issuerName,
        public readonly ?string $receiverRfc,
        public readonly string $total,
        public readonly array $concepts,
    ) {}

    public static function parse(string $xml): self
    {
        $dom = new DOMDocument;
        $previous = libxml_use_internal_errors(true);
        // LIBXML_NONET: nunca descargar nada de la red al leer el archivo.
        $loaded = $xml !== '' && $dom->loadXML($xml, LIBXML_NONET | LIBXML_NOBLANKS);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        $root = $loaded ? $dom->documentElement : null;

        if (! $root || $root->localName !== 'Comprobante' || ! str_starts_with((string) $root->namespaceURI, 'http://www.sat.gob.mx/cfd/')) {
            throw ValidationException::withMessages(['file' => 'El archivo no es una factura electrónica (XML de CFDI) válida.']);
        }

        $xpath = new DOMXPath($dom);
        $xpath->registerNamespace('c', $root->namespaceURI);
        $xpath->registerNamespace('tfd', 'http://www.sat.gob.mx/TimbreFiscalDigital');

        $issuer = self::first($xpath, '/c:Comprobante/c:Emisor');
        $receiver = self::first($xpath, '/c:Comprobante/c:Receptor');
        $stamp = self::first($xpath, '//tfd:TimbreFiscalDigital');

        if (! $issuer) {
            throw ValidationException::withMessages(['file' => 'La factura no trae los datos del emisor.']);
        }

        $concepts = [];
        foreach ($xpath->query('/c:Comprobante/c:Conceptos/c:Concepto') as $node) {
            /** @var DOMElement $node */
            $quantity = Decimal::round(self::attr($node, 'Cantidad') ?? '0', 3);
            $amount = Decimal::round(self::attr($node, 'Importe') ?? '0');
            $discount = Decimal::round(self::attr($node, 'Descuento') ?? '0');

            // IVA trasladado del concepto (impuesto 002). Exento o sin IVA = 0.
            $taxRate = '0';
            foreach ($xpath->query('c:Impuestos/c:Traslados/c:Traslado', $node) as $tax) {
                /** @var DOMElement $tax */
                if (self::attr($tax, 'Impuesto') === '002' && self::attr($tax, 'TipoFactor') !== 'Exento') {
                    $taxRate = bcadd(self::attr($tax, 'TasaOCuota') ?? '0', '0', 4);
                }
            }

            // Costo unitario con IVA: así se manejan precio y costo en el sistema.
            $net = bcsub($amount, $discount, 6);
            $unitCost = bccomp($quantity, '0', 3) === 1
                ? Decimal::round(bcmul(bcdiv($net, $quantity, 8), bcadd('1', $taxRate, 6), 8))
                : '0.00';

            $sku = trim((string) self::attr($node, 'NoIdentificacion'));

            $concepts[] = [
                'sku' => $sku !== '' ? mb_substr($sku, 0, 64) : null,
                'sat_code' => self::attr($node, 'ClaveProdServ'),
                'description' => trim((string) self::attr($node, 'Descripcion')),
                'quantity' => $quantity,
                'unit_code' => self::attr($node, 'ClaveUnidad'),
                'unit_name' => self::attr($node, 'Unidad'),
                'unit_value' => (string) (self::attr($node, 'ValorUnitario') ?? '0'),
                'amount' => $amount,
                'discount' => $discount,
                'tax_rate' => rtrim(rtrim($taxRate, '0'), '.') ?: '0',
                'unit_cost' => $unitCost,
            ];
        }

        if ($concepts === []) {
            throw ValidationException::withMessages(['file' => 'La factura no trae conceptos (productos).']);
        }

        return new self(
            type: (string) self::attr($root, 'TipoDeComprobante'),
            uuid: $stamp ? strtoupper((string) self::attr($stamp, 'UUID')) : null,
            series: self::attr($root, 'Serie'),
            folio: self::attr($root, 'Folio'),
            date: self::attr($root, 'Fecha'),
            currency: (string) (self::attr($root, 'Moneda') ?? 'MXN'),
            issuerRfc: strtoupper((string) self::attr($issuer, 'Rfc')),
            issuerName: (string) (self::attr($issuer, 'Nombre') ?? self::attr($issuer, 'Rfc')),
            receiverRfc: $receiver ? strtoupper((string) self::attr($receiver, 'Rfc')) : null,
            total: Decimal::round(self::attr($root, 'Total') ?? '0'),
            concepts: $concepts,
        );
    }

    /** "FS 028040" a partir de serie y folio. */
    public function invoiceNumber(): ?string
    {
        $number = trim(($this->series ?? '').' '.($this->folio ?? ''));

        return $number !== '' ? $number : $this->uuid;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return get_object_vars($this);
    }

    private static function first(DOMXPath $xpath, string $query): ?DOMElement
    {
        $node = $xpath->query($query)->item(0);

        return $node instanceof DOMElement ? $node : null;
    }

    private static function attr(DOMElement $node, string $name): ?string
    {
        return $node->hasAttribute($name) ? $node->getAttribute($name) : null;
    }
}
