import { Form, Head } from '@inertiajs/react';
import { LogIn } from 'lucide-react';
import InputError from '@/components/input-error';
import PasskeyVerify from '@/components/passkey-verify';
import PasswordInput from '@/components/password-input';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { store } from '@/routes/login';
import { request } from '@/routes/password';

type Props = {
    status?: string;
    canResetPassword: boolean;
};

export default function Login({ status, canResetPassword }: Props) {
    return (
        <>
            <Head title="Iniciar sesión" />

            {status && (
                <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    {status}
                </div>
            )}

            <PasskeyVerify separator="o con tu número de usuario" />

            <Form
                {...store.form()}
                resetOnSuccess={['password']}
                className="grid gap-5"
            >
                {({ processing, errors }) => (
                    <>
                        <div className="grid gap-2">
                            <Label htmlFor="login">Número de usuario</Label>
                            <Input
                                id="login"
                                type="text"
                                name="login"
                                required
                                autoFocus
                                tabIndex={1}
                                autoComplete="username"
                                placeholder="Ej. 101"
                                className="h-11 text-base"
                            />
                            <p className="text-xs text-muted-foreground">
                                También puedes entrar con tu correo.
                            </p>
                            <InputError message={errors.login} />
                        </div>

                        <div className="grid gap-2">
                            <div className="flex items-center">
                                <Label htmlFor="password">Contraseña</Label>
                                {canResetPassword && (
                                    <TextLink
                                        href={request()}
                                        className="ml-auto text-sm"
                                        tabIndex={5}
                                    >
                                        ¿La olvidaste?
                                    </TextLink>
                                )}
                            </div>
                            <PasswordInput
                                id="password"
                                name="password"
                                required
                                tabIndex={2}
                                autoComplete="current-password"
                                placeholder="••••••••"
                                className="h-11 text-base"
                            />
                            <InputError message={errors.password} />
                        </div>

                        <div className="flex items-center gap-3">
                            <Checkbox
                                id="remember"
                                name="remember"
                                tabIndex={3}
                            />
                            <Label htmlFor="remember" className="font-normal">
                                Mantener sesión iniciada en este equipo
                            </Label>
                        </div>

                        <Button
                            type="submit"
                            size="lg"
                            className="mt-2 h-11 w-full bg-amber-500 text-base font-semibold text-zinc-950 hover:bg-amber-400 focus-visible:ring-amber-500/50"
                            tabIndex={4}
                            disabled={processing}
                            data-test="login-button"
                        >
                            {processing ? <Spinner /> : <LogIn />}
                            Entrar
                        </Button>
                    </>
                )}
            </Form>

            <p className="mt-8 border-t pt-6 text-center text-xs text-muted-foreground">
                ¿No tienes usuario? Pídeselo al administrador del negocio.
            </p>
        </>
    );
}

Login.layout = {
    title: 'Bienvenido',
    description: 'Entra con tu número de usuario y contraseña.',
};
