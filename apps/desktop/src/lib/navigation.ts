import { Permission } from '@karbon/types';
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

/** Menú lateral: cada entrada aparece solo con su permiso. La cocina se llama barra en modo bar. */
export function navItems(terms: Terminology & { mode: 'RESTAURANT' | 'BAR' }): NavItem[] {
  return [
    { to: '/mesas', label: 'Mesas', icon: LayoutGridIcon, permission: Permission.TABLES_READ },
    { to: '/pedidos', label: 'Pedidos', icon: ReceiptTextIcon, permission: Permission.ORDERS_READ },
    {
      to: '/kds',
      label: terms.prepArea,
      icon: terms.mode === 'BAR' ? MartiniIcon : ChefHatIcon,
      permission: Permission.KITCHEN_READ,
    },
    { to: '/caja', label: 'Caja', icon: WalletIcon, permission: Permission.CASH_READ },
    {
      to: '/inventario',
      label: 'Inventario',
      icon: PackageIcon,
      permission: Permission.INVENTORY_READ,
    },
    {
      to: '/catalogo',
      label: 'Catálogo',
      icon: BookOpenIcon,
      permission: Permission.CATALOG_WRITE,
    },
    { to: '/clientes', label: 'Clientes', icon: UsersIcon, permission: Permission.CUSTOMERS_READ },
    {
      to: '/reportes',
      label: 'Reportes',
      icon: BarChart3Icon,
      permission: Permission.REPORTS_READ,
    },
    {
      to: '/configuracion',
      label: 'Configuración',
      icon: SettingsIcon,
      permission: Permission.SETTINGS_READ,
    },
  ];
}

/** Pantalla inicial según el rol: cocina/barra va directo al KDS. */
export function landingPath(permissions: readonly string[]): string {
  if (permissions.includes(Permission.TABLES_READ)) return '/mesas';
  if (permissions.includes(Permission.KITCHEN_READ)) return '/kds';
  if (permissions.includes(Permission.CASH_READ)) return '/caja';
  if (permissions.includes(Permission.REPORTS_READ)) return '/reportes';
  return '/ingresar';
}
