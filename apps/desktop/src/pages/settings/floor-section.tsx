import { queryKeys, useApi, useApiMutation, useHasPermission } from '@karbon/client';
import {
  type AreaDto,
  type FloorElementDto,
  FloorElementKind,
  Permission,
  type TableDto,
  TableShape,
} from '@karbon/types';
import {
  Button,
  Chip,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Input,
  notifyError,
  Select,
  Switch,
  toast,
  useNow,
} from '@karbon/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutGridIcon, MapPinnedIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '../../components/confirm-dialog';
import { blocks, freePosition, type GridBox } from '../tables/floor-geometry';
import { ELEMENT_LABEL } from '../tables/floor-labels';
import { FloorPlan } from '../tables/floor-plan';
import { Section } from './section';

const SHAPE_LABEL: Record<TableShape, string> = {
  SQUARE: 'Cuadrada',
  ROUND: 'Redonda',
  RECTANGLE: 'Rectangular',
};
const AREAS_KEY = [...queryKeys.areas, 'all'];
const TABLES_KEY = [...queryKeys.tables, 'all'];

type Position = Pick<GridBox, 'posX' | 'posY'>;

interface PlanItem extends GridBox {
  id: string;
  kind: FloorElementKind | 'TABLE';
}

/**
 * Ubicación al guardar desde un diálogo (la posición se cambia arrastrando en el plano): lo nuevo
 * va al primer lugar vacío del área; lo existente conserva su lugar salvo que con su tamaño nuevo
 * se encime a otra cosa.
 */
type Placer = (
  areaId: string,
  item: Pick<PlanItem, 'kind' | 'width' | 'height'> &
    Partial<Pick<PlanItem, 'id' | 'posX' | 'posY'>>,
) => Position;

/** Movimientos del editor: se ven al instante y se corrigen si el servidor los rechaza. */
function useFloorMoves() {
  const api = useApi();
  const queryClient = useQueryClient();
  const rollback = (error: Error): void => {
    notifyError(error);
    void queryClient.invalidateQueries({ queryKey: queryKeys.tables });
    void queryClient.invalidateQueries({ queryKey: queryKeys.areas });
  };
  const moveTable = useApiMutation(
    ({ id, position }: { id: string; position: Position }) => api.floor.updateTable(id, position),
    [queryKeys.tables],
    {
      onMutate: ({ id, position }) => {
        queryClient.setQueryData<TableDto[]>(TABLES_KEY, (current) =>
          current?.map((table) => (table.id === id ? { ...table, ...position } : table)),
        );
      },
      onError: rollback,
    },
  );
  const moveElement = useApiMutation(
    ({ id, position }: { id: string; position: Position }) => api.floor.updateElement(id, position),
    [queryKeys.areas],
    {
      onMutate: ({ id, position }) => {
        queryClient.setQueryData<AreaDto[]>(AREAS_KEY, (current) =>
          current?.map((area) => ({
            ...area,
            elements: area.elements.map((element) =>
              element.id === id ? { ...element, ...position } : element,
            ),
          })),
        );
      },
      onError: rollback,
    },
  );
  return { moveTable, moveElement };
}

export function FloorSection() {
  const api = useApi();
  const canWrite = useHasPermission(Permission.TABLES_WRITE);
  const now = useNow(60_000);
  const areas = useQuery({ queryKey: AREAS_KEY, queryFn: api.floor.areas });
  const tables = useQuery({
    queryKey: TABLES_KEY,
    queryFn: () => api.floor.tables({ includeInactive: true }),
  });
  const { moveTable, moveElement } = useFloorMoves();
  const [areaId, setAreaId] = useState<string | null>(null);
  const [editingArea, setEditingArea] = useState<{ area: AreaDto | null } | null>(null);
  const [editingTable, setEditingTable] = useState<{ table: TableDto | null } | null>(null);
  const [editingElement, setEditingElement] = useState<{
    element: FloorElementDto | null;
  } | null>(null);
  const sortedAreas = [...(areas.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const area = sortedAreas.find((candidate) => candidate.id === areaId) ?? sortedAreas[0] ?? null;
  const areaTables = (tables.data ?? []).filter((table) => table.areaId === area?.id);
  const areaElements = area?.elements ?? [];

  const place: Placer = (targetAreaId, item) => {
    const others: PlanItem[] = [
      ...(tables.data ?? [])
        .filter((table) => table.areaId === targetAreaId)
        .map((table) => ({ ...table, kind: 'TABLE' as const })),
      ...(sortedAreas.find((candidate) => candidate.id === targetAreaId)?.elements ?? []),
    ].filter((other) => other.id !== item.id);
    if (item.posX === undefined || item.posY === undefined) return freePosition(item, others);
    const blocking = blocks(item.kind) ? others.filter((other) => blocks(other.kind)) : [];
    return freePosition(item, blocking, { posX: item.posX, posY: item.posY });
  };

  return (
    <Section
      title="Salón"
      description="El plano de cada área tal como está el local: lo ven la caja y el tablero de mesas."
      actions={
        canWrite ? (
          <>
            <Button
              variant="outline"
              onClick={() => {
                setEditingArea({ area: null });
              }}
            >
              <PlusIcon /> Área
            </Button>
            <Button
              variant="outline"
              disabled={!area}
              onClick={() => {
                setEditingElement({ element: null });
              }}
            >
              <MapPinnedIcon /> Elemento
            </Button>
            <Button
              disabled={!area}
              onClick={() => {
                setEditingTable({ table: null });
              }}
            >
              <PlusIcon /> Mesa
            </Button>
          </>
        ) : null
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        {sortedAreas.map((candidate) => (
          <span key={candidate.id} className="flex items-center">
            <Chip
              active={candidate.id === area?.id}
              className={candidate.isActive ? '' : 'line-through'}
              onClick={() => {
                setAreaId(candidate.id);
              }}
            >
              {candidate.name}
            </Chip>
            {canWrite && candidate.id === area?.id ? (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Editar ${candidate.name}`}
                onClick={() => {
                  setEditingArea({ area: candidate });
                }}
              >
                <PencilIcon />
              </Button>
            ) : null}
          </span>
        ))}
      </div>
      {area ? (
        <div className="flex flex-col gap-2">
          {canWrite ? (
            <p className="text-sm text-muted-foreground">
              Arrastra las mesas y los elementos para acomodarlos y tócalos para editarlos. Con el
              teclado: flechas para mover, Enter para editar.
            </p>
          ) : null}
          <FloorPlan
            label={`Plano de ${area.name}`}
            tables={areaTables}
            elements={areaElements}
            now={now}
            onSelectTable={(table) => {
              if (canWrite) setEditingTable({ table });
            }}
            {...(canWrite
              ? {
                  editor: {
                    onMoveTable: (table, position) => {
                      moveTable.mutate({ id: table.id, position });
                    },
                    onMoveElement: (element, position) => {
                      moveElement.mutate({ id: element.id, position });
                    },
                    onEditElement: (element) => {
                      setEditingElement({ element });
                    },
                  },
                }
              : {})}
          />
        </div>
      ) : (
        <EmptyState
          icon={LayoutGridIcon}
          title="Crea tu primera área"
          description="Por ejemplo: Salón, Terraza, Barra."
        />
      )}
      {editingArea ? (
        <AreaDialog
          area={editingArea.area}
          onClose={() => {
            setEditingArea(null);
          }}
        />
      ) : null}
      {editingTable && area ? (
        <TableDialog
          table={editingTable.table}
          areas={sortedAreas}
          defaultAreaId={area.id}
          place={place}
          onClose={() => {
            setEditingTable(null);
          }}
        />
      ) : null}
      {editingElement && area ? (
        <ElementDialog
          element={editingElement.element}
          areaId={area.id}
          place={place}
          onClose={() => {
            setEditingElement(null);
          }}
        />
      ) : null}
    </Section>
  );
}

function AreaDialog({ area, onClose }: { area: AreaDto | null; onClose: () => void }) {
  const api = useApi();
  const [name, setName] = useState(area?.name ?? '');
  const [sortOrder, setSortOrder] = useState(String(area?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(area?.isActive ?? true);
  const [removing, setRemoving] = useState(false);
  const invalidate = [queryKeys.areas, queryKeys.tables];
  const save = useApiMutation(
    () => {
      const body = { name: name.trim(), sortOrder: Number(sortOrder) || 0 };
      return area
        ? api.floor.updateArea(area.id, { ...body, isActive })
        : api.floor.createArea(body);
    },
    invalidate,
    {
      onSuccess: () => {
        toast.success('Área guardada');
        onClose();
      },
      onError: notifyError,
    },
  );
  const remove = useApiMutation(() => api.floor.removeArea(area?.id ?? ''), invalidate, {
    onSuccess: onClose,
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        title={area ? `Editar ${area.name}` : 'Nueva área'}
        footer={
          <>
            {area ? (
              <Button
                variant="ghost"
                className="mr-auto text-destructive"
                onClick={() => {
                  setRemoving(true);
                }}
              >
                <Trash2Icon /> Eliminar
              </Button>
            ) : null}
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={name.trim().length < 2 || save.isPending}
              onClick={() => {
                save.mutate(undefined);
              }}
            >
              Guardar
            </Button>
          </>
        }
      >
        <Field label="Nombre">
          {(id) => (
            <Input
              id={id}
              autoFocus
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          )}
        </Field>
        <Field label="Orden">
          {(id) => (
            <Input
              id={id}
              type="number"
              value={sortOrder}
              onChange={(event) => {
                setSortOrder(event.target.value);
              }}
            />
          )}
        </Field>
        {area ? <Switch checked={isActive} onCheckedChange={setIsActive} label="Activa" /> : null}
        <ConfirmDialog
          open={removing}
          onOpenChange={setRemoving}
          title={`Eliminar ${area?.name ?? ''}`}
          description="Solo se puede eliminar un área sin mesas."
          confirmLabel="Eliminar"
          destructive
          onConfirm={() => remove.mutateAsync(undefined)}
        />
      </DialogContent>
    </Dialog>
  );
}

function TableDialog({
  table,
  areas,
  defaultAreaId,
  place,
  onClose,
}: {
  table: TableDto | null;
  areas: AreaDto[];
  defaultAreaId: string;
  place: Placer;
  onClose: () => void;
}) {
  const api = useApi();
  const [form, setForm] = useState({
    name: table?.name ?? '',
    areaId: table?.areaId ?? defaultAreaId,
    capacity: table?.capacity ?? 4,
    shape: table?.shape ?? TableShape.SQUARE,
    width: table?.width ?? 1,
    height: table?.height ?? 1,
  });
  const [isActive, setIsActive] = useState(table?.isActive ?? true);
  const [removing, setRemoving] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]): void => {
    setForm({ ...form, [key]: value });
  };
  const invalidate = [queryKeys.tables];
  const save = useApiMutation(
    () => {
      const current = table?.areaId === form.areaId ? table : null;
      const position = place(form.areaId, {
        kind: 'TABLE',
        width: form.width,
        height: form.height,
        ...(current ? { id: current.id, posX: current.posX, posY: current.posY } : {}),
      });
      const body = { ...form, ...position, name: form.name.trim() };
      return table
        ? api.floor.updateTable(table.id, { ...body, isActive })
        : api.floor.createTable(body);
    },
    invalidate,
    {
      onSuccess: () => {
        toast.success('Mesa guardada');
        onClose();
      },
      onError: notifyError,
    },
  );
  const remove = useApiMutation(() => api.floor.removeTable(table?.id ?? ''), invalidate, {
    onSuccess: onClose,
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        title={table ? `Editar ${table.name}` : 'Nueva mesa'}
        footer={
          <>
            {table ? (
              <Button
                variant="ghost"
                className="mr-auto text-destructive"
                onClick={() => {
                  setRemoving(true);
                }}
              >
                <Trash2Icon /> Eliminar
              </Button>
            ) : null}
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={!form.name.trim() || save.isPending}
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
          <Field label="Nombre o número">
            {(id) => (
              <Input
                id={id}
                autoFocus
                value={form.name}
                onChange={(event) => {
                  set('name', event.target.value);
                }}
              />
            )}
          </Field>
          <Field label="Área">
            {(id) => (
              <Select
                id={id}
                value={form.areaId}
                onChange={(event) => {
                  set('areaId', event.target.value);
                }}
              >
                {areas.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <NumberField
            label="Puestos"
            value={form.capacity}
            min={1}
            max={50}
            onChange={(value) => {
              set('capacity', value);
            }}
          />
          <Field label="Forma">
            {(id) => (
              <Select
                id={id}
                value={form.shape}
                onChange={(event) => {
                  set('shape', event.target.value as TableShape);
                }}
              >
                {Object.values(TableShape).map((shape) => (
                  <option key={shape} value={shape}>
                    {SHAPE_LABEL[shape]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <NumberField
            label="Ancho (celdas)"
            value={form.width}
            min={1}
            max={4}
            onChange={(value) => {
              set('width', value);
            }}
          />
          <NumberField
            label="Alto (celdas)"
            value={form.height}
            min={1}
            max={4}
            onChange={(value) => {
              set('height', value);
            }}
          />
        </div>
        {table ? <Switch checked={isActive} onCheckedChange={setIsActive} label="Activa" /> : null}
        <ConfirmDialog
          open={removing}
          onOpenChange={setRemoving}
          title={`Eliminar mesa ${table?.name ?? ''}`}
          description="No se puede eliminar si tiene pedidos abiertos."
          confirmLabel="Eliminar"
          destructive
          onConfirm={() => remove.mutateAsync(undefined)}
        />
      </DialogContent>
    </Dialog>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      {(id) => (
        <Input
          id={id}
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(event) => {
            onChange(Math.min(max, Math.max(min, Number(event.target.value) || min)));
          }}
        />
      )}
    </Field>
  );
}

/** Barra, cocina, baños, entrada, caja o pared: se ubica arrastrándolo en el plano. */
function ElementDialog({
  element,
  areaId,
  place,
  onClose,
}: {
  element: FloorElementDto | null;
  areaId: string;
  place: Placer;
  onClose: () => void;
}) {
  const api = useApi();
  const [form, setForm] = useState({
    kind: element?.kind ?? FloorElementKind.BAR,
    label: element?.label ?? '',
    width: element?.width ?? 2,
    height: element?.height ?? 1,
  });
  const invalidate = [queryKeys.areas];
  const save = useApiMutation(
    () => {
      const position = place(areaId, {
        kind: form.kind,
        width: form.width,
        height: form.height,
        ...(element ? { id: element.id, posX: element.posX, posY: element.posY } : {}),
      });
      const body = { ...form, ...position, label: form.label.trim() || null };
      return element
        ? api.floor.updateElement(element.id, body)
        : api.floor.createElement(areaId, body);
    },
    invalidate,
    {
      onSuccess: () => {
        toast.success(element ? 'Elemento guardado' : 'Elemento agregado: arrástralo a su lugar');
        onClose();
      },
      onError: notifyError,
    },
  );
  const remove = useApiMutation(() => api.floor.removeElement(element?.id ?? ''), invalidate, {
    onSuccess: onClose,
    onError: notifyError,
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        title={
          element ? `Editar ${element.label ?? ELEMENT_LABEL[element.kind]}` : 'Nuevo elemento'
        }
        description="Barra, cocina, baños, entrada, caja o paredes: ayudan a ubicarse en el plano."
        footer={
          <>
            {element ? (
              <Button
                variant="ghost"
                className="mr-auto text-destructive"
                disabled={remove.isPending}
                onClick={() => {
                  remove.mutate(undefined);
                }}
              >
                <Trash2Icon /> Quitar
              </Button>
            ) : null}
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={save.isPending}
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
          <Field label="Tipo">
            {(id) => (
              <Select
                id={id}
                value={form.kind}
                onChange={(event) => {
                  setForm({ ...form, kind: event.target.value as FloorElementKind });
                }}
              >
                {Object.values(FloorElementKind).map((kind) => (
                  <option key={kind} value={kind}>
                    {ELEMENT_LABEL[kind]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Texto (opcional)">
            {(id) => (
              <Input
                id={id}
                maxLength={40}
                placeholder={ELEMENT_LABEL[form.kind]}
                value={form.label}
                onChange={(event) => {
                  setForm({ ...form, label: event.target.value });
                }}
              />
            )}
          </Field>
          <NumberField
            label="Ancho (celdas)"
            value={form.width}
            min={1}
            max={24}
            onChange={(value) => {
              setForm({ ...form, width: value });
            }}
          />
          <NumberField
            label="Alto (celdas)"
            value={form.height}
            min={1}
            max={24}
            onChange={(value) => {
              setForm({ ...form, height: value });
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
