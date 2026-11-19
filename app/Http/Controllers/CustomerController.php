<?php

namespace App\Http\Controllers;

use App\Actions\Customers\RegisterCustomerPayment;
use App\Enums\PaymentMethod;
use App\Http\Controllers\Admin\BusinessSettingsController;
use App\Models\Customer;
use App\Models\CustomerPayment;
use App\Models\Setting;
use App\Queries\CustomerStatement;
use App\Support\Decimal;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\View\View;
use Inertia\Inertia;
use Inertia\Response;

class CustomerController extends Controller
{
    public function index(Request $request): Response
    {
        $this->ensureCanView($request);

        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'with_balance' => ['nullable', 'boolean'],
        ]);

        return Inertia::render('customers/index', [
            'customers' => Customer::query()
                ->when($filters['search'] ?? null, fn ($q, $s) => $q->where(fn ($q) => $q
                    ->where('name', 'like', "%{$s}%")
                    ->orWhere('phone', 'like', "%{$s}%")))
                ->when($filters['with_balance'] ?? false, fn ($q) => $q->where('balance', '>', 0))
                ->orderByDesc('active')
                ->orderBy('name')
                ->paginate(50)
                ->withQueryString(),
            'receivable' => self::receivableTotal(),
            'filters' => $filters,
            'can' => ['manage' => $request->user()->can('customers.manage')],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $customer = Customer::create($this->validated($request));

        Inertia::flash('toast', ['type' => 'success', 'message' => "Cliente {$customer->name} registrado."]);

        return back();
    }

    public function update(Request $request, Customer $customer): RedirectResponse
    {
        $data = $this->validated($request, $customer);

        if (Decimal::lt((string) $data['credit_limit'], (string) $customer->balance) && Decimal::gt((string) $customer->balance, '0')) {
            Inertia::flash('toast', [
                'type' => 'warning',
                'message' => 'El nuevo límite es menor a lo que ya debe; no podrá comprar más a crédito hasta que abone.',
            ]);
        } else {
            Inertia::flash('toast', ['type' => 'success', 'message' => 'Cliente actualizado.']);
        }

        $customer->update($data);

        return back();
    }

    /**
     * Estado de cuenta del cliente.
     */
    public function show(Request $request, Customer $customer, CustomerStatement $statement): Response
    {
        $this->ensureCanView($request);

        return Inertia::render('customers/show', [
            'customer' => [
                ...$customer->only(['id', 'name', 'phone', 'email', 'address', 'active']),
                'credit_limit' => (string) $customer->credit_limit,
                'balance' => (string) $customer->balance,
                'available_credit' => $customer->availableCredit(),
            ],
            'movements' => array_reverse($statement->handle($customer)),
            'hasOpenSession' => $request->user()->openCashSession() !== null,
            'can' => [
                'manage' => $request->user()->can('customers.manage'),
                'payment' => $request->user()->can('customers.credit'),
            ],
        ]);
    }

    public function payment(Request $request, Customer $customer, RegisterCustomerPayment $register): RedirectResponse
    {
        abort_unless($request->user()->can('customers.credit'), 403);

        $data = $request->validate([
            'method' => ['required', Rule::in([PaymentMethod::Cash->value, PaymentMethod::Card->value, PaymentMethod::Transfer->value])],
            'amount' => ['required', 'numeric', 'gt:0'],
            'reference' => ['nullable', 'string', 'max:100'],
        ], attributes: ['method' => 'forma de pago', 'amount' => 'monto', 'reference' => 'referencia']);

        $payment = $register->handle(
            $customer,
            $request->user(),
            PaymentMethod::from($data['method']),
            (string) $data['amount'],
            $data['reference'] ?? null,
        );

        Inertia::flash('payment', ['id' => $payment->id]);
        Inertia::flash('toast', ['type' => 'success', 'message' => 'Abono registrado.']);

        return back();
    }

    /**
     * Recibo imprimible del abono (80 mm).
     */
    public function receipt(Request $request, CustomerPayment $payment): View
    {
        $this->ensureCanView($request);

        $payment->load('customer', 'user:id,name');

        return view('tickets.payment', [
            'payment' => $payment,
            'settings' => Setting::map(),
            'logoUrl' => BusinessSettingsController::logoUrl(),
            'autoprint' => $request->boolean('print', true),
        ]);
    }

    public static function receivableTotal(): array
    {
        return [
            'total' => Decimal::round((string) Customer::query()->where('balance', '>', 0)->sum('balance')),
            'customers' => Customer::query()->where('balance', '>', 0)->count(),
        ];
    }

    private function ensureCanView(Request $request): void
    {
        abort_unless($request->user()->canAny(['customers.manage', 'customers.credit']), 403);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?Customer $customer = null): array
    {
        $request->merge(['active' => $request->boolean('active', true)]);

        return $request->validate([
            'name' => ['required', 'string', 'max:255', Rule::unique('customers')->ignore($customer)->whereNull('deleted_at')],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            'address' => ['nullable', 'string', 'max:255'],
            'credit_limit' => ['required', 'numeric', 'min:0', 'max:99999999'],
            'active' => ['boolean'],
        ], attributes: [
            'name' => 'nombre',
            'phone' => 'teléfono',
            'email' => 'correo',
            'address' => 'dirección',
            'credit_limit' => 'límite de crédito',
        ]);
    }
}
