<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Category;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class CategoryController extends Controller
{
    public function index(): Response
    {
        return Inertia::render('admin/categories', [
            'categories' => Category::withCount('products')->orderBy('name')->get(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        Category::create($this->validated($request));

        Inertia::flash('toast', ['type' => 'success', 'message' => 'Categoría creada.']);

        return back();
    }

    public function update(Request $request, Category $category): RedirectResponse
    {
        $category->update($this->validated($request, $category));

        Inertia::flash('toast', ['type' => 'success', 'message' => 'Categoría actualizada.']);

        return back();
    }

    /**
     * Los productos de la categoría quedan "Sin categoría" (la llave foránea es nullOnDelete).
     */
    public function destroy(Category $category): RedirectResponse
    {
        $category->delete();

        Inertia::flash('toast', ['type' => 'success', 'message' => 'Categoría eliminada.']);

        return back();
    }

    /**
     * @return array{name: string}
     */
    private function validated(Request $request, ?Category $category = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:100', Rule::unique('categories')->ignore($category)],
        ], attributes: ['name' => 'nombre']);
    }
}
