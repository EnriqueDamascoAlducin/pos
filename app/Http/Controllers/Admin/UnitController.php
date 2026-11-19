<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Unit;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Unidades de medida que usa el negocio (pieza, caja, kilo…). Solo las activas
 * se ofrecen al dar de alta productos; los productos que ya usan una unidad
 * desactivada la conservan.
 */
class UnitController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('admin/units', [
            'units' => Unit::withCount('products')->orderByDesc('active')->orderBy('name')->get(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $unit = Unit::create($this->validated($request) + ['active' => true]);

        Inertia::flash('toast', ['type' => 'success', 'message' => "Unidad {$unit->name} creada."]);

        return back();
    }

    public function update(Request $request, Unit $unit): RedirectResponse
    {
        $data = $this->validated($request, $unit);

        if (! $data['active'] && $unit->active && Unit::active()->whereKeyNot($unit->id)->doesntExist()) {
            throw ValidationException::withMessages(['active' => 'Debe quedar al menos una unidad activa.']);
        }

        // Cambiar si acepta decimales afectaría a los productos que ya la usan.
        if ($data['allows_decimals'] !== $unit->allows_decimals && $unit->products()->exists()) {
            throw ValidationException::withMessages([
                'allows_decimals' => 'Esta unidad ya tiene productos; no se puede cambiar si acepta decimales.',
            ]);
        }

        $unit->update($data);

        Inertia::flash('toast', ['type' => 'success', 'message' => "Unidad {$unit->name} actualizada."]);

        return back();
    }

    /**
     * @return array{name: string, abbreviation: string, allows_decimals: bool, active?: bool}
     */
    private function validated(Request $request, ?Unit $unit = null): array
    {
        $request->merge([
            'allows_decimals' => $request->boolean('allows_decimals'),
            'active' => $request->boolean('active', true),
        ]);

        return $request->validate([
            'name' => ['required', 'string', 'max:50', Rule::unique('units')->ignore($unit)],
            'abbreviation' => ['required', 'string', 'max:10', Rule::unique('units')->ignore($unit)],
            'allows_decimals' => ['boolean'],
            'active' => ['boolean'],
        ], attributes: ['name' => 'nombre', 'abbreviation' => 'abreviatura']);
    }
}
