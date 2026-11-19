<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Entradas y salidas de efectivo que no son ventas (retiros, pagos a proveedores, etc.).
 */
#[Fillable(['cash_session_id', 'user_id', 'type', 'amount', 'reason'])]
class CashMovement extends Model
{
    public const TYPE_IN = 'in';

    public const TYPE_OUT = 'out';

    protected function casts(): array
    {
        return ['amount' => 'decimal:2'];
    }

    public function cashSession(): BelongsTo
    {
        return $this->belongsTo(CashSession::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
