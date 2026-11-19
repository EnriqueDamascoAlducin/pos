<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

#[Fillable([
    'category_id', 'unit_id', 'sku', 'barcode', 'name', 'description',
    'cost', 'price', 'wholesale_price', 'wholesale_min_quantity',
    'tax_rate', 'price_includes_tax', 'min_stock', 'min_sale_quantity', 'sale_step',
    'tracks_inventory', 'sells_by_weight', 'active',
])]
class Product extends Model
{
    use SoftDeletes;

    /**
     * Mismos valores por defecto que la migración, para que un modelo recién creado
     * se comporte igual que uno leído de la base de datos.
     */
    protected $attributes = [
        'cost' => '0',
        'tax_rate' => '0.16',
        'price_includes_tax' => true,
        'min_stock' => '0',
        'min_sale_quantity' => '1',
        'sale_step' => '1',
        'tracks_inventory' => true,
        'sells_by_weight' => false,
        'active' => true,
    ];

    protected function casts(): array
    {
        return [
            'cost' => 'decimal:2',
            'price' => 'decimal:2',
            'wholesale_price' => 'decimal:2',
            'wholesale_min_quantity' => 'decimal:3',
            'tax_rate' => 'decimal:4',
            'min_stock' => 'decimal:3',
            'min_sale_quantity' => 'decimal:3',
            'sale_step' => 'decimal:3',
            'price_includes_tax' => 'boolean',
            'tracks_inventory' => 'boolean',
            'sells_by_weight' => 'boolean',
            'active' => 'boolean',
        ];
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class);
    }

    public function stocks(): HasMany
    {
        return $this->hasMany(Stock::class);
    }

    public function movements(): HasMany
    {
        return $this->hasMany(InventoryMovement::class);
    }

    /**
     * ¿Se puede vender en fracciones? (unidad con decimales, como kg o litro, o producto a granel).
     */
    public function allowsDecimals(): bool
    {
        return $this->sells_by_weight || (bool) $this->unit?->allows_decimals;
    }

    /**
     * Revisa que la cantidad respete la cantidad mínima y el múltiplo de venta.
     * Regresa el mensaje de error, o null si la cantidad es válida.
     */
    public function saleQuantityError(string $quantity): ?string
    {
        $min = (string) $this->min_sale_quantity;
        $step = (string) $this->sale_step;
        $unit = $this->unit?->abbreviation ?? '';

        if (! $this->allowsDecimals() && bccomp(bcmod($quantity, '1', 3), '0', 3) !== 0) {
            return "\"{$this->name}\" se vende por pieza completa; no acepta fracciones.";
        }

        if (bccomp($quantity, $min, 3) < 0) {
            return "La cantidad mínima de \"{$this->name}\" es ".self::trimQty($min)." {$unit}.";
        }

        if (bccomp($step, '0', 3) === 1 && bccomp(bcmod($quantity, $step, 3), '0', 3) !== 0) {
            return bccomp($step, '1', 3) === 0
                ? "\"{$this->name}\" se vende por pieza completa; no acepta fracciones."
                : "\"{$this->name}\" se vende en múltiplos de ".self::trimQty($step)." {$unit}.";
        }

        return null;
    }

    private static function trimQty(string $value): string
    {
        return rtrim(rtrim($value, '0'), '.');
    }

    /**
     * Precio unitario según la cantidad (aplica mayoreo si corresponde).
     */
    public function priceFor(string|float $quantity): string
    {
        if ($this->wholesale_price !== null
            && $this->wholesale_min_quantity !== null
            && bccomp((string) $quantity, (string) $this->wholesale_min_quantity, 3) >= 0) {
            return (string) $this->wholesale_price;
        }

        return (string) $this->price;
    }

    public function scopeActive(Builder $query): void
    {
        $query->where('active', true);
    }

    public function scopeSearch(Builder $query, ?string $term): void
    {
        if (! $term) {
            return;
        }

        $query->where(function (Builder $q) use ($term) {
            $q->where('barcode', $term)
                ->orWhere('sku', $term)
                ->orWhere('name', 'like', "%{$term}%");
        });
    }
}
