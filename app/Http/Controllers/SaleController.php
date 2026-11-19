<?php

namespace App\Http\Controllers;

use App\Actions\Sales\CancelSale;
use App\Http\Controllers\Admin\BusinessSettingsController;
use App\Models\Sale;
use App\Models\Setting;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\View\View;
use Inertia\Inertia;
use Inertia\Response;

class SaleController extends Controller
{
    public function index(Request $request): Response
    {
        $filters = $request->validate([
            'date' => ['nullable', 'date_format:Y-m-d'],
            'folio' => ['nullable', 'integer'],
        ]);

        $date = Carbon::parse($filters['date'] ?? today());
        $user = $request->user();

        $sales = Sale::query()
            ->with('user:id,name', 'authorizer:id,name', 'customer:id,name', 'payments:id,sale_id,method,amount')
            ->withCount('items')
            ->unless($user->can('sales.view_all'), fn ($q) => $q->where('user_id', $user->id))
            ->when(
                $filters['folio'] ?? null,
                fn ($q, $folio) => $q->where('folio', $folio),
                fn ($q) => $q->whereDate('created_at', $date),
            )
            ->latest('id')
            ->paginate(50)
            ->withQueryString();

        return Inertia::render('sales/index', [
            'sales' => $sales,
            'filters' => ['date' => $date->toDateString(), 'folio' => $filters['folio'] ?? null],
            'can' => ['cancel' => $user->can('sales.cancel')],
        ]);
    }

    /**
     * Ticket imprimible de 80 mm (vista Blade sin layout, se imprime con window.print()).
     */
    public function ticket(Request $request, Sale $sale): View
    {
        $this->ensureCanView($request, $sale);

        $sale->load('items', 'payments', 'user:id,name', 'customer:id,name', 'branch');

        return view('tickets.sale', [
            'sale' => $sale,
            'settings' => Setting::map(),
            'logoUrl' => BusinessSettingsController::logoUrl(),
            'autoprint' => $request->boolean('print', true),
        ]);
    }

    public function cancel(Request $request, Sale $sale, CancelSale $cancel): RedirectResponse
    {
        abort_unless($request->user()->can('sales.cancel'), 403);

        $data = $request->validate([
            'reason' => ['required', 'string', 'max:255'],
        ], attributes: ['reason' => 'motivo']);

        $cancel->handle($sale, $request->user(), $data['reason']);

        Inertia::flash('toast', ['type' => 'success', 'message' => "Venta {$sale->folio} cancelada."]);

        return back();
    }

    private function ensureCanView(Request $request, Sale $sale): void
    {
        abort_unless(
            $sale->user_id === $request->user()->id || $request->user()->can('sales.view_all'),
            403,
        );
    }
}
