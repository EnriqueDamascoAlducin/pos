<?php

namespace App\Http\Controllers;

use App\Actions\Cash\CalculateCashSessionSummary;
use App\Actions\Cash\CloseCashSession;
use App\Actions\Cash\OpenCashSession;
use App\Actions\Cash\RegisterCashMovement;
use App\Models\CashMovement;
use App\Models\CashRegister;
use App\Models\CashSession;
use App\Models\Setting;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class CashSessionController extends Controller
{
    /**
     * Pantalla para abrir turno.
     */
    public function create(Request $request): Response|RedirectResponse
    {
        if ($request->user()->openCashSession()) {
            return to_route('pos.index');
        }

        $registers = CashRegister::query()
            ->where('active', true)
            ->when($request->user()->branch_id, fn ($q, $branchId) => $q->where('branch_id', $branchId))
            ->with('branch:id,name', 'openSession.user:id,name')
            ->orderBy('name')
            ->get()
            ->map(fn (CashRegister $r) => [
                'id' => $r->id,
                'name' => $r->name,
                'branch' => $r->branch->name,
                'busy_by' => $r->openSession?->user->name,
            ]);

        return Inertia::render('cash/open', ['registers' => $registers]);
    }

    public function store(Request $request, OpenCashSession $open): RedirectResponse
    {
        $data = $request->validate([
            'cash_register_id' => ['required', Rule::exists('cash_registers', 'id')->where('active', true)],
            'opening_amount' => ['required', 'numeric', 'min:0'],
        ], attributes: ['cash_register_id' => 'caja', 'opening_amount' => 'fondo inicial']);

        $open->handle(
            CashRegister::findOrFail($data['cash_register_id']),
            $request->user(),
            (string) $data['opening_amount'],
        );

        Inertia::flash('toast', ['type' => 'success', 'message' => 'Turno abierto.']);

        return to_route('pos.index');
    }

    /**
     * Turno actual: resumen en vivo, movimientos de efectivo y formulario de corte.
     */
    public function current(Request $request, CalculateCashSessionSummary $summary): Response|RedirectResponse
    {
        $session = $request->user()->openCashSession();

        if (! $session) {
            return to_route('cash.open');
        }

        return Inertia::render('cash/current', [
            'session' => $this->sessionData($session),
            'summary' => $summary->handle($session),
            'movements' => $session->movements()->latest()->get(['id', 'type', 'amount', 'reason', 'created_at']),
        ]);
    }

    public function movement(Request $request, RegisterCashMovement $register): RedirectResponse
    {
        abort_unless($request->user()->can('cash.movements'), 403);

        $data = $request->validate([
            'type' => ['required', Rule::in([CashMovement::TYPE_IN, CashMovement::TYPE_OUT])],
            'amount' => ['required', 'numeric', 'gt:0'],
            'reason' => ['required', 'string', 'max:255'],
        ], attributes: ['amount' => 'monto', 'reason' => 'motivo']);

        $session = $request->user()->openCashSession() ?? abort(409, 'No tienes un turno abierto.');

        $register->handle($session, $request->user(), $data['type'], (string) $data['amount'], $data['reason']);

        Inertia::flash('toast', ['type' => 'success', 'message' => 'Movimiento registrado.']);

        return back();
    }

    public function close(Request $request, CloseCashSession $close): RedirectResponse
    {
        $data = $request->validate([
            'counted_amount' => ['required', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ], attributes: ['counted_amount' => 'efectivo contado']);

        $session = $request->user()->openCashSession() ?? abort(409, 'No tienes un turno abierto.');

        $session = $close->handle($session, (string) $data['counted_amount'], $data['notes'] ?? null);

        return to_route('cash.show', $session);
    }

    /**
     * Corte de caja de un turno (para consultar o imprimir).
     */
    public function show(Request $request, CashSession $cashSession, CalculateCashSessionSummary $summary): Response
    {
        abort_unless(
            $cashSession->user_id === $request->user()->id || $request->user()->can('reports.view'),
            403,
        );

        $cashSession->load('cashRegister', 'user:id,name');

        return Inertia::render('cash/show', [
            'session' => $this->sessionData($cashSession),
            'summary' => $summary->handle($cashSession),
            'movements' => $cashSession->movements()->latest()->get(['id', 'type', 'amount', 'reason', 'created_at']),
            'businessName' => Setting::get('business_name', config('app.name')),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function sessionData(CashSession $session): array
    {
        return [
            'id' => $session->id,
            'register' => $session->cashRegister->name,
            'user' => $session->user?->name,
            'opened_at' => $session->opened_at,
            'closed_at' => $session->closed_at,
            'opening_amount' => (string) $session->opening_amount,
            'expected_amount' => $session->expected_amount !== null ? (string) $session->expected_amount : null,
            'counted_amount' => $session->counted_amount !== null ? (string) $session->counted_amount : null,
            'difference' => $session->difference !== null ? (string) $session->difference : null,
            'notes' => $session->notes,
        ];
    }
}
