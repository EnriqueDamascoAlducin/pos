<?php

namespace App\Console\Commands;

use App\Models\Branch;
use App\Models\Setting;
use App\Models\User;
use Database\Seeders\BaseDataSeeder;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;

use function Laravel\Prompts\password;
use function Laravel\Prompts\text;

/**
 * Prepara la instalación de un cliente nuevo. Se puede volver a ejecutar sin duplicar datos.
 */
class PosInstall extends Command
{
    protected $signature = 'pos:install
        {--business= : Nombre del negocio}
        {--name= : Nombre del administrador}
        {--email= : Correo del administrador}
        {--password= : Contraseña del administrador}';

    protected $description = 'Instala el punto de venta: migraciones, catálogos base, roles y usuario administrador';

    public function handle(): int
    {
        $this->call('storage:link');

        $this->components->info('Ejecutando migraciones...');
        $this->call('migrate', ['--force' => true]);

        $this->components->info('Cargando roles, permisos y catálogos base...');
        $this->call('db:seed', ['--class' => RolesAndPermissionsSeeder::class, '--force' => true]);
        $this->call('db:seed', ['--class' => BaseDataSeeder::class, '--force' => true]);

        $business = $this->option('business')
            ?? text('Nombre del negocio', default: (string) Setting::get('business_name', config('app.name')), required: true);
        Setting::set('business_name', $business);

        if (User::role('admin')->exists()) {
            $this->components->warn('Ya existe un administrador; se omite su creación.');
        } else {
            $data = [
                'name' => $this->option('name') ?? text('Nombre del administrador', required: true),
                'email' => $this->option('email') ?? text('Correo del administrador', required: true),
                'password' => $this->option('password') ?? password('Contraseña (mínimo 8 caracteres)', required: true),
            ];

            $validator = Validator::make($data, [
                'name' => ['required', 'string', 'max:255'],
                'email' => ['required', 'email', 'unique:users,email'],
                'password' => ['required', 'string', 'min:8'],
            ]);

            if ($validator->fails()) {
                foreach ($validator->errors()->all() as $error) {
                    $this->components->error($error);
                }

                return self::FAILURE;
            }

            $admin = User::create($data + ['branch_id' => Branch::first()->id, 'employee_number' => '1']);
            // email_verified_at no es asignable en masa; se marca verificado explícitamente.
            $admin->forceFill(['email_verified_at' => now()])->save();
            $admin->assignRole('admin');

            $this->components->info("Administrador creado: entra con el número de usuario 1 o con {$data['email']}.");
            $this->components->warn('Asigna su clave de autorización (PIN) en Configuración → Usuarios.');
        }

        $this->components->info('Instalación completa.');

        return self::SUCCESS;
    }
}
