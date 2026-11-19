<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed para desarrollo local. En clientes usar `php artisan pos:install`.
     */
    public function run(): void
    {
        $this->call([
            RolesAndPermissionsSeeder::class,
            BaseDataSeeder::class,
            DemoSeeder::class,
        ]);

        $branch = Branch::first();

        // Número de usuario => rol. Contraseña "password"; el admin y el encargado autorizan con la clave 1234.
        $users = ['1' => 'admin', '2' => 'encargado', '101' => 'cajero'];

        foreach ($users as $number => $role) {
            User::firstOrCreate(
                ['employee_number' => (string) $number],
                [
                    'name' => ucfirst($role),
                    'email' => "{$role}@example.com",
                    'password' => 'password',
                    'pin' => $role === 'cajero' ? null : '1234',
                    'branch_id' => $branch->id,
                    'email_verified_at' => now(),
                ],
            )->syncRoles([$role]);
        }
    }
}
