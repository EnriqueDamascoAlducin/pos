<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'sale_id', 'product_id', 'description', 'quantity', 'price', 'list_price', 'cost',
    'discount', 'tax_rate', 'tax', 'total',
])]
class SaleItem extends Model
{
    protected function casts(): array
    {
        return [
            'quantity' => 'decimal:3',
            'price' => 'decimal:2',
            'list_price' => 'decimal:2',
            'cost' => 'decimal:2',
            'discount' => 'decimal:2',
            'tax_rate' => 'decimal:4',
            'tax' => 'decimal:2',
            'total' => 'decimal:2',
        ];
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class)->withTrashed();
    }
}
