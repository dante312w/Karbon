import { Permission } from '@karbon/types';

/** Permisos agrupados por módulo con su descripción, para el editor de roles. */
export const PERMISSION_GROUPS: readonly {
  title: string;
  permissions: readonly { permission: Permission; label: string }[];
}[] = [
  {
    title: 'Administración',
    permissions: [
      { permission: Permission.USERS_READ, label: 'Ver usuarios' },
      { permission: Permission.USERS_WRITE, label: 'Crear y editar usuarios' },
      { permission: Permission.ROLES_READ, label: 'Ver roles' },
      { permission: Permission.ROLES_WRITE, label: 'Crear y editar roles' },
      { permission: Permission.SETTINGS_READ, label: 'Ver configuración' },
      { permission: Permission.SETTINGS_WRITE, label: 'Cambiar configuración' },
      { permission: Permission.AUDIT_READ, label: 'Ver auditoría' },
    ],
  },
  {
    title: 'Salón',
    permissions: [
      { permission: Permission.TABLES_READ, label: 'Ver mesas' },
      { permission: Permission.TABLES_WRITE, label: 'Diseñar salón (áreas y mesas)' },
      { permission: Permission.TABLES_OPERATE, label: 'Mover, unir y liberar mesas' },
      { permission: Permission.RESERVATIONS_READ, label: 'Ver reservas' },
      { permission: Permission.RESERVATIONS_WRITE, label: 'Gestionar reservas' },
    ],
  },
  {
    title: 'Pedidos',
    permissions: [
      { permission: Permission.CATALOG_READ, label: 'Ver catálogo' },
      { permission: Permission.CATALOG_WRITE, label: 'Editar catálogo y recetas' },
      { permission: Permission.ORDERS_READ, label: 'Ver pedidos' },
      { permission: Permission.ORDERS_CREATE, label: 'Tomar pedidos' },
      { permission: Permission.ORDERS_UPDATE, label: 'Modificar pedidos' },
      { permission: Permission.ORDERS_SEND, label: 'Enviar a cocina / barra' },
      { permission: Permission.ORDERS_REQUEST_BILL, label: 'Pedir la cuenta' },
      {
        permission: Permission.ORDERS_CANCEL,
        label: 'Anular productos enviados y cancelar pedidos',
      },
      { permission: Permission.ORDERS_DISCOUNT, label: 'Aplicar descuentos' },
    ],
  },
  {
    title: 'Cocina / barra',
    permissions: [
      { permission: Permission.KITCHEN_READ, label: 'Ver tablero de comandas' },
      {
        permission: Permission.KITCHEN_UPDATE,
        label: 'Cambiar estado de comandas y agotar productos',
      },
    ],
  },
  {
    title: 'Caja',
    permissions: [
      { permission: Permission.PAYMENTS_CREATE, label: 'Cobrar' },
      { permission: Permission.PAYMENTS_VOID, label: 'Anular pagos' },
      { permission: Permission.CASH_READ, label: 'Ver caja' },
      { permission: Permission.CASH_OPEN, label: 'Abrir caja' },
      { permission: Permission.CASH_CLOSE, label: 'Cerrar caja' },
      { permission: Permission.CASH_MOVEMENTS, label: 'Ingresos y retiros de efectivo' },
      { permission: Permission.EXPENSES_WRITE, label: 'Registrar gastos' },
      { permission: Permission.INVOICES_ISSUE, label: 'Emitir facturas y tiquetes' },
      { permission: Permission.INVOICES_VOID, label: 'Anular facturas' },
    ],
  },
  {
    title: 'Inventario',
    permissions: [
      { permission: Permission.INVENTORY_READ, label: 'Ver inventario' },
      { permission: Permission.INVENTORY_WRITE, label: 'Movimientos e insumos' },
      { permission: Permission.SUPPLIERS_READ, label: 'Ver proveedores' },
      { permission: Permission.SUPPLIERS_WRITE, label: 'Editar proveedores' },
      { permission: Permission.PURCHASES_READ, label: 'Ver compras' },
      { permission: Permission.PURCHASES_WRITE, label: 'Registrar compras' },
    ],
  },
  {
    title: 'Clientes y reportes',
    permissions: [
      { permission: Permission.CUSTOMERS_READ, label: 'Ver clientes' },
      { permission: Permission.CUSTOMERS_WRITE, label: 'Editar clientes' },
      { permission: Permission.REPORTS_READ, label: 'Ver reportes' },
    ],
  },
];
