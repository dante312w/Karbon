import { useHasPermission } from '@karbon/client';
import { Permission } from '@karbon/types';
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@karbon/ui';
import type { ReactNode } from 'react';
import { AuditSection } from './audit-section';
import { BusinessSection } from './business-section';
import { ConnectionSection } from './connection-section';
import { FloorSection } from './floor-section';
import { NumberingSection } from './numbering-section';
import { PrintersSection } from './printers-section';
import { SystemSection } from './system-section';
import { TaxesSection } from './taxes-section';
import { UsersSection } from './users-section';

interface Tab {
  value: string;
  label: string;
  visible: boolean;
  content: ReactNode;
}

export default function SettingsPage() {
  const canUsers = useHasPermission(Permission.USERS_READ);
  const canTables = useHasPermission(Permission.TABLES_WRITE);
  const canAudit = useHasPermission(Permission.AUDIT_READ);
  const tabs: Tab[] = [
    { value: 'negocio', label: 'Negocio', visible: true, content: <BusinessSection /> },
    { value: 'salon', label: 'Salón', visible: canTables, content: <FloorSection /> },
    { value: 'usuarios', label: 'Usuarios', visible: canUsers, content: <UsersSection /> },
    { value: 'impuestos', label: 'Impuestos', visible: true, content: <TaxesSection /> },
    { value: 'impresoras', label: 'Impresoras', visible: true, content: <PrintersSection /> },
    { value: 'facturacion', label: 'Facturación', visible: true, content: <NumberingSection /> },
    { value: 'conexion', label: 'Celulares', visible: true, content: <ConnectionSection /> },
    { value: 'sistema', label: 'Sistema', visible: true, content: <SystemSection /> },
    { value: 'auditoria', label: 'Auditoría', visible: canAudit, content: <AuditSection /> },
  ].filter((tab) => tab.visible);

  return (
    <div className="flex flex-col">
      <PageHeader title="Configuración" />
      <Tabs defaultValue="negocio" className="flex flex-col gap-4 p-5">
        <TabsList className="flex-wrap self-start">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value}>
            {tab.content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
