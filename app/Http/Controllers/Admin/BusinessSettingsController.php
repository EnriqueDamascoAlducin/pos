<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class BusinessSettingsController extends Controller
{
    /** Claves editables desde la pantalla de configuración. */
    private const KEYS = [
        'business_name', 'business_rfc', 'business_address', 'business_phone',
        'ticket_footer', 'default_tax_rate', 'allow_negative_stock',
    ];

    public function edit(): Response
    {
        $settings = Setting::map();

        return Inertia::render('admin/business', [
            'settings' => collect(self::KEYS)->mapWithKeys(fn ($k) => [$k => $settings[$k] ?? null]),
            'logoUrl' => self::logoUrl(),
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $request->merge(['allow_negative_stock' => $request->boolean('allow_negative_stock')]);

        $data = $request->validate([
            'business_name' => ['required', 'string', 'max:100'],
            'business_rfc' => ['nullable', 'string', 'max:13'],
            'business_address' => ['nullable', 'string', 'max:255'],
            'business_phone' => ['nullable', 'string', 'max:50'],
            'ticket_footer' => ['nullable', 'string', 'max:255'],
            'default_tax_rate' => ['required', Rule::in(['0', '0.08', '0.16'])],
            'allow_negative_stock' => ['boolean'],
            'logo' => ['nullable', 'image', 'mimes:png,jpg,jpeg,webp', 'max:1024'],
            'remove_logo' => ['nullable', 'boolean'],
        ], attributes: [
            'business_name' => 'nombre del negocio',
            'business_rfc' => 'RFC',
            'business_address' => 'dirección',
            'business_phone' => 'teléfono',
            'ticket_footer' => 'pie de ticket',
        ]);

        foreach (self::KEYS as $key) {
            $value = $data[$key] ?? null;
            Setting::set($key, is_bool($value) ? ($value ? '1' : '0') : $value);
        }

        $currentLogo = Setting::get('business_logo');

        if ($request->hasFile('logo') || $request->boolean('remove_logo')) {
            if ($currentLogo) {
                Storage::disk('public')->delete($currentLogo);
            }
            Setting::set('business_logo', $request->hasFile('logo')
                ? $request->file('logo')->store('branding', 'public')
                : null);
        }

        Inertia::flash('toast', ['type' => 'success', 'message' => 'Configuración guardada.']);

        return back();
    }

    public static function logoUrl(): ?string
    {
        $path = Setting::get('business_logo');

        return $path ? Storage::disk('public')->url($path) : null;
    }
}
