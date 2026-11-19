<?php

namespace App\Http\Controllers;

use App\Models\Branch;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class UserController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('users/index', [
            'users' => User::query()
                ->with('roles:id,name', 'branch:id,name')
                ->orderByDesc('active')
                ->orderBy('name')
                ->get()
                ->map(fn (User $u) => [
                    'id' => $u->id,
                    'employee_number' => $u->employee_number,
                    'name' => $u->name,
                    'email' => $u->email,
                    'active' => $u->active,
                    'role' => $u->roles->first()?->name,
                    'branch_id' => $u->branch_id,
                    'branch' => $u->branch?->name,
                    'has_pin' => $u->pin !== null,
                ]),
            'roles' => collect(RolesAndPermissionsSeeder::ROLES)->keys()->map(fn ($name) => [
                'name' => $name,
                'permissions' => $this->rolePermissions($name),
            ])->values(),
            'branches' => Branch::orderBy('name')->get(['id', 'name']),
            'nextEmployeeNumber' => self::nextEmployeeNumber(),
        ]);
    }

    /**
     * Siguiente número libre (los números son solo dígitos; empieza en 101).
     */
    public static function nextEmployeeNumber(): string
    {
        $max = User::query()
            ->whereNotNull('employee_number')
            ->pluck('employee_number')
            ->filter(fn ($n) => ctype_digit((string) $n))
            ->map(fn ($n) => (int) $n)
            ->max();

        return (string) max(($max ?? 0) + 1, 101);
    }

    public function store(Request $request): RedirectResponse
    {
        $data = $this->validated($request);

        $user = User::create([
            'employee_number' => $data['employee_number'],
            'name' => $data['name'],
            'email' => $data['email'] ?? null,
            'password' => $data['password'],
            'pin' => $data['pin'] ?? null,
            'branch_id' => $data['branch_id'] ?? null,
            'active' => $data['active'],
        ]);
        // Lo da de alta el admin: no requiere verificar correo (email_verified_at no es asignable en masa).
        $user->forceFill(['email_verified_at' => now()])->save();
        $user->syncRoles([$data['role']]);

        Inertia::flash('toast', ['type' => 'success', 'message' => "Usuario {$user->name} creado."]);

        return back();
    }

    public function update(Request $request, User $user): RedirectResponse
    {
        $data = $this->validated($request, $user);

        $this->guardLastAdmin($request, $user, $data);

        $user->fill([
            'employee_number' => $data['employee_number'],
            'name' => $data['name'],
            'email' => $data['email'] ?? null,
            'branch_id' => $data['branch_id'] ?? null,
            'active' => $data['active'],
        ]);

        if (! empty($data['password'])) {
            $user->password = $data['password'];
        }

        // Vacío = se queda la clave que ya tenía; "Quitar clave" la borra.
        if (! empty($data['pin'])) {
            $user->pin = $data['pin'];
        } elseif ($request->boolean('remove_pin')) {
            $user->pin = null;
        }

        $user->save();
        $user->syncRoles([$data['role']]);

        Inertia::flash('toast', ['type' => 'success', 'message' => "Usuario {$user->name} actualizado."]);

        return back();
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?User $user = null): array
    {
        $request->merge(['active' => $request->boolean('active')]);

        return $request->validate([
            'employee_number' => ['required', 'regex:/^\d{1,10}$/', Rule::unique('users')->ignore($user)],
            'name' => ['required', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255', Rule::unique('users')->ignore($user)],
            'password' => [$user ? 'nullable' : 'required', 'string', Password::min(8)],
            'pin' => ['nullable', 'regex:/^\d{4,6}$/'],
            'role' => ['required', Rule::in(array_keys(RolesAndPermissionsSeeder::ROLES))],
            'branch_id' => ['nullable', 'exists:branches,id'],
            'active' => ['boolean'],
        ], [
            'employee_number.regex' => 'El número de usuario debe tener solo dígitos (máximo 10).',
            'pin.regex' => 'La clave de autorización debe tener de 4 a 6 dígitos.',
        ], [
            'employee_number' => 'número de usuario',
            'pin' => 'clave de autorización',
            'name' => 'nombre',
            'email' => 'correo',
            'password' => 'contraseña',
            'role' => 'rol',
            'branch_id' => 'sucursal',
        ]);
    }

    /**
     * Evita quedarse sin administradores o bloquearse a uno mismo.
     *
     * @param  array<string, mixed>  $data
     */
    private function guardLastAdmin(Request $request, User $user, array $data): void
    {
        $isSelf = $request->user()->is($user);

        if ($isSelf && ! $data['active']) {
            throw ValidationException::withMessages(['active' => 'No puedes desactivar tu propio usuario.']);
        }

        if ($isSelf && $data['role'] !== 'admin' && $user->hasRole('admin')) {
            throw ValidationException::withMessages(['role' => 'No puedes quitarte el rol de administrador.']);
        }

        $losesAdmin = $user->hasRole('admin') && ($data['role'] !== 'admin' || ! $data['active']);

        if ($losesAdmin && User::role('admin')->where('active', true)->whereKeyNot($user->id)->doesntExist()) {
            throw ValidationException::withMessages(['role' => 'Debe quedar al menos un administrador activo.']);
        }
    }

    /**
     * @return list<string>
     */
    private function rolePermissions(string $role): array
    {
        $perms = RolesAndPermissionsSeeder::ROLES[$role];
        $names = $perms === '*' ? array_keys(RolesAndPermissionsSeeder::PERMISSIONS) : $perms;

        return array_map(fn ($p) => RolesAndPermissionsSeeder::PERMISSIONS[$p], $names);
    }
}
