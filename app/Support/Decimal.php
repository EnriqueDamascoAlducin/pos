<?php

namespace App\Support;

/**
 * Aritmética decimal exacta (bcmath) para dinero y cantidades. Nunca usar float.
 */
final class Decimal
{
    /**
     * Redondeo "half up" (0.005 -> 0.01).
     */
    public static function round(string|int|float $value, int $scale = 2): string
    {
        $value = (string) $value;
        $half = '0.'.str_repeat('0', $scale).'5';

        return bccomp($value, '0', $scale + 6) >= 0
            ? bcadd($value, $half, $scale)
            : bcsub($value, $half, $scale);
    }

    public static function add(string|int ...$values): string
    {
        $sum = '0';
        foreach ($values as $value) {
            $sum = bcadd($sum, (string) $value, 6);
        }

        return self::round($sum);
    }

    public static function sub(string|int $a, string|int $b): string
    {
        return self::round(bcsub((string) $a, (string) $b, 6));
    }

    public static function mul(string|int $a, string|int $b): string
    {
        return self::round(bcmul((string) $a, (string) $b, 6));
    }

    public static function min(string $a, string $b): string
    {
        return bccomp($a, $b, 6) <= 0 ? $a : $b;
    }

    public static function gt(string|int $a, string|int $b): bool
    {
        return bccomp((string) $a, (string) $b, 6) === 1;
    }

    public static function lt(string|int $a, string|int $b): bool
    {
        return bccomp((string) $a, (string) $b, 6) === -1;
    }

    public static function isZero(string|int $value): bool
    {
        return bccomp((string) $value, '0', 6) === 0;
    }
}
