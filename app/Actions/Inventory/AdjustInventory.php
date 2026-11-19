<?php

namespace App\Actions\Inventory;

use App\Enums\InventoryMovementType;
use App\Models\InventoryMovement;
use App\Models\Product;
use App\Models\Stock;
use App\Models\User;
use App\Support\Decimal;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Ajuste manual de inventario.
 *  - mode "count": conteo físico, deja la existencia exactamente en la cantidad contada.
 *  - mode "in" / "out": entrada o salida (merma, caducado, regalo, etc.).
 */
class AdjustInventory
{
    public const MODE_COUNT = 'count';

    public const MODE_IN = 'in';

    public const MODE_OUT = 'out';

    public function __construct(private RegisterInventoryMovement $inventory) {}

    public function handle(Product $product, int $branchId, User $user, string $mode, string $quantity, string $reason): ?InventoryMovement
    {
        if (! $product->tracks_inventory) {
            throw ValidationException::withMessages(['product' => 'Este producto no controla inventario.']);
        }

        $quantity = Decimal::round($quantity, 3);

        if (Decimal::lt($quantity, '0') || ($mode !== self::MODE_COUNT && ! Decimal::gt($quantity, '0'))) {
            throw ValidationException::withMessages(['quantity' => 'Cantidad inválida.']);
        }

        return DB::transaction(function () use ($product, $branchId, $user, $mode, $quantity, $reason) {
            $delta = match ($mode) {
                self::MODE_IN => $quantity,
                self::MODE_OUT => '-'.$quantity,
                self::MODE_COUNT => bcsub(
                    $quantity,
                    (string) (Stock::query()
                        ->where('product_id', $product->id)
                        ->where('branch_id', $branchId)
                        ->lockForUpdate()
                        ->value('quantity') ?? '0'),
                    3,
                ),
                default => throw ValidationException::withMessages(['mode' => 'Tipo de ajuste inválido.']),
            };

            if (Decimal::isZero($delta)) {
                return null; // el conteo coincide, no hay nada que ajustar
            }

            $prefix = match ($mode) {
                self::MODE_COUNT => 'Conteo físico',
                self::MODE_IN => 'Entrada',
                self::MODE_OUT => 'Salida',
            };

            return $this->inventory->handle(
                product: $product,
                branchId: $branchId,
                type: InventoryMovementType::Adjustment,
                quantity: $delta,
                user: $user,
                notes: "{$prefix}: {$reason}",
            );
        });
    }
}
