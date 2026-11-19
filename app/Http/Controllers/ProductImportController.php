<?php

namespace App\Http\Controllers;

use App\Actions\Products\ImportProducts;
use App\Models\Unit;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Importación de productos desde CSV en tres pasos:
 * subir el archivo → vista previa con errores por fila → confirmar.
 *
 * El archivo se guarda temporalmente (privado, fuera de public) entre la vista previa
 * y la confirmación, y se borra al importar o cancelar.
 */
class ProductImportController extends Controller
{
    private const DIR = 'imports';

    /** Filas que se mandan a la pantalla (todas las de error + estas válidas). */
    private const PREVIEW_VALID_ROWS = 300;

    public function create(): Response
    {
        return Inertia::render('products/import', [
            'columns' => self::columnGuide(),
            'units' => Unit::active()->orderBy('name')->get(['name', 'abbreviation', 'allows_decimals']),
            'maxRows' => ImportProducts::MAX_ROWS,
            'preview' => null,
        ]);
    }

    public function template(): StreamedResponse
    {
        return response()->streamDownload(function () {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF"); // BOM: Excel respeta acentos
            foreach (ImportProducts::template() as $row) {
                fputcsv($out, $row);
            }
            fclose($out);
        }, 'plantilla-productos.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /**
     * Recibe el archivo, lo guarda temporalmente y manda a la vista previa.
     */
    public function upload(Request $request, ImportProducts $importer): RedirectResponse
    {
        $data = $request->validate([
            'file' => ['required', 'file', 'max:10240', 'mimes:csv,txt'],
            'adjust_existing' => ['boolean'],
        ], [
            'file.mimes' => 'El archivo debe ser .csv. En Excel: Archivo → Guardar como → CSV UTF-8.',
        ], ['file' => 'archivo']);

        $token = $request->user()->id.'-'.Str::uuid();
        Storage::disk('local')->putFileAs(self::DIR, $request->file('file'), "{$token}.csv");

        // Revisa encabezados de una vez; si faltan columnas no tiene caso la vista previa.
        try {
            $importer->parse($this->path($token));
        } catch (ValidationException $e) {
            Storage::disk('local')->delete(self::DIR."/{$token}.csv");

            throw $e;
        }

        return to_route('products.import.preview', [
            'token' => $token,
            'adjust_existing' => $request->boolean('adjust_existing') ? 1 : 0,
        ]);
    }

    public function preview(Request $request, string $token, ImportProducts $importer): Response|RedirectResponse
    {
        if (! $this->owns($request, $token)) {
            return to_route('products.import');
        }

        $adjust = $request->boolean('adjust_existing');
        $parsed = $importer->parse($this->path($token), $adjust);

        $errors = array_values(array_filter($parsed['rows'], fn ($r) => $r['action'] === 'error'));
        $valid = array_values(array_filter($parsed['rows'], fn ($r) => $r['action'] !== 'error'));

        return Inertia::render('products/import', [
            'columns' => self::columnGuide(),
            'units' => [],
            'maxRows' => ImportProducts::MAX_ROWS,
            'preview' => [
                'token' => $token,
                'adjust_existing' => $adjust,
                'stats' => $parsed['stats'],
                'columns' => $parsed['columns'],
                'ignored_columns' => $parsed['ignored_columns'],
                'rows' => array_map(
                    fn ($r) => array_diff_key($r, ['data' => true]),
                    [...$errors, ...array_slice($valid, 0, self::PREVIEW_VALID_ROWS)],
                ),
                'hidden_valid_rows' => max(count($valid) - self::PREVIEW_VALID_ROWS, 0),
            ],
        ]);
    }

    public function store(Request $request, string $token, ImportProducts $importer): RedirectResponse
    {
        abort_unless($this->owns($request, $token), 404);

        $user = $request->user();
        $result = $importer->import($this->path($token), $user, $user->currentBranchId(), $request->boolean('adjust_existing'));

        Storage::disk('local')->delete(self::DIR."/{$token}.csv");

        $message = "Importación lista: {$result['created']} productos nuevos y {$result['updated']} actualizados.";
        if ($result['skipped'] > 0) {
            $message .= " Se omitieron {$result['skipped']} filas con error.";
        }

        Inertia::flash('toast', ['type' => 'success', 'message' => $message]);

        return to_route('products.index');
    }

    public function destroy(Request $request, string $token): RedirectResponse
    {
        if ($this->owns($request, $token)) {
            Storage::disk('local')->delete(self::DIR."/{$token}.csv");
        }

        return to_route('products.import');
    }

    /**
     * El token solo vale para el usuario que subió el archivo y si el archivo sigue ahí.
     */
    private function owns(Request $request, string $token): bool
    {
        return preg_match('/^\d+-[0-9a-f-]{36}$/', $token) === 1
            && str_starts_with($token, $request->user()->id.'-')
            && Storage::disk('local')->exists(self::DIR."/{$token}.csv");
    }

    private function path(string $token): string
    {
        return Storage::disk('local')->path(self::DIR."/{$token}.csv");
    }

    /**
     * @return list<array{key: string, required: bool, description: string, example: string}>
     */
    private static function columnGuide(): array
    {
        $info = [
            'codigo_barras' => ['Código de barras. Junto con el SKU sirve para saber si el producto ya existe.', '7501234567890'],
            'sku' => ['Clave interna o número de parte. Necesitas sku o codigo_barras.', 'F02030341'],
            'nombre' => ['Nombre o descripción del producto.', 'Cadena de tracción 428H'],
            'categoria' => ['Si no existe se crea.', 'Transmisión'],
            'unidad' => ['Abreviatura o nombre de la unidad. Vacío = pza.', 'pza'],
            'precio_compra' => ['Lo que te cuesta cada unidad.', '90.00'],
            'precio_venta' => ['Precio al público.', '124.10'],
            'precio_mayoreo' => ['Opcional; requiere mayoreo_desde.', '115.00'],
            'mayoreo_desde' => ['Cantidad a partir de la que aplica el mayoreo.', '10'],
            'iva' => ['16, 8 o 0. Vacío = el IVA por defecto del negocio.', '16'],
            'precio_incluye_iva' => ['si / no. Vacío = si.', 'si'],
            'existencia' => ['Existencia inicial; queda en el kardex.', '40'],
            'existencia_minima' => ['Para la alerta de resurtido.', '5'],
            'granel' => ['si / no. Se vende en fracciones (báscula).', 'no'],
            'cantidad_minima' => ['Lo menos que se vende. Vacío = 1 (0.1 a granel).', '1'],
            'multiplo' => ['De cuánto en cuánto se vende. Vacío = 1 (0.001 a granel).', '1'],
        ];

        return array_map(fn ($key) => [
            'key' => $key,
            'required' => in_array($key, ImportProducts::REQUIRED, true),
            'description' => $info[$key][0],
            'example' => $info[$key][1],
        ], array_keys(ImportProducts::COLUMNS));
    }
}
