<?php

namespace App\Actions\Sales;

use App\Models\User;
use App\Support\Decimal;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Autorización de descuentos y cambios de precio en la caja de un cajero.
 *
 * Un encargado (o admin) teclea su número de usuario y su clave en la caja; se emite un pase de
 * un solo uso ligado a ESE cajero y a ESOS ajustes exactos. Al cobrar, cada partida ajustada
 * debe coincidir con lo autorizado; si el cajero cambia algo después, hay que volver a autorizar.
 */
class SaleAdjustmentAuthorization
{
    private const TTL_MINUTES = 30;

    private const MAX_ATTEMPTS = 5;

    /**
     * @param  array<int, array{product_id: int, unit_price?: string|float|int|null, discount?: string|float|int|null}>  $adjustments
     * @return array{token: string, supervisor: string}
     */
    public function grant(User $cashier, string $employeeNumber, string $pin, array $adjustments): array
    {
        $key = "sale-authorization:{$cashier->id}";

        if (RateLimiter::tooManyAttempts($key, self::MAX_ATTEMPTS)) {
            throw ValidationException::withMessages([
                'pin' => 'Demasiados intentos. Espera '.RateLimiter::availableIn($key).' segundos.',
            ]);
        }

        $supervisor = User::query()->where('employee_number', trim($employeeNumber))->first();

        $valid = $supervisor
            && $supervisor->active
            && $supervisor->pin !== null
            && Hash::check($pin, $supervisor->pin)
            && $supervisor->can('sales.discount');

        if (! $valid) {
            RateLimiter::hit($key, 60);

            throw ValidationException::withMessages([
                'pin' => 'Número o clave incorrectos, o ese usuario no puede autorizar.',
            ]);
        }

        RateLimiter::clear($key);

        $token = Str::random(40);

        Cache::put($this->cacheKey($token), [
            'cashier_id' => $cashier->id,
            'supervisor_id' => $supervisor->id,
            'adjustments' => $this->normalize($adjustments),
        ], now()->addMinutes(self::TTL_MINUTES));

        return ['token' => $token, 'supervisor' => $supervisor->name];
    }

    /**
     * Valida el pase contra las partidas que se van a cobrar y regresa quién autorizó.
     *
     * @param  array<int, array<string, mixed>>  $items
     */
    public function resolve(User $cashier, ?string $token, array $items): int
    {
        $grant = $token ? Cache::get($this->cacheKey($token)) : null;

        if (! $grant || $grant['cashier_id'] !== $cashier->id) {
            throw ValidationException::withMessages([
                'authorization' => 'Los descuentos o cambios de precio necesitan la autorización de un encargado.',
            ]);
        }

        $requested = $this->normalize($items);

        foreach ($requested as $productId => $adjustment) {
            if (($grant['adjustments'][$productId] ?? null) !== $adjustment) {
                throw ValidationException::withMessages([
                    'authorization' => 'Un ajuste cambió después de autorizarse. Pide la autorización de nuevo.',
                ]);
            }
        }

        return $grant['supervisor_id'];
    }

    /** El pase es de un solo uso: se descarta al cobrar la venta. */
    public function consume(?string $token): void
    {
        if ($token) {
            Cache::forget($this->cacheKey($token));
        }
    }

    /**
     * ¿Alguna partida trae descuento o precio cambiado?
     *
     * @param  array<int, array<string, mixed>>  $items
     */
    public static function hasAdjustments(array $items): bool
    {
        foreach ($items as $item) {
            if (isset($item['unit_price']) && $item['unit_price'] !== '') {
                return true;
            }

            if (Decimal::gt((string) ($item['discount'] ?? '0') ?: '0', '0')) {
                return true;
            }
        }

        return false;
    }

    /**
     * product_id => [precio unitario | null, descuento], solo de las partidas ajustadas.
     *
     * @param  array<int, array<string, mixed>>  $items
     * @return array<int, array{unit_price: string|null, discount: string}>
     */
    private function normalize(array $items): array
    {
        $result = [];

        foreach ($items as $item) {
            $price = isset($item['unit_price']) && $item['unit_price'] !== '' ? Decimal::round((string) $item['unit_price']) : null;
            $discount = Decimal::round((string) (($item['discount'] ?? '0') ?: '0'));

            if ($price === null && ! Decimal::gt($discount, '0')) {
                continue;
            }

            $result[(int) $item['product_id']] = ['unit_price' => $price, 'discount' => $discount];
        }

        return $result;
    }

    private function cacheKey(string $token): string
    {
        return "sale-authorization:token:{$token}";
    }
}
