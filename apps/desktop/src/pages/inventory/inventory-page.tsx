import { queryKeys, useApi, useHasPermission, useSettings } from '@karbon/client';
import { Permission } from '@karbon/types';
import { PageHeader, StatCard, Tabs, TabsContent, TabsList, TabsTrigger } from '@karbon/ui';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangleIcon, BoxesIcon, CoinsIcon } from 'lucide-react';
import { formatMajor } from '../../lib/format';
import { IngredientsTab } from './ingredients-tab';
import { MovementsTable } from './movements-tab';
import { PurchasesTab } from './purchases-tab';
import { SuppliersTab } from './suppliers-tab';

export default function InventoryPage() {
  const api = useApi();
  const currency = useSettings().data?.currency ?? 'COP';
  const canPurchases = useHasPermission(Permission.PURCHASES_READ);
  const canSuppliers = useHasPermission(Permission.SUPPLIERS_READ);
  const ingredients = useQuery({
    queryKey: [...queryKeys.ingredients, 'summary'],
    queryFn: () => api.inventory.ingredients(),
  });
  const alerts = useQuery({ queryKey: queryKeys.inventoryAlerts, queryFn: api.inventory.alerts });
  const list = ingredients.data ?? [];
  const value = list.reduce(
    (sum, ingredient) => sum + ingredient.stock * ingredient.averageCost,
    0,
  );

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Inventario"
        description="Se descuenta automáticamente por receta al cobrar cada pedido."
      />
      <div className="grid grid-cols-1 gap-3 px-5 pt-5 sm:grid-cols-3">
        <StatCard label="Insumos activos" value={list.length} icon={BoxesIcon} />
        <StatCard
          label="Valor del inventario"
          value={formatMajor(value, currency)}
          icon={CoinsIcon}
          hint="Existencia × costo promedio"
        />
        <StatCard
          label="Bajo mínimo"
          value={alerts.data?.length ?? 0}
          icon={AlertTriangleIcon}
          tone={(alerts.data?.length ?? 0) > 0 ? 'negative' : 'positive'}
          hint={
            (alerts.data ?? [])
              .slice(0, 3)
              .map((alert) => alert.name)
              .join(', ') || 'Todo en orden'
          }
        />
      </div>
      <Tabs defaultValue="insumos" className="flex flex-col gap-4 p-5">
        <TabsList className="self-start">
          <TabsTrigger value="insumos">Insumos</TabsTrigger>
          <TabsTrigger value="kardex">Kardex</TabsTrigger>
          {canPurchases ? <TabsTrigger value="compras">Compras</TabsTrigger> : null}
          {canSuppliers ? <TabsTrigger value="proveedores">Proveedores</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="insumos">
          <IngredientsTab />
        </TabsContent>
        <TabsContent value="kardex">
          <MovementsTable />
        </TabsContent>
        {canPurchases ? (
          <TabsContent value="compras">
            <PurchasesTab />
          </TabsContent>
        ) : null}
        {canSuppliers ? (
          <TabsContent value="proveedores">
            <SuppliersTab />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
