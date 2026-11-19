<?php

namespace App\Http\Requests;

use App\Models\Product;
use App\Models\Unit;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class ProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('products.manage');
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'tracks_inventory' => $this->boolean('tracks_inventory'),
            'sells_by_weight' => $this->boolean('sells_by_weight'),
            'active' => $this->boolean('active'),
            'price_includes_tax' => $this->boolean('price_includes_tax'),
        ]);

        // Valores por defecto: piezas completas desde 1; a granel desde 0.1 en cualquier fracción.
        $granel = $this->boolean('sells_by_weight');

        if ($this->input('min_sale_quantity') === null || $this->input('min_sale_quantity') === '') {
            $this->merge(['min_sale_quantity' => $granel ? '0.1' : '1']);
        }

        if ($this->input('sale_step') === null || $this->input('sale_step') === '') {
            $this->merge(['sale_step' => $granel ? '0.001' : '1']);
        }
    }

    /**
     * Reglas que dependen de varios campos a la vez.
     *
     * @return array<int, \Closure>
     */
    public function after(): array
    {
        return [
            function (Validator $validator) {
                if ($validator->errors()->hasAny(['min_sale_quantity', 'sale_step', 'unit_id'])) {
                    return;
                }

                $min = number_format((float) $this->input('min_sale_quantity'), 3, '.', '');
                $step = number_format((float) $this->input('sale_step'), 3, '.', '');
                $unit = Unit::find($this->input('unit_id'));
                $decimals = $this->boolean('sells_by_weight') || (bool) $unit?->allows_decimals;

                if (! $decimals) {
                    $unitName = mb_strtolower($unit?->name ?? 'pieza');

                    if (bccomp(bcmod($min, '1', 3), '0', 3) !== 0) {
                        $validator->errors()->add('min_sale_quantity', "Se vende por {$unitName}: la cantidad mínima debe ser un número entero.");
                    }

                    if (bccomp(bcmod($step, '1', 3), '0', 3) !== 0) {
                        $validator->errors()->add('sale_step', "Se vende por {$unitName}: el múltiplo debe ser un número entero.");
                    }
                }

                if (! $validator->errors()->hasAny(['min_sale_quantity', 'sale_step'])
                    && bccomp(bcmod($min, $step, 3), '0', 3) !== 0) {
                    $validator->errors()->add('min_sale_quantity', 'La cantidad mínima debe ser múltiplo del múltiplo de venta (por ejemplo, mínimo 6 con múltiplos de 6).');
                }
            },
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var Product|null $product */
        $product = $this->route('product');

        return [
            'name' => ['required', 'string', 'max:255'],
            'barcode' => ['nullable', 'string', 'max:64', Rule::unique('products')->ignore($product)],
            'sku' => ['nullable', 'string', 'max:64', Rule::unique('products')->ignore($product)],
            'category_id' => ['nullable', 'exists:categories,id'],
            // Una unidad activa, o la que el producto ya tenía.
            'unit_id' => ['required', Rule::exists('units', 'id')->where(
                fn ($q) => $q->where('active', true)->when($product?->unit_id, fn ($q, $id) => $q->orWhere('id', $id)),
            )],
            'description' => ['nullable', 'string', 'max:2000'],

            'cost' => ['required', 'numeric', 'min:0', 'max:9999999999'],
            'price' => ['required', 'numeric', 'min:0', 'max:9999999999'],
            'wholesale_price' => ['nullable', 'numeric', 'min:0', 'required_with:wholesale_min_quantity'],
            'wholesale_min_quantity' => ['nullable', 'numeric', 'gt:0', 'required_with:wholesale_price'],

            'tax_rate' => ['required', Rule::in(['0', '0.08', '0.16'])],
            'price_includes_tax' => ['boolean'],
            'min_stock' => ['nullable', 'numeric', 'min:0'],
            'min_sale_quantity' => ['required', 'numeric', 'gt:0', 'max:999999'],
            'sale_step' => ['required', 'numeric', 'gt:0', 'max:999999'],
            'tracks_inventory' => ['boolean'],
            'sells_by_weight' => ['boolean'],
            'active' => ['boolean'],

            // Solo al dar de alta.
            'initial_stock' => [Rule::excludeIf($product !== null), 'nullable', 'numeric', 'min:0'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return [
            'name' => 'nombre',
            'barcode' => 'código de barras',
            'cost' => 'precio de compra',
            'price' => 'precio de venta',
            'wholesale_price' => 'precio de mayoreo',
            'wholesale_min_quantity' => 'cantidad para mayoreo',
            'unit_id' => 'unidad',
            'category_id' => 'categoría',
            'tax_rate' => 'IVA',
            'min_stock' => 'existencia mínima',
            'min_sale_quantity' => 'cantidad mínima de venta',
            'sale_step' => 'múltiplo de venta',
            'initial_stock' => 'existencia inicial',
        ];
    }
}
