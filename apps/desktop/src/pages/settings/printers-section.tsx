import {
  queryKeys,
  useApi,
  useApiMutation,
  useHasPermission,
  usePrinters,
  useTerminology,
} from '@karbon/client';
import {
  Permission,
  PrinterConnection,
  PrinterKind,
  PrinterPurpose,
  type PrinterDto,
} from '@karbon/types';
import {
  Badge,
  Button,
  Chip,
  type Column,
  DataTable,
  Dialog,
  DialogContent,
  Field,
  Input,
  notifyError,
  Select,
  Switch,
  toast,
} from '@karbon/ui';
import { useQuery } from '@tanstack/react-query';
import { PencilIcon, PlusIcon, PrinterIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { Section } from './section';

const CONNECTION_LABEL: Record<PrinterConnection, string> = {
  NETWORK: 'Red (IP)',
  SYSTEM: 'Impresora de Windows',
  USB: 'USB directo',
};

const PURPOSE_LABEL: Record<PrinterPurpose, string> = {
  RECEIPT: 'Caja (comprobantes)',
  KITCHEN: 'Comandas de cocina',
  BAR: 'Comandas de barra',
  DOCUMENT: 'Documentos A4',
};

export function PrintersSection() {
  const api = useApi();
  const printers = usePrinters();
  const canWrite = useHasPermission(Permission.SETTINGS_WRITE);
  const [editing, setEditing] = useState<{ printer: PrinterDto | null } | null>(null);
  const [removing, setRemoving] = useState<PrinterDto | null>(null);
  const test = useApiMutation((id: string) => api.settings.testPrinter(id), [], {
    onSuccess: () => toast.success('Página de prueba enviada'),
    onError: notifyError,
  });
  const remove = useApiMutation(
    (id: string) => api.settings.deletePrinter(id),
    [queryKeys.printers],
  );

  const columns: Column<PrinterDto>[] = [
    {
      key: 'name',
      header: 'Impresora',
      cell: (printer) => <span className="font-medium">{printer.name}</span>,
    },
    {
      key: 'connection',
      header: 'Conexión',
      cell: (printer) =>
        `${CONNECTION_LABEL[printer.connection]}${printer.address ? ` · ${printer.address}` : ''}`,
    },
    {
      key: 'paper',
      header: 'Papel',
      cell: (printer) =>
        printer.kind === PrinterKind.THERMAL
          ? `Térmica ${printer.paperWidthMm} mm`
          : 'Hoja carta/A4',
    },
    {
      key: 'purposes',
      header: 'Uso',
      cell: (printer) => (
        <span className="flex flex-wrap gap-1">
          {printer.purposes.map((purpose) => (
            <Badge key={purpose} variant="secondary">
              {PURPOSE_LABEL[purpose]}
            </Badge>
          ))}
          {printer.isActive ? null : <Badge variant="outline">Inactiva</Badge>}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (printer) =>
        canWrite ? (
          <span className="flex justify-end gap-1">
            {printer.connection === PrinterConnection.NETWORK ? (
              <Button
                variant="ghost"
                size="sm"
                aria-label="Imprimir prueba"
                disabled={test.isPending}
                onClick={() => {
                  test.mutate(printer.id);
                }}
              >
                <PrinterIcon />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              aria-label="Editar"
              onClick={() => {
                setEditing({ printer });
              }}
            >
              <PencilIcon />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Eliminar"
              onClick={() => {
                setRemoving(printer);
              }}
            >
              <Trash2Icon />
            </Button>
          </span>
        ) : null,
    },
  ];

  return (
    <Section
      title="Impresoras"
      description="Las de red imprimen ESC/POS directo desde el servidor (comandas automáticas). Las de Windows usan su controlador desde este equipo."
      actions={
        canWrite ? (
          <Button
            variant="outline"
            onClick={() => {
              setEditing({ printer: null });
            }}
          >
            <PlusIcon /> Agregar impresora
          </Button>
        ) : null
      }
    >
      <DataTable
        columns={columns}
        rows={printers.data ?? []}
        rowKey={(printer) => printer.id}
        empty={
          <p className="text-sm text-muted-foreground">
            Sin impresoras: los comprobantes se imprimen con el diálogo del sistema.
          </p>
        }
      />
      {editing ? (
        <PrinterDialog
          printer={editing.printer}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={`Eliminar ${removing?.name ?? ''}`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => remove.mutateAsync(removing?.id ?? '')}
      />
    </Section>
  );
}

function PrinterDialog({ printer, onClose }: { printer: PrinterDto | null; onClose: () => void }) {
  const api = useApi();
  const terms = useTerminology();
  const [name, setName] = useState(printer?.name ?? '');
  const [connection, setConnection] = useState<PrinterConnection>(
    printer?.connection ?? PrinterConnection.NETWORK,
  );
  const [address, setAddress] = useState(printer?.address ?? '');
  const [kind, setKind] = useState<PrinterKind>(printer?.kind ?? PrinterKind.THERMAL);
  const [paper, setPaper] = useState(String(printer?.paperWidthMm ?? 80));
  const [purposes, setPurposes] = useState<PrinterPurpose[]>(
    printer?.purposes ?? [PrinterPurpose.RECEIPT],
  );
  const [isActive, setIsActive] = useState(printer?.isActive ?? true);
  // Impresoras instaladas en Windows (solo dentro de la app de escritorio).
  const systemPrinters = useQuery({
    queryKey: ['system-printers'],
    queryFn: () => window.karbon?.listPrinters() ?? Promise.resolve([]),
    enabled: connection === PrinterConnection.SYSTEM && Boolean(window.karbon),
  });
  const availablePurposes = Object.values(PrinterPurpose).filter(
    (purpose) => terms.mode !== 'BAR' || purpose !== PrinterPurpose.KITCHEN,
  );

  const save = useApiMutation(
    () => {
      const body = {
        name: name.trim(),
        connection,
        kind,
        address: address.trim() || null,
        paperWidthMm: Number(paper),
        purposes,
      };
      return printer
        ? api.settings.updatePrinter(printer.id, { ...body, isActive })
        : api.settings.createPrinter(body);
    },
    [queryKeys.printers],
    {
      onSuccess: () => {
        toast.success('Impresora guardada');
        onClose();
      },
      onError: notifyError,
    },
  );
  const needsAddress = connection !== PrinterConnection.SYSTEM || !window.karbon;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        title={printer ? `Editar ${printer.name}` : 'Agregar impresora'}
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={
                name.trim().length < 2 ||
                purposes.length === 0 ||
                (connection === PrinterConnection.NETWORK && !address.trim()) ||
                save.isPending
              }
              onClick={() => {
                save.mutate(undefined);
              }}
            >
              Guardar
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre" className="col-span-2">
            {(id) => (
              <Input
                id={id}
                autoFocus
                placeholder="Ej. Caja principal"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            )}
          </Field>
          <Field label="Conexión">
            {(id) => (
              <Select
                id={id}
                value={connection}
                onChange={(event) => {
                  setConnection(event.target.value as PrinterConnection);
                }}
              >
                {Object.values(PrinterConnection).map((option) => (
                  <option key={option} value={option}>
                    {CONNECTION_LABEL[option]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {needsAddress ? (
            <Field
              label={connection === PrinterConnection.NETWORK ? 'IP:puerto' : 'Nombre o ruta'}
              hint={connection === PrinterConnection.NETWORK ? 'Ej. 192.168.1.50:9100' : undefined}
            >
              {(id) => (
                <Input
                  id={id}
                  value={address}
                  onChange={(event) => {
                    setAddress(event.target.value);
                  }}
                />
              )}
            </Field>
          ) : (
            <Field label="Impresora de Windows">
              {(id) => (
                <Select
                  id={id}
                  value={address}
                  onChange={(event) => {
                    setAddress(event.target.value);
                  }}
                >
                  <option value="">Predeterminada</option>
                  {(systemPrinters.data ?? []).map((option) => (
                    <option key={option.name} value={option.name}>
                      {option.displayName}
                      {option.isDefault ? ' (predeterminada)' : ''}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <Field label="Tipo">
            {(id) => (
              <Select
                id={id}
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value as PrinterKind);
                }}
              >
                <option value={PrinterKind.THERMAL}>Térmica (rollo)</option>
                <option value={PrinterKind.STANDARD}>Convencional (hoja)</option>
              </Select>
            )}
          </Field>
          {kind === PrinterKind.THERMAL ? (
            <Field label="Ancho del rollo">
              {(id) => (
                <Select
                  id={id}
                  value={paper}
                  onChange={(event) => {
                    setPaper(event.target.value);
                  }}
                >
                  <option value="80">80 mm</option>
                  <option value="58">58 mm</option>
                </Select>
              )}
            </Field>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Qué imprime</span>
          <div className="flex flex-wrap gap-2">
            {availablePurposes.map((purpose) => {
              const active = purposes.includes(purpose);
              return (
                <Chip
                  key={purpose}
                  active={active}
                  aria-pressed={active}
                  onClick={() => {
                    setPurposes(
                      active
                        ? purposes.filter((candidate) => candidate !== purpose)
                        : [...purposes, purpose],
                    );
                  }}
                >
                  {PURPOSE_LABEL[purpose]}
                </Chip>
              );
            })}
          </div>
        </div>
        {printer ? (
          <Switch checked={isActive} onCheckedChange={setIsActive} label="Activa" />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
