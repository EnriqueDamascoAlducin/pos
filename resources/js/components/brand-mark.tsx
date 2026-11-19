import { usePage } from '@inertiajs/react';
import { Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Marca del negocio: su logo si lo subió en "Datos del negocio";
 * si no, un distintivo ámbar con una llave.
 */
export default function BrandMark({ className }: { className?: string }) {
    const { logoUrl, name } = usePage().props;

    if (logoUrl) {
        return (
            <img
                src={logoUrl}
                alt={name}
                className={cn(
                    'size-12 rounded-lg bg-white object-contain p-1',
                    className,
                )}
            />
        );
    }

    return (
        <div
            className={cn(
                'flex size-12 items-center justify-center rounded-lg bg-amber-500 text-zinc-950 shadow-sm',
                className,
            )}
            aria-hidden
        >
            <Wrench className="size-6" strokeWidth={2.25} />
        </div>
    );
}
