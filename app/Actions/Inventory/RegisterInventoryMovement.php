<?php

namespace App\Actions\Inventory;

use App\Enums\InventoryMovementType;
use App\Models\InventoryMovement;
use App\Models\Product;
use App\Models\Setting;
use App\Models\Stock;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use LogicException;

/**
 * Único punto por el que cambia la existencia de un producto.
 * Actualiza el saldo en `stocks` y deja el registro en el kardex (`inventory_movements`).
 *
 * Debe llamarse dentro de una transacción.
 */
class RegisterInventoryMovement
{
    /**
     * @param  string  $quantity  Positivo = entrada, negativo = salida.
     */
    public function handle(
        Product $product,
        int $branchId,
        InventoryMovementType $type,
        string $quantity,
        ?User $user = null,
        ?Model $reference = null,
        ?string $cost = null,
        ?string $notes = null,
    ): ?InventoryMovement {
        if (DB::transactionLevel() === 0) {
            throw new LogicException('RegisterInventoryMovement debe ejecutarse dentro de una transacción.');
        }

        if (! $product->tracks_inventory) {
            return null;
        }

        Stock::query()->firstOrCreate(
            ['product_id' => $product->id, 'branch_id' => $branchId],
            ['quantity' => 0],
        );

        // Bloquea la fila para que dos cajas no descuenten el mismo stock al mismo tiempo.
        $stock = Stock::query()
            ->where('product_id', $product->id)
            ->where('branch_id', $branchId)
            ->lockForUpdate()
            ->firstOrFail();

        $newBalance = bcadd((string) $stock->quantity, $quantity, 3);

        // Por defecto no se permite dejar la existencia en negativo; el negocio puede
        // activarlo en "Datos del negocio → Permitir vender sin existencia".
        if (bccomp($quantity, '0', 3) < 0
            && bccomp($newBalance, '0', 3) < 0
            && ! self::allowsNegativeStock()) {
            $unit = $product->unit?->abbreviation ?? '';
            $available = self::trimQty((string) $stock->quantity);
            $requested = self::trimQty(ltrim($quantity, '-'));

            throw ValidationException::withMessages([
                'items' => "Existencia insuficiente de \"{$product->name}\": hay {$available} {$unit} y se piden {$requested}.",
            ]);
        }

        $stock->update(['quantity' => $newBalance]);

        return InventoryMovement::create([
            'product_id' => $product->id,
            'branch_id' => $branchId,
            'user_id' => $user?->id,
            'type' => $type,
            'quantity' => $quantity,
            'balance' => $newBalance,
            'cost' => $cost ?? (string) $product->cost,
            'reference_type' => $reference?->getMorphClass(),
            'reference_id' => $reference?->getKey(),
            'notes' => $notes,
        ]);
    }

    /**
     * ¿El negocio permite vender aunque no haya existencia? Por defecto, no.
     */
    public static function allowsNegativeStock(): bool
    {
        return Setting::get('allow_negative_stock', '0') === '1';
    }

    private static function trimQty(string $value): string
    {
        return str_contains($value, '.') ? rtrim(rtrim($value, '0'), '.') : $value;
    }
}
