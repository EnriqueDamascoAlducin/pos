import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '@/lib/format';

export type DayRow = {
    date: string;
    count: number;
    total: string;
    profit: string;
};

const HEIGHT = 220;
const PAD = { top: 12, right: 8, bottom: 26, left: 56 };

const compact = new Intl.NumberFormat('es-MX', {
    notation: 'compact',
    maximumFractionDigits: 1,
});

function parseDay(date: string) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d);
}

const dayLabel = (date: string) =>
    parseDay(date).toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'short',
    });

const dayLong = (date: string) =>
    parseDay(date).toLocaleDateString('es-MX', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    });

/** Escala "bonita" para el eje Y: 4 divisiones con pasos redondos. */
function niceMax(value: number) {
    if (value <= 0) return 100;
    const step = Math.pow(10, Math.floor(Math.log10(value / 4)));
    const nice =
        [1, 2, 2.5, 5, 10].map((m) => m * step).find((s) => s * 4 >= value) ??
        step * 10;
    return nice * 4;
}

/**
 * Ventas por día: una sola serie de barras (sin leyenda; el título la nombra),
 * con tooltip por barra y vista de tabla para lectores de pantalla o impresión.
 */
export default function DailySalesChart({ days }: { days: DayRow[] }) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(640);
    const [hover, setHover] = useState<number | null>(null);
    const [asTable, setAsTable] = useState(false);

    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([entry]) =>
            setWidth(Math.max(entry.contentRect.width, 240)),
        );
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const totals = days.map((d) => Number(d.total));
    const max = niceMax(Math.max(...totals, 0));
    const plotW = width - PAD.left - PAD.right;
    const plotH = HEIGHT - PAD.top - PAD.bottom;
    const slot = plotW / Math.max(days.length, 1);
    const barW = Math.max(Math.min(slot - 2, 32), 2); // ≥2px de separación entre barras
    const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
    const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i);
    const labelEvery = Math.ceil(
        days.length / Math.max(Math.floor(plotW / 56), 1),
    );

    const hovered = hover !== null ? days[hover] : null;

    return (
        <div className="grid gap-2">
            <div className="flex items-center justify-between">
                <h2 className="font-medium">Ventas por día</h2>
                <button
                    type="button"
                    onClick={() => setAsTable((t) => !t)}
                    className="text-xs text-muted-foreground underline"
                >
                    {asTable ? 'Ver gráfica' : 'Ver tabla'}
                </button>
            </div>

            {asTable ? (
                <div className="max-h-72 overflow-auto rounded-lg border">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground uppercase">
                            <tr>
                                <th className="px-3 py-1.5">Día</th>
                                <th className="px-3 py-1.5 text-right">
                                    Ventas
                                </th>
                                <th className="px-3 py-1.5 text-right">
                                    Importe
                                </th>
                                <th className="px-3 py-1.5 text-right">
                                    Utilidad
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {days.map((d) => (
                                <tr key={d.date} className="border-t">
                                    <td className="px-3 py-1.5 first-letter:uppercase">
                                        {dayLong(d.date)}
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">
                                        {d.count}
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">
                                        {formatMoney(d.total)}
                                    </td>
                                    <td className="px-3 py-1.5 text-right tabular-nums">
                                        {formatMoney(d.profit)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div
                    ref={wrapRef}
                    className="relative"
                    onMouseLeave={() => setHover(null)}
                >
                    <svg
                        width={width}
                        height={HEIGHT}
                        role="img"
                        aria-label="Importe vendido por día"
                    >
                        {ticks.map((t) => (
                            <g key={t}>
                                <line
                                    x1={PAD.left}
                                    x2={width - PAD.right}
                                    y1={y(t)}
                                    y2={y(t)}
                                    className={
                                        t === 0
                                            ? 'stroke-border'
                                            : 'stroke-border/60'
                                    }
                                    strokeDasharray={
                                        t === 0 ? undefined : '2 3'
                                    }
                                />
                                <text
                                    x={PAD.left - 8}
                                    y={y(t)}
                                    dy="0.32em"
                                    textAnchor="end"
                                    className="fill-muted-foreground text-[11px] tabular-nums"
                                >
                                    ${compact.format(t)}
                                </text>
                            </g>
                        ))}

                        {days.map((d, i) => {
                            const v = Number(d.total);
                            const x = PAD.left + i * slot + (slot - barW) / 2;
                            const top = y(v);
                            const h = PAD.top + plotH - top;
                            const r = Math.min(4, barW / 2, h);

                            return (
                                <g key={d.date}>
                                    {h > 0 && (
                                        <path
                                            d={`M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`}
                                            className={`fill-[#2a78d6] transition-opacity dark:fill-[#3987e5] ${hover !== null && hover !== i ? 'opacity-50' : ''}`}
                                        />
                                    )}
                                    {/* Zona de hover más grande que la barra */}
                                    <rect
                                        x={PAD.left + i * slot}
                                        y={PAD.top}
                                        width={slot}
                                        height={plotH}
                                        fill="transparent"
                                        onMouseEnter={() => setHover(i)}
                                    />
                                    {i % labelEvery === 0 && (
                                        <text
                                            x={PAD.left + i * slot + slot / 2}
                                            y={HEIGHT - 8}
                                            textAnchor="middle"
                                            className="fill-muted-foreground text-[11px]"
                                        >
                                            {dayLabel(d.date)}
                                        </text>
                                    )}
                                </g>
                            );
                        })}
                    </svg>

                    {hovered && hover !== null && (
                        <div
                            className="pointer-events-none absolute z-10 min-w-40 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md"
                            style={{
                                left: Math.min(
                                    Math.max(
                                        PAD.left + hover * slot + slot / 2 - 80,
                                        0,
                                    ),
                                    width - 170,
                                ),
                                top: 0,
                            }}
                        >
                            <div className="mb-1 font-medium first-letter:uppercase">
                                {dayLong(hovered.date)}
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground">
                                    Importe
                                </span>
                                <span className="font-medium tabular-nums">
                                    {formatMoney(hovered.total)}
                                </span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground">
                                    Ventas
                                </span>
                                <span className="tabular-nums">
                                    {hovered.count}
                                </span>
                            </div>
                            <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground">
                                    Utilidad
                                </span>
                                <span className="tabular-nums">
                                    {formatMoney(hovered.profit)}
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
