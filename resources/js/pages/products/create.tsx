import { Head } from '@inertiajs/react';
import ProductController from '@/actions/App/Http/Controllers/ProductController';
import ProductForm from '@/components/products/product-form';
import type { Option, Unit } from '@/types/pos';

export default function ProductsCreate({
    categories,
    units,
    defaultTaxRate,
}: {
    categories: Option[];
    units: Unit[];
    defaultTaxRate: string;
}) {
    return (
        <>
            <Head title="Nuevo producto" />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <h1 className="text-xl font-semibold">Nuevo producto</h1>
                <ProductForm
                    categories={categories}
                    units={units}
                    defaultTaxRate={defaultTaxRate}
                />
            </div>
        </>
    );
}

ProductsCreate.layout = {
    breadcrumbs: [
        { title: 'Productos', href: ProductController.index() },
        { title: 'Nuevo', href: ProductController.create() },
    ],
};
