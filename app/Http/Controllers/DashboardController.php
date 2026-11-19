<?php

namespace App\Http\Controllers;

use App\Queries\InventoryValuation;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function __invoke(Request $request): Response
    {
        $user = $request->user();

        return Inertia::render('dashboard', [
            'inventory' => $user->can('reports.view')
                ? (new InventoryValuation)->totals()
                : null,
            'receivable' => $user->can('reports.view')
                ? CustomerController::receivableTotal()
                : null,
            'lowStockCount' => $user->can('inventory.adjust')
                ? InventoryController::lowStockCount($user->currentBranchId())
                : null,
        ]);
    }
}
