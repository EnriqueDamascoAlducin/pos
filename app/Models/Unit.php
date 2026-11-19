<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['name', 'abbreviation', 'allows_decimals', 'active'])]
class Unit extends Model
{
    protected $attributes = [
        'allows_decimals' => false,
        'active' => true,
    ];

    protected function casts(): array
    {
        return [
            'allows_decimals' => 'boolean',
            'active' => 'boolean',
        ];
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

    public function scopeActive(Builder $query): void
    {
        $query->where('active', true);
    }
}
