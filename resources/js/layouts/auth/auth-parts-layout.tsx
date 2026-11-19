import { usePage } from '@inertiajs/react';
import {
    Barcode,
    ChartColumn,
    Cog,
    PackageSearch,
    ShieldCheck,
} from 'lucide-react';
import BrandMark from '@/components/brand-mark';
import type { AuthLayoutProps } from '@/types';

const FEATURES = [
    {
        icon: Barcode,
        title: 'Venta rápida en mostrador',
        text: 'Busca por código de barras, número de parte o descripción.',
    },
    {
        icon: PackageSearch,
        title: 'Existencias al momento',
        text: 'Inventario, compras a proveedores y kardex por pieza.',
    },
    {
        icon: ChartColumn,
        title: 'Cortes y reportes',
        text: 'Ventas, utilidad y cuentas por cobrar de cada sucursal.',
    },
];

/** Textura de rodada/placa diamantada muy sutil para el panel oscuro. */
const treadPattern = {
    backgroundImage: [
        'repeating-linear-gradient(45deg, rgba(255,255,255,0.035) 0 2px, transparent 2px 14px)',
        'repeating-linear-gradient(-45deg, rgba(255,255,255,0.035) 0 2px, transparent 2px 14px)',
    ].join(','),
};

/**
 * Pantallas de acceso con estilo de refaccionaria: panel grafito con acento ámbar
 * a la izquierda (en escritorio) y el formulario a la derecha.
 */
export default function AuthPartsLayout({
    children,
    title,
    description,
}: AuthLayoutProps) {
    const { name } = usePage().props;
    const year = new Date().getFullYear();

    return (
        <div className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            {/* ----- Panel de marca (escritorio) ----- */}
            <aside className="relative hidden overflow-hidden bg-zinc-950 text-zinc-100 lg:flex lg:flex-col">
                <div
                    className="absolute inset-0"
                    style={treadPattern}
                    aria-hidden
                />
                <div
                    className="absolute inset-x-0 top-0 h-1.5 bg-amber-500"
                    aria-hidden
                />
                <Cog
                    className="absolute -right-32 -bottom-32 size-[26rem] text-zinc-800/60"
                    strokeWidth={0.75}
                    aria-hidden
                />
                <Cog
                    className="absolute top-16 -right-10 size-36 text-zinc-800/50"
                    strokeWidth={1}
                    aria-hidden
                />

                <div className="relative z-10 flex flex-1 flex-col justify-between p-10 xl:p-14">
                    <div className="flex items-center gap-3">
                        <BrandMark />
                        <div>
                            <div className="text-lg leading-tight font-semibold">
                                {name}
                            </div>
                            <div className="text-xs tracking-[0.2em] text-amber-400 uppercase">
                                Refacciones y autopartes
                            </div>
                        </div>
                    </div>

                    <div className="max-w-md">
                        <h2 className="text-3xl leading-tight font-semibold tracking-tight xl:text-4xl">
                            Tu mostrador, tu inventario y tu caja en un solo
                            lugar.
                        </h2>
                        <ul className="mt-8 grid gap-5">
                            {FEATURES.map((f) => (
                                <li key={f.title} className="flex gap-4">
                                    <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 text-amber-400">
                                        <f.icon className="size-5" />
                                    </span>
                                    <span>
                                        <span className="block font-medium">
                                            {f.title}
                                        </span>
                                        <span className="text-sm text-zinc-400">
                                            {f.text}
                                        </span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <ShieldCheck className="size-4" />
                        Acceso solo para personal autorizado · © {year} {name}
                    </div>
                </div>
            </aside>

            {/* ----- Formulario ----- */}
            <main className="flex flex-col">
                {/* Franja de marca en celular y tableta */}
                <div className="relative overflow-hidden bg-zinc-950 px-6 py-5 text-zinc-100 lg:hidden">
                    <div
                        className="absolute inset-0"
                        style={treadPattern}
                        aria-hidden
                    />
                    <div
                        className="absolute inset-x-0 bottom-0 h-1 bg-amber-500"
                        aria-hidden
                    />
                    <div className="relative flex items-center gap-3">
                        <BrandMark className="size-10" />
                        <div>
                            <div className="leading-tight font-semibold">
                                {name}
                            </div>
                            <div className="text-[11px] tracking-[0.2em] text-amber-400 uppercase">
                                Refacciones y autopartes
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
                    <div className="w-full max-w-sm">
                        <div className="mb-8">
                            <div
                                className="mb-3 h-1 w-10 rounded-full bg-amber-500"
                                aria-hidden
                            />
                            <h1 className="text-2xl font-semibold tracking-tight">
                                {title}
                            </h1>
                            {description && (
                                <p className="mt-1.5 text-sm text-muted-foreground">
                                    {description}
                                </p>
                            )}
                        </div>
                        {children}
                    </div>
                </div>
            </main>
        </div>
    );
}
