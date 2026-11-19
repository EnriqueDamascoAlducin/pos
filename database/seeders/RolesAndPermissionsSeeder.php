<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class RolesAndPermissionsSeeder extends Seeder
{
    public const PERMISSIONS = [
        'sales.create' => 'Vender',
        'sales.discount' => 'Aplicar descuentos',
        'sales.cancel' => 'Cancelar ventas',
        'sales.view_all' => 'Ver ventas de todos los usuarios',
        'cash.operate' => 'Abrir y cerrar turno de caja',
        'cash.movements' => 'Entradas y salidas de efectivo',
        'products.manage' => 'Administrar productos',
        'inventory.adjust' => 'Ajustar inventario',
        'purchases.manage' => 'Registrar compras',
        'customers.manage' => 'Administrar clientes',
        'customers.credit' => 'Vender a crédito y recibir abonos',
        'reports.view' => 'Ver reportes',
        'users.manage' => 'Administrar usuarios',
        'settings.manage' => 'Configuración del negocio',
    ];

    public const ROLES = [
        'admin' => '*',
        'encargado' => [
            'sales.create', 'sales.discount', 'sales.cancel', 'sales.view_all',
            'cash.operate', 'cash.movements', 'products.manage', 'inventory.adjust',
            'purchases.manage', 'customers.manage', 'customers.credit', 'reports.view',
        ],
        'cajero' => [
            'sales.create', 'cash.operate', 'cash.movements', 'customers.credit',
        ],
    ];

    public function run(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        foreach (array_keys(self::PERMISSIONS) as $name) {
            Permission::findOrCreate($name, 'web');
        }

        foreach (self::ROLES as $roleName => $permissions) {
            $role = Role::findOrCreate($roleName, 'web');
            $role->syncPermissions($permissions === '*' ? array_keys(self::PERMISSIONS) : $permissions);
        }
    }
}
