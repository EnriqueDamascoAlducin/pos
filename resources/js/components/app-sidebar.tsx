import { Link, usePage } from '@inertiajs/react';
import {
    Boxes,
    Building2,
    Calculator,
    ChartColumn,
    Contact,
    LayoutGrid,
    Package,
    Ruler,
    Receipt,
    Settings,
    ShoppingCart,
    Tags,
    Truck,
    UserCog,
    Users,
    Wallet,
    Warehouse,
} from 'lucide-react';
import BranchController from '@/actions/App/Http/Controllers/Admin/BranchController';
import BusinessSettingsController from '@/actions/App/Http/Controllers/Admin/BusinessSettingsController';
import CategoryController from '@/actions/App/Http/Controllers/Admin/CategoryController';
import UnitController from '@/actions/App/Http/Controllers/Admin/UnitController';
import CashSessionController from '@/actions/App/Http/Controllers/CashSessionController';
import CustomerController from '@/actions/App/Http/Controllers/CustomerController';
import InventoryController from '@/actions/App/Http/Controllers/InventoryController';
import PosController from '@/actions/App/Http/Controllers/PosController';
import ProductController from '@/actions/App/Http/Controllers/ProductController';
import PurchaseController from '@/actions/App/Http/Controllers/PurchaseController';
import ReportController from '@/actions/App/Http/Controllers/ReportController';
import SaleController from '@/actions/App/Http/Controllers/SaleController';
import SupplierController from '@/actions/App/Http/Controllers/SupplierController';
import UserController from '@/actions/App/Http/Controllers/UserController';
import AppLogo from '@/components/app-logo';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { dashboard } from '@/routes';
import type { NavItem } from '@/types';

type GuardedNavItem = NavItem & { permission?: string };

const sections: { label: string; items: GuardedNavItem[] }[] = [
    {
        label: 'Operación',
        items: [
            { title: 'Inicio', href: dashboard(), icon: LayoutGrid },
            {
                title: 'Vender',
                href: PosController.index(),
                icon: ShoppingCart,
                permission: 'sales.create',
            },
            {
                title: 'Caja',
                href: CashSessionController.current(),
                icon: Wallet,
                permission: 'cash.operate',
            },
            { title: 'Ventas', href: SaleController.index(), icon: Receipt },
            {
                title: 'Clientes',
                href: CustomerController.index(),
                icon: Contact,
                permission: 'customers.credit',
            },
        ],
    },
    {
        label: 'Inventario',
        items: [
            {
                title: 'Productos',
                href: ProductController.index(),
                icon: Package,
                permission: 'products.manage',
            },
            {
                title: 'Existencias',
                href: InventoryController.index(),
                icon: Boxes,
                permission: 'inventory.adjust',
            },
            {
                title: 'Compras',
                href: PurchaseController.index(),
                icon: Truck,
                permission: 'purchases.manage',
            },
            {
                title: 'Proveedores',
                href: SupplierController.index(),
                icon: Users,
                permission: 'purchases.manage',
            },
        ],
    },
    {
        label: 'Reportes',
        items: [
            {
                title: 'Ventas y utilidad',
                href: ReportController.sales(),
                icon: ChartColumn,
                permission: 'reports.view',
            },
            {
                title: 'Cortes de caja',
                href: ReportController.cashSessions(),
                icon: Calculator,
                permission: 'reports.view',
            },
            {
                title: 'Valor de inventario',
                href: ReportController.inventoryValue(),
                icon: Warehouse,
                permission: 'reports.view',
            },
        ],
    },
    {
        label: 'Configuración',
        items: [
            {
                title: 'Categorías',
                href: CategoryController.index(),
                icon: Tags,
                permission: 'products.manage',
            },
            {
                title: 'Usuarios',
                href: UserController.index(),
                icon: UserCog,
                permission: 'users.manage',
            },
            {
                title: 'Datos del negocio',
                href: BusinessSettingsController.edit(),
                icon: Settings,
                permission: 'settings.manage',
            },
            {
                title: 'Sucursales y cajas',
                href: BranchController.index(),
                icon: Building2,
                permission: 'settings.manage',
            },
            {
                title: 'Unidades',
                href: UnitController.index(),
                icon: Ruler,
                permission: 'settings.manage',
            },
        ],
    },
];

export function AppSidebar() {
    const { auth } = usePage().props;
    const allowed = (item: GuardedNavItem) =>
        !item.permission || auth.permissions.includes(item.permission);

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link href={dashboard()} prefetch>
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                {sections.map((section) => (
                    <NavMain
                        key={section.label}
                        label={section.label}
                        items={section.items.filter(allowed)}
                    />
                ))}
            </SidebarContent>

            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
