<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\CashRegister;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Sucursales y sus cajas.
 */
class BranchController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('admin/branches', [
            'branches' => Branch::query()
                ->withCount('users')
                ->with(['cashRegisters' => fn ($q) => $q->orderBy('name')->with('openSession.user:id,name')])
                ->orderBy('name')
                ->get()
                ->map(fn (Branch $b) => [
                    'id' => $b->id,
                    'name' => $b->name,
                    'address' => $b->address,
                    'phone' => $b->phone,
                    'active' => $b->active,
                    'users_count' => $b->users_count,
                    'registers' => $b->cashRegisters->map(fn (CashRegister $r) => [
                        'id' => $r->id,
                        'name' => $r->name,
                        'active' => $r->active,
                        'open_by' => $r->openSession?->user->name,
                    ]),
                ]),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $branch = Branch::create($this->validatedBranch($request));
        $branch->cashRegisters()->create(['name' => 'Caja 1']);

        Inertia::flash('toast', ['type' => 'success', 'message' => "Sucursal {$branch->name} creada con Caja 1."]);

        return back();
    }

    public function update(Request $request, Branch $branch): RedirectResponse
    {
        $branch->update($this->validatedBranch($request));

        Inertia::flash('toast', ['type' => 'success', 'message' => 'Sucursal actualizada.']);

        return back();
    }

    public function storeRegister(Request $request, Branch $branch): RedirectResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:50', Rule::unique('cash_registers')->where('branch_id', $branch->id)],
        ], attributes: ['name' => 'nombre']);

        $branch->cashRegisters()->create($data);

        Inertia::flash('toast', ['type' => 'success', 'message' => 'Caja agregada.']);

        return back();
    }

    public function updateRegister(Request $request, CashRegister $register): RedirectResponse
    {
        $request->merge(['active' => $request->boolean('active')]);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:50', Rule::unique('cash_registers')->where('branch_id', $register->branch_id)->ignore($register)],
            'active' => ['boolean'],
        ], attributes: ['name' => 'nombre']);

        if (! $data['active'] && $register->openSession()->exists()) {
            throw ValidationException::withMessages(['active' => 'No puedes desactivar una caja con turno abierto.']);
        }

        $register->update($data);

        Inertia::flash('toast', ['type' => 'success', 'message' => 'Caja actualizada.']);

        return back();
    }

    /**
     * @return array<string, mixed>
     */
    private function validatedBranch(Request $request): array
    {
        $request->merge(['active' => $request->boolean('active', true)]);

        return $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'address' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'active' => ['boolean'],
        ], attributes: ['name' => 'nombre', 'address' => 'dirección', 'phone' => 'teléfono']);
    }
}
