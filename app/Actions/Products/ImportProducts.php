<?php

namespace App\Actions\Products;

use App\Actions\Inventory\AdjustInventory;
use App\Actions\Inventory\RegisterInventoryMovement;
use App\Enums\InventoryMovementType;
use App\Models\Category;
use App\Models\Product;
use App\Models\Setting;
use App\Models\Unit;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Carga masiva de productos desde un CSV (por ejemplo, exportado de Excel o de SICAR).
 *
 * parse()  lee y valida el archivo sin guardar nada (para la vista previa).
 * import() vuelve a validar y guarda las filas válidas en una sola transacción.
 *
 * Un producto ya existe si coincide su SKU o su código de barras: en ese caso se actualiza.
 */
class ImportProducts
{
    public const MAX_ROWS = 5000;

    /**
     * Columnas reconocidas y los encabezados que se aceptan para cada una.
     * Los encabezados se comparan sin acentos, sin mayúsculas y con "_" en lugar de espacios.
     */
    public const COLUMNS = [
        'codigo_barras' => ['codigo_barras', 'codigo_de_barras', 'cod_barras', 'barcode', 'ean', 'upc'],
        'sku' => ['sku', 'clave', 'clave_interna', 'codigo', 'numero_de_parte', 'no_parte', 'no_de_parte', 'num_parte'],
        'nombre' => ['nombre', 'descripcion', 'producto', 'articulo'],
        'categoria' => ['categoria', 'departamento', 'linea', 'familia'],
        'unidad' => ['unidad', 'unidad_de_medida', 'um'],
        'precio_compra' => ['precio_compra', 'precio_de_compra', 'costo', 'costo_unitario'],
        'precio_venta' => ['precio_venta', 'precio_de_venta', 'precio', 'precio_publico', 'precio_1'],
        'precio_mayoreo' => ['precio_mayoreo', 'precio_de_mayoreo', 'mayoreo', 'precio_2'],
        'mayoreo_desde' => ['mayoreo_desde', 'cantidad_mayoreo', 'mayoreo_a_partir_de'],
        'iva' => ['iva', 'tasa_iva', 'impuesto'],
        'precio_incluye_iva' => ['precio_incluye_iva', 'incluye_iva', 'con_iva'],
        'existencia' => ['existencia', 'existencias', 'stock', 'inventario', 'cantidad'],
        'existencia_minima' => ['existencia_minima', 'minimo', 'stock_minimo', 'inventario_minimo'],
        'granel' => ['granel', 'a_granel', 'se_vende_a_granel'],
        'cantidad_minima' => ['cantidad_minima', 'cantidad_minima_de_venta', 'venta_minima'],
        'multiplo' => ['multiplo', 'multiplo_de_venta', 'se_vende_en_multiplos_de'],
    ];

    public const REQUIRED = ['nombre', 'precio_compra', 'precio_venta'];

    public function __construct(
        private RegisterInventoryMovement $inventory,
        private AdjustInventory $adjust,
    ) {}

    /**
     * Lee y valida el archivo. No guarda nada.
     *
     * @return array{rows: list<array<string, mixed>>, stats: array<string, int|string>, columns: list<string>, ignored_columns: list<string>}
     */
    public function parse(string $path, bool $adjustExisting = false): array
    {
        [$header, $records] = $this->readCsv($path);

        $map = $this->mapHeader($header);
        $missing = array_values(array_diff(self::REQUIRED, array_keys($map)));

        if ($missing !== []) {
            throw ValidationException::withMessages([
                'file' => 'Faltan columnas obligatorias: '.implode(', ', $missing).'. Descarga la plantilla para ver el formato.',
            ]);
        }

        if (! isset($map['sku']) && ! isset($map['codigo_barras'])) {
            throw ValidationException::withMessages([
                'file' => 'El archivo necesita al menos la columna sku o codigo_barras para identificar los productos.',
            ]);
        }

        if (count($records) > self::MAX_ROWS) {
            throw ValidationException::withMessages([
                'file' => 'El archivo tiene '.count($records).' filas; el máximo por archivo es '.self::MAX_ROWS.'. Divídelo en partes.',
            ]);
        }

        $lookup = $this->lookups($records, $map);
        $seen = ['sku' => [], 'barcode' => []];
        $rows = [];

        foreach ($records as [$line, $record]) {
            $value = fn (string $key) => isset($map[$key]) ? trim((string) ($record[$map[$key]] ?? '')) : '';
            $rows[] = $this->validateRow($line, $value, $lookup, $seen, $adjustExisting);
        }

        $valid = array_filter($rows, fn ($r) => $r['action'] !== 'error');

        return [
            'rows' => $rows,
            'stats' => [
                'total' => count($rows),
                'create' => count(array_filter($rows, fn ($r) => $r['action'] === 'create')),
                'update' => count(array_filter($rows, fn ($r) => $r['action'] === 'update')),
                'errors' => count($rows) - count($valid),
                'new_categories' => count(array_unique(array_filter(array_map(
                    fn ($r) => $r['new_category'] ?? null,
                    $valid,
                )))),
                'stock_units' => (string) array_sum(array_map(
                    fn ($r) => $r['stock_applies'] ? (float) $r['stock'] : 0,
                    $valid,
                )),
            ],
            'columns' => array_keys($map),
            'ignored_columns' => array_values(array_filter(
                $header,
                fn ($h, $i) => trim((string) $h) !== '' && ! in_array($i, $map, true),
                ARRAY_FILTER_USE_BOTH,
            )),
        ];
    }

    /**
     * Valida de nuevo e importa las filas válidas. Las filas con error se omiten.
     *
     * @return array{created: int, updated: int, skipped: int, stock_movements: int}
     */
    public function import(string $path, User $user, int $branchId, bool $adjustExisting = false): array
    {
        $parsed = $this->parse($path, $adjustExisting);
        $result = ['created' => 0, 'updated' => 0, 'skipped' => $parsed['stats']['errors'], 'stock_movements' => 0];

        DB::transaction(function () use ($parsed, $user, $branchId, $adjustExisting, &$result) {
            $categories = Category::query()->get()->keyBy(fn ($c) => self::norm($c->name));

            foreach ($parsed['rows'] as $row) {
                if ($row['action'] === 'error') {
                    continue;
                }

                $data = $row['data'];

                if ($row['category'] !== null) {
                    $key = self::norm($row['category']);
                    $categories[$key] ??= Category::create(['name' => $row['category']]);
                    $data['category_id'] = $categories[$key]->id;
                }

                if ($row['action'] === 'create') {
                    $product = Product::create($data);
                    $result['created']++;

                    if ($row['stock'] !== null && bccomp($row['stock'], '0', 3) === 1) {
                        $this->inventory->handle(
                            product: $product,
                            branchId: $branchId,
                            type: InventoryMovementType::Adjustment,
                            quantity: $row['stock'],
                            user: $user,
                            reference: $product,
                            notes: 'Importación inicial (CSV)',
                        );
                        $result['stock_movements']++;
                    }

                    continue;
                }

                $product = Product::withTrashed()->findOrFail($row['product_id']);
                if ($product->trashed()) {
                    $product->restore();
                }
                $product->update($data);
                $result['updated']++;

                if ($adjustExisting && $row['stock'] !== null && $product->tracks_inventory) {
                    $movement = $this->adjust->handle(
                        $product->fresh('unit'),
                        $branchId,
                        $user,
                        AdjustInventory::MODE_COUNT,
                        $row['stock'],
                        'Importación de productos (CSV)',
                    );
                    if ($movement) {
                        $result['stock_movements']++;
                    }
                }
            }
        });

        return $result;
    }

    /**
     * Plantilla con los encabezados y dos ejemplos.
     *
     * @return list<list<string>>
     */
    public static function template(): array
    {
        return [
            array_keys(self::COLUMNS),
            ['7501234567890', 'F02030341', 'Cadena de tracción 428H x 136L', 'Transmisión', 'pza', '90.00', '124.10', '115.00', '10', '16', 'si', '40', '5', 'no', '1', '1'],
            ['', 'ACE-20W50-GRANEL', 'Aceite 20W50 a granel', 'Lubricantes', 'l', '55.00', '85.00', '', '', '16', 'si', '120.5', '20', 'si', '0.25', '0.25'],
        ];
    }

    /* ---------------------------------------------------------------- */

    /**
     * @param  callable(string): string  $value
     * @param  array<string, mixed>  $lookup
     * @param  array{sku: array<string, int>, barcode: array<string, int>}  $seen
     * @return array<string, mixed>
     */
    private function validateRow(int $line, callable $value, array $lookup, array &$seen, bool $adjustExisting): array
    {
        $errors = [];
        $name = $value('nombre');
        $sku = $value('sku');
        $barcode = $value('codigo_barras');

        if ($name === '') {
            $errors[] = 'Falta el nombre.';
        } elseif (mb_strlen($name) > 255) {
            $errors[] = 'El nombre tiene más de 255 caracteres.';
        }

        if ($sku === '' && $barcode === '') {
            $errors[] = 'Falta el SKU o el código de barras.';
        }

        foreach (['sku' => $sku, 'código de barras' => $barcode] as $label => $code) {
            if (mb_strlen($code) > 64) {
                $errors[] = "El {$label} tiene más de 64 caracteres.";
            }
        }

        // Repetidos dentro del mismo archivo.
        foreach (['sku' => $sku, 'barcode' => $barcode] as $kind => $code) {
            if ($code === '') {
                continue;
            }
            $key = mb_strtolower($code);
            if (isset($seen[$kind][$key])) {
                $errors[] = ($kind === 'sku' ? 'SKU' : 'Código de barras')." repetido en la fila {$seen[$kind][$key]}.";
            } else {
                $seen[$kind][$key] = $line;
            }
        }

        // ¿Ya existe? Por SKU y/o código de barras; ambos deben apuntar al mismo producto.
        $bySku = $sku !== '' ? ($lookup['bySku'][mb_strtolower($sku)] ?? null) : null;
        $byBarcode = $barcode !== '' ? ($lookup['byBarcode'][mb_strtolower($barcode)] ?? null) : null;

        if ($bySku && $byBarcode && $bySku->id !== $byBarcode->id) {
            $errors[] = "El SKU es de \"{$bySku->name}\" pero el código de barras es de \"{$byBarcode->name}\".";
        }

        $existing = $bySku ?? $byBarcode;

        // Unidad
        $unitText = $value('unidad');
        $unit = $unitText === ''
            ? ($existing?->unit ?? $lookup['defaultUnit'])
            : ($lookup['units'][self::norm($unitText)] ?? $lookup['units'][rtrim(self::norm($unitText), 's')] ?? null);

        if (! $unit) {
            $errors[] = "No existe la unidad \"{$unitText}\". Usa una de: ".$lookup['unitList'].'.';
        } elseif (! $unit->active && $unitText !== '') {
            $errors[] = "La unidad \"{$unit->name}\" está desactivada; actívala en Configuración → Unidades.";
        }

        // Números
        $num = function (string $key, string $label, bool $required = false) use ($value, &$errors): ?string {
            $raw = $value($key);
            if ($raw === '') {
                if ($required) {
                    $errors[] = "Falta el {$label}.";
                }

                return null;
            }
            $n = self::number($raw);
            if ($n === null || bccomp($n, '0', 3) < 0) {
                $errors[] = "El {$label} \"{$raw}\" no es un número válido.";

                return null;
            }

            return $n;
        };

        $cost = $num('precio_compra', 'precio de compra', true);
        $price = $num('precio_venta', 'precio de venta', true);
        $wholesale = $num('precio_mayoreo', 'precio de mayoreo');
        $wholesaleFrom = $num('mayoreo_desde', 'mayoreo desde');
        $stock = $num('existencia', 'existencia');
        $minStock = $num('existencia_minima', 'existencia mínima');
        $minQty = $num('cantidad_minima', 'cantidad mínima');
        $step = $num('multiplo', 'múltiplo');

        if (($wholesale === null) !== ($wholesaleFrom === null) && ($value('precio_mayoreo') !== '' || $value('mayoreo_desde') !== '')) {
            $errors[] = 'Para el mayoreo se necesitan ambos: precio_mayoreo y mayoreo_desde.';
        }

        // IVA y banderas
        $tax = null;
        if ($value('iva') !== '') {
            $tax = self::taxRate($value('iva'));
            if ($tax === null) {
                $errors[] = "IVA \"{$value('iva')}\" no válido; usa 16, 8 o 0.";
            }
        }

        $flag = function (string $key, string $label) use ($value, &$errors): ?bool {
            if ($value($key) === '') {
                return null;
            }
            $b = self::boolean($value($key));
            if ($b === null) {
                $errors[] = "\"{$value($key)}\" no es válido en {$label}; usa si o no.";
            }

            return $b;
        };

        $includesTax = $flag('precio_incluye_iva', 'precio_incluye_iva');
        $granel = $flag('granel', 'granel') ?? ($existing?->sells_by_weight ?? false);

        // Reglas de venta (mismas que el alta manual).
        $decimals = $granel || (bool) $unit?->allows_decimals;
        $minQty ??= $existing ? (string) $existing->min_sale_quantity : ($granel ? '0.1' : '1');
        $step ??= $existing ? (string) $existing->sale_step : ($granel ? '0.001' : '1');

        if ($unit && ! $errors) {
            if (bccomp($step, '0', 3) !== 1 || bccomp($minQty, '0', 3) !== 1) {
                $errors[] = 'La cantidad mínima y el múltiplo deben ser mayores a cero.';
            } else {
                if (! $decimals && (bccomp(bcmod($minQty, '1', 3), '0', 3) !== 0 || bccomp(bcmod($step, '1', 3), '0', 3) !== 0)) {
                    $errors[] = "Se vende por {$unit->abbreviation}: la cantidad mínima y el múltiplo deben ser enteros.";
                } elseif (bccomp(bcmod($minQty, $step, 3), '0', 3) !== 0) {
                    $errors[] = 'La cantidad mínima debe ser múltiplo del múltiplo de venta.';
                }

                if ($stock !== null && ! $decimals && bccomp(bcmod($stock, '1', 3), '0', 3) !== 0) {
                    $errors[] = "La existencia {$stock} tiene decimales y el producto se vende por {$unit->abbreviation}.";
                }
            }
        }

        $categoryName = $value('categoria') !== '' ? Str::limit($value('categoria'), 100, '') : null;
        $base = [
            'line' => $line,
            'name' => $name,
            'code' => $sku !== '' ? $sku : $barcode,
            'cost' => $cost,
            'price' => $price,
            'stock' => $stock,
            'unit' => $unit?->abbreviation,
            'category' => $categoryName,
            'new_category' => $categoryName !== null && ! isset($lookup['categories'][self::norm($categoryName)]) ? $categoryName : null,
            'existing_name' => $existing?->name,
            'reactivates' => (bool) $existing?->trashed(),
            'stock_applies' => $stock !== null && (! $existing || $adjustExisting),
        ];

        if ($errors) {
            return $base + ['action' => 'error', 'errors' => $errors, 'data' => [], 'product_id' => null];
        }

        // En una actualización solo se cambian las columnas que vienen con valor.
        $data = array_filter([
            'name' => $name,
            'sku' => $sku !== '' ? $sku : null,
            'barcode' => $barcode !== '' ? $barcode : null,
            'unit_id' => $unit->id,
            'cost' => $cost,
            'price' => $price,
            'wholesale_price' => $wholesale,
            'wholesale_min_quantity' => $wholesaleFrom,
            'tax_rate' => $tax,
            'price_includes_tax' => $includesTax,
            'min_stock' => $minStock,
            'sells_by_weight' => $granel,
            'min_sale_quantity' => $minQty,
            'sale_step' => $step,
        ], fn ($v) => $v !== null);

        if (! $existing) {
            $data += [
                'tax_rate' => (string) (float) Setting::get('default_tax_rate', '0.16'),
                'tracks_inventory' => true,
                'active' => true,
            ];
        }

        return $base + [
            'action' => $existing ? 'update' : 'create',
            'errors' => [],
            'data' => $data,
            'product_id' => $existing?->id,
        ];
    }

    /**
     * Carga de una sola vez lo necesario para validar sin una consulta por fila.
     *
     * @param  list<array{0: int, 1: list<string>}>  $records
     * @param  array<string, int>  $map
     * @return array<string, mixed>
     */
    private function lookups(array $records, array $map): array
    {
        $codes = fn (string $key) => isset($map[$key])
            ? array_values(array_filter(array_map(fn ($r) => trim((string) ($r[1][$map[$key]] ?? '')), $records)))
            : [];

        $skus = $codes('sku');
        $barcodes = $codes('codigo_barras');

        /** @var Collection<int, Product> $products */
        $products = Product::withTrashed()
            ->with('unit')
            ->where(fn ($q) => $q
                ->when($skus, fn ($q) => $q->orWhereIn('sku', $skus))
                ->when($barcodes, fn ($q) => $q->orWhereIn('barcode', $barcodes)))
            ->when(! $skus && ! $barcodes, fn ($q) => $q->whereRaw('1 = 0'))
            ->get();

        $units = Unit::query()->orderBy('name')->get();
        $unitIndex = [];
        foreach ($units as $u) {
            $unitIndex[self::norm($u->abbreviation)] = $u;
            $unitIndex[self::norm($u->name)] ??= $u;
        }

        return [
            'bySku' => $products->filter(fn ($p) => $p->sku !== null)->keyBy(fn ($p) => mb_strtolower($p->sku))->all(),
            'byBarcode' => $products->filter(fn ($p) => $p->barcode !== null)->keyBy(fn ($p) => mb_strtolower($p->barcode))->all(),
            'units' => $unitIndex,
            'defaultUnit' => $units->firstWhere('abbreviation', 'pza') ?? $units->first(),
            'unitList' => $units->where('active', true)->pluck('abbreviation')->implode(', '),
            'categories' => Category::query()->pluck('name')->mapWithKeys(fn ($n) => [self::norm($n) => true])->all(),
        ];
    }

    /**
     * Lee el CSV tolerando lo que suele producir Excel: BOM, codificación Windows-1252
     * y separador ";" o ",".
     *
     * @return array{0: list<string>, 1: list<array{0: int, 1: list<string>}>}
     */
    private function readCsv(string $path): array
    {
        $content = (string) file_get_contents($path);
        $content = preg_replace('/^\xEF\xBB\xBF/', '', $content) ?? $content;

        if (! mb_check_encoding($content, 'UTF-8')) {
            $content = mb_convert_encoding($content, 'UTF-8', 'Windows-1252');
        }

        $firstLine = strtok($content, "\r\n") ?: '';
        $delimiter = collect([',', ';', "\t", '|'])
            ->sortByDesc(fn ($d) => substr_count($firstLine, $d))
            ->first();

        $handle = fopen('php://temp', 'r+');
        fwrite($handle, $content);
        rewind($handle);

        $header = null;
        $records = [];
        $line = 0;

        while (($row = fgetcsv($handle, null, $delimiter, '"', '')) !== false) {
            $line++;

            if ($row === [null] || count(array_filter($row, fn ($c) => trim((string) $c) !== '')) === 0) {
                continue; // fila vacía
            }

            if ($header === null) {
                $header = array_map(fn ($h) => trim((string) $h), $row);

                continue;
            }

            $records[] = [$line, $row];
        }

        fclose($handle);

        if ($header === null) {
            throw ValidationException::withMessages(['file' => 'El archivo está vacío.']);
        }

        return [$header, $records];
    }

    /**
     * @param  list<string>  $header
     * @return array<string, int> columna => índice
     */
    private function mapHeader(array $header): array
    {
        $aliases = [];
        foreach (self::COLUMNS as $key => $names) {
            foreach ($names as $alias) {
                $aliases[$alias] = $key;
            }
        }

        $map = [];
        foreach ($header as $i => $title) {
            $key = $aliases[self::norm($title)] ?? null;
            if ($key && ! isset($map[$key])) {
                $map[$key] = $i;
            }
        }

        return $map;
    }

    /** "Código de Barras" → "codigo_de_barras" */
    public static function norm(string $text): string
    {
        $text = Str::lower(Str::ascii(trim($text)));
        $text = preg_replace('/[^a-z0-9]+/', '_', $text) ?? $text;

        return trim($text, '_');
    }

    /**
     * "$1,234.50" → "1234.50"; "12,5" → "12.5". Regresa null si no es un número.
     */
    public static function number(string $raw): ?string
    {
        $v = str_replace(['$', ' ', "\u{00A0}"], '', trim($raw));

        if (str_contains($v, ',') && str_contains($v, '.')) {
            $v = str_replace(',', '', $v);
        } elseif (preg_match('/^-?\d{1,3}(,\d{3})+$/', $v)) {
            $v = str_replace(',', '', $v);
        } else {
            $v = str_replace(',', '.', $v);
        }

        if (! is_numeric($v)) {
            return null;
        }

        return number_format((float) $v, 3, '.', '');
    }

    /** "16", "16%", "0.16" → "0.16"; "8" → "0.08"; "0" o "exento" → "0" */
    public static function taxRate(string $raw): ?string
    {
        $v = self::norm($raw);

        if (in_array($v, ['exento', 'excento', 'no', 'sin_iva'], true)) {
            return '0';
        }

        $n = self::number(rtrim($raw, '% '));

        return match ($n === null ? null : (float) $n) {
            16.0, 0.16 => '0.16',
            8.0, 0.08 => '0.08',
            0.0 => '0',
            default => null,
        };
    }

    public static function boolean(string $raw): ?bool
    {
        return match (self::norm($raw)) {
            'si', 's', 'yes', 'y', '1', 'true', 'verdadero', 'x' => true,
            'no', 'n', '0', 'false', 'falso' => false,
            default => null,
        };
    }
}
