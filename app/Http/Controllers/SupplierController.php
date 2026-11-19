<?php

namespace App\Http\Controllers;

use App\Models\Supplier;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class SupplierController extends Controller
{
    public function index(Request $request): Response
    {
        $search = $request->string('search')->trim()->value();

        return Inertia::render('suppliers/index', [
            'suppliers' => Supplier::query()
                ->when($search, fn ($q) => $q->where('name', 'like', "%{$search}%"))
                ->withCount('purchases')
                ->withSum(['purchases' => fn ($q) => $q->where('status', 'received')], 'total')
                ->orderBy('name')
                ->paginate(50)
                ->withQueryString(),
            'filters' => ['search' => $search],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        Supplier::create($this->validated($request));

        Inertia::flash('toast', ['type' => 'success', 'message' => 'Proveedor registrado.']);

        return back();
    }

    public function update(Request $request, Supplier $supplier): RedirectResponse
    {
        $supplier->update($this->validated($request));

        Inertia::flash('toast', ['type' => 'success', 'message' => 'Proveedor actualizado.']);

        return back();
    }

    public function destroy(Supplier $supplier): RedirectResponse
    {
        $supplier->delete();

        Inertia::flash('toast', ['type' => 'success', 'message' => 'Proveedor eliminado.']);

        return back();
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'contact' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
        ], attributes: ['name' => 'nombre', 'phone' => 'teléfono', 'email' => 'correo']);
    }
}
