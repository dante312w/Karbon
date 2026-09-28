import { BusinessMode, Permission } from '@karbon/types';
import type { Terminology } from '@karbon/utils';
import {
  BarChart3Icon,
  BookOpenIcon,
  ChefHatIcon,
  LayoutGridIcon,
  type LucideIcon,
  MartiniIcon,
  PackageIcon,
  ReceiptTextIcon,
  SettingsIcon,
  UsersIcon,
  WalletIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission: Permission;
}

/** Módulos en el orden del menú lateral: cada uno aparece solo con su permiso. */
const MODULES: readonly NavItem[] = [
  { to: '/mesas', label: 'Mesas', icon: LayoutGridIcon, permission: Permission.TABLES_READ },
  { to: '/pedidos', label: 'Pedidos', icon: ReceiptTextIcon, permission: Permission.ORDERS_READ },
  { to: '/kds', label: 'Cocina', icon: ChefHatIcon, permission: Permission.KITCHEN_READ },
  { to: '/caja', label: 'Caja', icon: WalletIcon, permission: Permission.CASH_READ },
  {
    to: '/inventario',
    label: 'Inventario',
    icon: PackageIcon,
    permission: Permission.INVENTORY_READ,
  },
  { to: '/catalogo', label: 'Catálogo', icon: BookOpenIcon, permission: Permission.CATALOG_WRITE },
  { to: '/clientes', label: 'Clientes', icon: UsersIcon, permission: Permission.CUSTOMERS_READ },
  { to: '/reportes', label: 'Reportes', icon: BarChart3Icon, permission: Permission.REPORTS_READ },
  {
    to: '/configuracion',
    label: 'Configuración',
    icon: SettingsIcon,
    permission: Permission.SETTINGS_READ,
  },
];

/** En modo bar la cocina se llama "Barra". */
export function navItems(terms: Terminology & { mode: BusinessMode }): NavItem[] {
  return MODULES.map((item) =>
    item.to === '/kds'
      ? {
          ...item,
          label: terms.prepArea,
          icon: terms.mode === BusinessMode.BAR ? MartiniIcon : ChefHatIcon,
        }
      : item,
  );
}

/** Primer módulo del menú al que tiene acceso el rol; `null` si no tiene ninguno. */
export function landingPath(permissions: readonly string[]): string | null {
  return MODULES.find((item) => permissions.includes(item.permission))?.to ?? null;
}
