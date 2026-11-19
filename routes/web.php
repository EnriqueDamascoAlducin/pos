<?php

use App\Http\Controllers\Admin\BranchController;
use App\Http\Controllers\Admin\BusinessSettingsController;
use App\Http\Controllers\Admin\CategoryController;
use App\Http\Controllers\Admin\UnitController;
use App\Http\Controllers\CashSessionController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\InventoryController;
use App\Http\Controllers\PosController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\PurchaseController;
use App\Http\Controllers\PurchaseImportController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\SaleController;
use App\Http\Controllers\SupplierController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

// Sin página pública: la raíz manda al sistema (o al login si no hay sesión).
Route::redirect('/', '/dashboard')->name('home');

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('dashboard', DashboardController::class)->name('dashboard');

    // Caja
    Route::middleware('can:cash.operate')->prefix('cash')->name('cash.')->group(function () {
        Route::get('open', [CashSessionController::class, 'create'])->name('open');
        Route::post('open', [CashSessionController::class, 'store'])->name('store');
        Route::get('current', [CashSessionController::class, 'current'])->name('current');
        Route::post('movements', [CashSessionController::class, 'movement'])->name('movements.store');
        Route::post('close', [CashSessionController::class, 'close'])->name('close');
    });
    Route::get('cash/sessions/{cashSession}', [CashSessionController::class, 'show'])->name('cash.show');

    // Punto de venta
    Route::middleware('can:sales.create')->group(function () {
        Route::get('pos', [PosController::class, 'index'])->name('pos.index');
        Route::get('pos/search', [PosController::class, 'search'])->name('pos.search');
        Route::post('pos', [PosController::class, 'store'])->name('pos.store');
        Route::post('pos/authorize', [PosController::class, 'authorizeAdjustments'])->name('pos.authorize');
    });

    // Ventas
    Route::get('sales', [SaleController::class, 'index'])->name('sales.index');
    Route::get('sales/{sale}/ticket', [SaleController::class, 'ticket'])->name('sales.ticket');
    Route::post('sales/{sale}/cancel', [SaleController::class, 'cancel'])->name('sales.cancel');

    // Administración
    Route::resource('products', ProductController::class)
        ->except('show')
        ->middleware('can:products.manage');

    // Clientes y crédito
    Route::get('customers', [CustomerController::class, 'index'])->name('customers.index');
    Route::get('customers/{customer}', [CustomerController::class, 'show'])->name('customers.show');
    Route::post('customers/{customer}/payments', [CustomerController::class, 'payment'])->name('customers.payments.store');
    Route::get('customer-payments/{payment}/receipt', [CustomerController::class, 'receipt'])->name('customers.payments.receipt');
    Route::middleware('can:customers.manage')->group(function () {
        Route::post('customers', [CustomerController::class, 'store'])->name('customers.store');
        Route::put('customers/{customer}', [CustomerController::class, 'update'])->name('customers.update');
    });

    // Compras y proveedores
    Route::middleware('can:purchases.manage')->group(function () {
        Route::resource('suppliers', SupplierController::class)->only(['index', 'store', 'update', 'destroy']);
        // Importar factura XML (CFDI): antes del resource para que "import" no se lea como {purchase}.
        Route::get('purchases/import', [PurchaseImportController::class, 'create'])->name('purchases.import.create');
        Route::post('purchases/import', [PurchaseImportController::class, 'upload'])->name('purchases.import.upload');
        Route::get('purchases/import/{token}', [PurchaseImportController::class, 'show'])->name('purchases.import.show');
        Route::post('purchases/import/{token}', [PurchaseImportController::class, 'store'])->name('purchases.import.store');

        Route::resource('purchases', PurchaseController::class)->only(['index', 'create', 'store', 'show']);
        Route::post('purchases/{purchase}/cancel', [PurchaseController::class, 'cancel'])->name('purchases.cancel');
    });

    // Inventario
    Route::get('inventory/search', [InventoryController::class, 'search'])->name('inventory.search');

    Route::middleware('can:inventory.adjust')->prefix('inventory')->name('inventory.')->group(function () {
        Route::get('/', [InventoryController::class, 'index'])->name('index');
        Route::post('{product}/adjust', [InventoryController::class, 'adjust'])->name('adjust');
        Route::get('{product}/kardex', [InventoryController::class, 'kardex'])->name('kardex');
    });

    // Configuración
    Route::prefix('admin')->name('admin.')->group(function () {
        Route::middleware('can:users.manage')->group(function () {
            Route::get('users', [UserController::class, 'index'])->name('users.index');
            Route::post('users', [UserController::class, 'store'])->name('users.store');
            Route::put('users/{user}', [UserController::class, 'update'])->name('users.update');
        });

        Route::middleware('can:settings.manage')->group(function () {
            Route::get('business', [BusinessSettingsController::class, 'edit'])->name('business.edit');
            Route::post('business', [BusinessSettingsController::class, 'update'])->name('business.update');

            Route::get('branches', [BranchController::class, 'index'])->name('branches.index');
            Route::post('branches', [BranchController::class, 'store'])->name('branches.store');
            Route::put('branches/{branch}', [BranchController::class, 'update'])->name('branches.update');
            Route::post('branches/{branch}/registers', [BranchController::class, 'storeRegister'])->name('registers.store');
            Route::put('registers/{register}', [BranchController::class, 'updateRegister'])->name('registers.update');

            Route::get('units', [UnitController::class, 'index'])->name('units.index');
            Route::post('units', [UnitController::class, 'store'])->name('units.store');
            Route::put('units/{unit}', [UnitController::class, 'update'])->name('units.update');
        });

        Route::resource('categories', CategoryController::class)
            ->only(['index', 'store', 'update', 'destroy'])
            ->middleware('can:products.manage');
    });

    // Reportes
    Route::middleware('can:reports.view')->prefix('reports')->name('reports.')->group(function () {
        Route::get('inventory-value', [ReportController::class, 'inventoryValue'])->name('inventory-value');
        Route::get('sales', [ReportController::class, 'sales'])->name('sales');
        Route::get('sales/export', [ReportController::class, 'exportSales'])->name('sales.export');
        Route::get('cash-sessions', [ReportController::class, 'cashSessions'])->name('cash-sessions');
    });
});

require __DIR__.'/settings.php';
