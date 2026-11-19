import { AlertTriangle, HelpCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Reemplazo de window.confirm() y window.prompt() con el estilo del sistema.
 *
 *   if (await confirmDialog({ title: '¿Eliminar producto?', destructive: true })) { ... }
 *   const reason = await promptDialog({ title: 'Cancelar venta', label: 'Motivo' });
 *
 * Requiere <ConfirmDialogHost /> montado una sola vez (en app.tsx).
 */

type BaseOptions = {
    title: string;
    description?: ReactNode;
    confirmText?: string;
    cancelText?: string;
    /** Botón rojo y ícono de advertencia, para acciones que borran o cancelan. */
    destructive?: boolean;
};

export type ConfirmOptions = BaseOptions;

export type PromptOptions = BaseOptions & {
    label: string;
    defaultValue?: string;
    placeholder?: string;
    /** Por defecto es obligatorio: no deja confirmar con el campo vacío. */
    required?: boolean;
    maxLength?: number;
};

type Request =
    | {
          kind: 'confirm';
          options: ConfirmOptions;
          resolve: (value: boolean) => void;
      }
    | {
          kind: 'prompt';
          options: PromptOptions;
          resolve: (value: string | null) => void;
      };

/*
 * El enlace con el host vive en globalThis y no en una variable del módulo: en desarrollo,
 * la recarga en caliente de Vite puede cargar dos copias de este archivo y cada una
 * tendría su propia variable.
 */
const KEY = '__posConfirmDialogEnqueue';
type GlobalWithQueue = typeof globalThis & {
    [KEY]?: ((request: Request) => void) | null;
};
const registry = globalThis as GlobalWithQueue;

const enqueue = (request: Request): boolean => {
    const push = registry[KEY];
    if (!push) return false;
    push(request);
    return true;
};

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
        if (!enqueue({ kind: 'confirm', options, resolve })) {
            // El host no está montado: se toma como "no", para no ejecutar nada sin confirmar.
            console.error('ConfirmDialogHost no está montado.');
            resolve(false);
        }
    });
}

export function promptDialog(options: PromptOptions): Promise<string | null> {
    return new Promise((resolve) => {
        if (!enqueue({ kind: 'prompt', options, resolve })) {
            console.error('ConfirmDialogHost no está montado.');
            resolve(null);
        }
    });
}

export function ConfirmDialogHost() {
    const [queue, setQueue] = useState<Request[]>([]);
    const [value, setValue] = useState('');
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const current = queue[0] ?? null;

    useEffect(() => {
        const push = (request: Request) => setQueue((q) => [...q, request]);
        registry[KEY] = push;
        return () => {
            if (registry[KEY] === push) registry[KEY] = null;
        };
    }, []);

    // Prepara el campo cada vez que aparece un diálogo nuevo.
    useEffect(() => {
        if (current?.kind === 'prompt') {
            setValue(current.options.defaultValue ?? '');
            setError(null);
            setTimeout(() => inputRef.current?.select(), 50);
        }
    }, [current]);

    const close = (result: boolean) => {
        if (!current) return;

        if (current.kind === 'confirm') {
            current.resolve(result);
        } else if (!result) {
            current.resolve(null);
        } else {
            const text = value.trim();
            if ((current.options.required ?? true) && !text) {
                setError('Este campo es obligatorio.');
                inputRef.current?.focus();
                return;
            }
            current.resolve(text);
        }

        setQueue((q) => q.slice(1));
    };

    const options = current?.options;
    const destructive = options?.destructive ?? false;
    const Icon = destructive ? AlertTriangle : HelpCircle;

    return (
        <Dialog
            open={current !== null}
            onOpenChange={(open) => !open && close(false)}
        >
            <DialogContent className="sm:max-w-md">
                {current && options && (
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            close(true);
                        }}
                        className="grid gap-4"
                    >
                        <DialogHeader className="flex-row items-start gap-3 text-left">
                            <span
                                className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
                                    destructive
                                        ? 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400'
                                        : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                                }`}
                                aria-hidden
                            >
                                <Icon className="size-5" />
                            </span>
                            <div className="grid gap-1.5">
                                <DialogTitle>{options.title}</DialogTitle>
                                {options.description && (
                                    <DialogDescription>
                                        {options.description}
                                    </DialogDescription>
                                )}
                            </div>
                        </DialogHeader>

                        {current.kind === 'prompt' && (
                            <div className="grid gap-1.5">
                                <Label htmlFor="confirm-dialog-input">
                                    {current.options.label}
                                </Label>
                                <Input
                                    id="confirm-dialog-input"
                                    ref={inputRef}
                                    value={value}
                                    onChange={(e) => {
                                        setValue(e.target.value);
                                        setError(null);
                                    }}
                                    placeholder={current.options.placeholder}
                                    maxLength={current.options.maxLength ?? 255}
                                    aria-invalid={!!error}
                                    autoComplete="off"
                                />
                                {error && (
                                    <p className="text-sm text-red-600">
                                        {error}
                                    </p>
                                )}
                            </div>
                        )}

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => close(false)}
                            >
                                {options.cancelText ?? 'Cancelar'}
                            </Button>
                            <Button
                                type="submit"
                                variant={
                                    destructive ? 'destructive' : 'default'
                                }
                                autoFocus={current.kind === 'confirm'}
                            >
                                {options.confirmText ?? 'Aceptar'}
                            </Button>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
