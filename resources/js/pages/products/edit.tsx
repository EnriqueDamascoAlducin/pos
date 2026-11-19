import { Head } from '@inertiajs/react';
import ProductController from '@/actions/App/Http/Controllers/ProductController';
import ProductForm from '@/components/products/product-form';
import type { Option, Unit, ValuedProduct } from '@/types/pos';

export default function ProductsEdit({
    product,
    categories,
    units,
}: {
    product: ValuedProduct;
    categories: Option[];
    units: Unit[];
}) {
    return (
        <>
            <Head title={`Editar ${product.name}`} />
            <div className="flex flex-1 flex-col gap-4 p-4">
                <h1 className="text-xl font-semibold">Editar producto</h1>
                <ProductForm
                    product={product}
                    categories={categories}
                    units={units}
                />
            </div>
        </>
    );
}

ProductsEdit.layout = {
    breadcrumbs: [
        { title: 'Productos', href: ProductController.index() },
        { title: 'Editar', href: '#' },
    ],
};
