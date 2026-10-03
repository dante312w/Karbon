import { queryKeys, useApi, useApiMutation, useCategories } from '@karbon/client';
import type {
  CategoryDto,
  CreateNoteOptionRequest,
  NoteOptionDto,
  ProductDto,
  UpdateNoteOptionRequest,
} from '@karbon/types';
import {
  Badge,
  Button,
  Chip,
  cn,
  Dialog,
  DialogContent,
  Input,
  notifyError,
  Spinner,
  Switch,
  toast,
} from '@karbon/ui';
import { isNoteAssigned, noteSuggestions, suggestNoteAssignments } from '@karbon/utils';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ListChecksIcon,
  MessageSquareTextIcon,
  PencilIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { type SyntheticEvent, useState } from 'react';
import { ConfirmDialog } from '../../components/confirm-dialog';

const LABEL_MAX_LENGTH = 60;
const INVALIDATE = [queryKeys.noteOptions];

/** Todas las notas, también las inactivas, para administrarlas. */
function useAllNoteOptions() {
  const api = useApi();
  return useQuery({
    queryKey: [...queryKeys.noteOptions, 'all'],
    queryFn: () => api.catalog.noteOptions(true),
  });
}

function orderIn(note: NoteOptionDto, categoryId: string): number | null {
  return note.categories.find((link) => link.categoryId === categoryId)?.sortOrder ?? null;
}

/** Notas asignadas a la categoría, en su orden. */
function notesOfCategory(options: readonly NoteOptionDto[] | undefined, categoryId: string) {
  return (options ?? [])
    .filter((note) => !note.isGeneral && orderIn(note, categoryId) !== null)
    .sort((a, b) => (orderIn(a, categoryId) ?? 0) - (orderIn(b, categoryId) ?? 0));
}

function generalNotes(options: readonly NoteOptionDto[] | undefined) {
  return (options ?? []).filter((note) => note.isGeneral).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** "General", "Bebidas, Cócteles" o "Sin asignar": a qué aplica una nota. */
function scopeText(note: NoteOptionDto, categories: readonly CategoryDto[]): string {
  if (note.isGeneral) return 'General · todos los productos';
  const names = note.categories
    .map((link) => categories.find((category) => category.id === link.categoryId)?.name)
    .filter((name): name is string => Boolean(name));
  const products =
    note.productIds.length > 0
      ? `${String(note.productIds.length)} producto${note.productIds.length === 1 ? '' : 's'}`
      : null;
  const parts = [...names, ...(products ? [products] : [])];
  return parts.length > 0 ? parts.join(', ') : 'Sin asignar: no se ofrece';
}

/** Qué notas ve el mesero al pedir un producto de la categoría elegida (o las generales). */
export function NotesStrip({
  category,
  onEdit,
  onManage,
}: {
  category: CategoryDto | null;
  onEdit: () => void;
  onManage: () => void;
}) {
  const options = useAllNoteOptions().data;
  const own = (category ? notesOfCategory(options, category.id) : generalNotes(options)).filter(
    (note) => note.isActive,
  );
  const general = category ? generalNotes(options).filter((note) => note.isActive).length : 0;
  const unassigned = (options ?? []).filter((note) => !isNoteAssigned(note)).length;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm">
      <MessageSquareTextIcon className="size-4 text-muted-foreground" aria-hidden />
      <span className="font-medium">
        {category ? `Notas de ${category.name}` : 'Notas generales (todos los productos)'}
      </span>
      {own.length === 0 ? (
        <span className="text-muted-foreground">Sin notas</span>
      ) : (
        own.map((note) => (
          <Badge key={note.id} variant="secondary">
            {note.label}
          </Badge>
        ))
      )}
      {general > 0 ? (
        <span className="text-xs text-muted-foreground">+ {general} generales</span>
      ) : null}
      <span className="ml-auto flex gap-1">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <PencilIcon /> {category ? 'Asignar notas' : 'Editar generales'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onManage}>
          <ListChecksIcon /> Todas las notas
          {unassigned > 0 ? <Badge variant="destructive">{unassigned}</Badge> : null}
        </Button>
      </span>
    </div>
  );
}

/** Mover un elemento de la lista una posición (devuelve una copia). */
function moved<T>(items: readonly T[], index: number, offset: -1 | 1): T[] {
  const next = [...items];
  const [item] = next.splice(index, 1);
  if (item === undefined) return next;
  next.splice(index + offset, 0, item);
  return next;
}

function OrderButtons({
  label,
  index,
  count,
  disabled,
  onMove,
}: {
  label: string;
  index: number;
  count: number;
  disabled: boolean;
  onMove: (offset: -1 | 1) => void;
}) {
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Subir ${label}`}
        disabled={index === 0 || disabled}
        onClick={() => {
          onMove(-1);
        }}
      >
        <ArrowUpIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Bajar ${label}`}
        disabled={index === count - 1 || disabled}
        onClick={() => {
          onMove(1);
        }}
      >
        <ArrowDownIcon />
      </Button>
    </>
  );
}

function NewNoteForm({
  placeholder,
  busy,
  onCreate,
}: {
  placeholder: string;
  busy: boolean;
  onCreate: (label: string, reset: () => void) => void;
}) {
  const [draft, setDraft] = useState('');
  const submit = (event: SyntheticEvent): void => {
    event.preventDefault();
    const label = draft.trim();
    if (label)
      onCreate(label, () => {
        setDraft('');
      });
  };
  return (
    <form className="flex gap-2" onSubmit={submit}>
      <Input
        aria-label="Nueva nota"
        placeholder={placeholder}
        maxLength={LABEL_MAX_LENGTH}
        autoFocus
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
      />
      <Button type="submit" disabled={!draft.trim() || busy}>
        <PlusIcon /> Agregar
      </Button>
    </form>
  );
}

/**
 * Asignación desde una categoría: qué notas le aplican (con checks) y en qué orden las ve el
 * mesero. Con `category = null`, las generales. Cada cambio se guarda al momento; los pedidos ya
 * tomados conservan su texto.
 */
export function NoteOptionsDialog({
  category,
  onClose,
}: {
  category: CategoryDto | null;
  onClose: () => void;
}) {
  return category ? (
    <CategoryNotesDialog category={category} onClose={onClose} />
  ) : (
    <GeneralNotesDialog onClose={onClose} />
  );
}

function CategoryNotesDialog({
  category,
  onClose,
}: {
  category: CategoryDto;
  onClose: () => void;
}) {
  const api = useApi();
  const all = useAllNoteOptions();
  const categories = useCategories().data ?? [];
  const assigned = notesOfCategory(all.data, category.id);
  const assignedIds = assigned.map((note) => note.id);
  const available = (all.data ?? [])
    .filter((note) => !note.isGeneral && !assignedIds.includes(note.id))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  const parent = categories.find((candidate) => candidate.id === category.parentId);

  const setNotes = useApiMutation(
    (ids: string[]) => api.catalog.setCategoryNoteOptions(category.id, { noteOptionIds: ids }),
    INVALIDATE,
    { onError: notifyError },
  );
  const create = useApiMutation(
    (body: CreateNoteOptionRequest) => api.catalog.createNoteOption(body),
    INVALIDATE,
    { onError: notifyError },
  );
  const busy = setNotes.isPending || create.isPending;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        title={`Notas de ${category.name}`}
        description={`El mesero las ve al pedir un producto de ${category.name}${
          parent ? ` (también hereda las de ${parent.name})` : ''
        }, antes de las generales. Un producto con notas propias usa esas en su lugar.`}
        footer={<Button onClick={onClose}>Listo</Button>}
      >
        <NewNoteForm
          placeholder="Nueva nota para esta categoría, ej. Sin cebolla"
          busy={busy}
          onCreate={(label, reset) => {
            create.mutate({ label, categoryIds: [category.id] }, { onSuccess: reset });
          }}
        />
        {all.isPending ? <Spinner /> : null}
        <section className="flex flex-col gap-2" aria-label="Notas que aplican">
          <h3 className="text-sm font-semibold text-muted-foreground">Aplican a {category.name}</h3>
          {all.data && assigned.length === 0 ? (
            <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              Ninguna todavía. Marca abajo las que tienen sentido para esta categoría.
            </p>
          ) : null}
          <ul className="flex flex-col gap-1">
            {assigned.map((note, index) => (
              <li key={note.id} className="flex items-center gap-1">
                <OrderButtons
                  label={note.label}
                  index={index}
                  count={assigned.length}
                  disabled={busy}
                  onMove={(offset) => {
                    setNotes.mutate(moved(assignedIds, index, offset));
                  }}
                />
                <span
                  className={cn(
                    'flex-1 text-sm',
                    note.isActive ? '' : 'text-muted-foreground line-through',
                  )}
                >
                  {note.label}
                </span>
                {note.categories.length > 1 ? (
                  <span className="text-xs text-muted-foreground">
                    +{note.categories.length - 1} categorías
                  </span>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar ${note.label} de ${category.name}`}
                  disabled={busy}
                  onClick={() => {
                    setNotes.mutate(assignedIds.filter((id) => id !== note.id));
                  }}
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
        </section>
        {available.length > 0 ? (
          <section className="flex flex-col gap-2" aria-label="Otras notas">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Otras notas (toca para agregar)
            </h3>
            <div className="flex flex-wrap gap-2">
              {available.map((note) => (
                <Chip
                  key={note.id}
                  disabled={busy}
                  className={note.isActive ? undefined : 'line-through opacity-60'}
                  onClick={() => {
                    setNotes.mutate([...assignedIds, note.id]);
                  }}
                >
                  <PlusIcon className="size-3.5" /> {note.label}
                </Chip>
              ))}
            </div>
          </section>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Renombrar, apagar o eliminar una nota: igual en las generales y en el administrador. */
function NoteRowControls({
  note,
  busy,
  onUpdate,
  onRemove,
}: {
  note: NoteOptionDto;
  busy: boolean;
  onUpdate: (body: UpdateNoteOptionRequest) => void;
  onRemove: () => void;
}) {
  return (
    <>
      {/* La clave incluye el texto: si se renombra desde otro equipo, el campo se actualiza. */}
      <Input
        key={note.label}
        aria-label={`Texto de ${note.label}`}
        className={cn('flex-1', note.isActive ? '' : 'text-muted-foreground line-through')}
        maxLength={LABEL_MAX_LENGTH}
        defaultValue={note.label}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        onBlur={(event) => {
          const label = event.target.value.trim();
          if (!label) {
            event.target.value = note.label;
            return;
          }
          if (label !== note.label) onUpdate({ label });
        }}
      />
      <Switch
        checked={note.isActive}
        aria-label={note.isActive ? `Ocultar ${note.label}` : `Mostrar ${note.label}`}
        title={note.isActive ? 'Visible para el mesero' : 'Oculta'}
        disabled={busy}
        className="px-1"
        onCheckedChange={(isActive) => {
          onUpdate({ isActive });
        }}
      />
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Eliminar ${note.label}`}
        className="text-destructive"
        onClick={onRemove}
      >
        <Trash2Icon />
      </Button>
    </>
  );
}

function useNoteMutations() {
  const api = useApi();
  const [removing, setRemoving] = useState<NoteOptionDto | null>(null);
  const update = useApiMutation(
    ({ id, ...body }: UpdateNoteOptionRequest & { id: string }) =>
      api.catalog.updateNoteOption(id, body),
    INVALIDATE,
    { onError: notifyError },
  );
  const remove = useApiMutation((id: string) => api.catalog.removeNoteOption(id), INVALIDATE);
  const confirm = (
    <ConfirmDialog
      open={removing !== null}
      onOpenChange={(open) => {
        if (!open) setRemoving(null);
      }}
      title={`Eliminar «${removing?.label ?? ''}»`}
      description="Deja de ofrecerse en todas sus categorías. Los pedidos que ya la tienen no cambian. Si solo quieres dejar de ofrecerla por un tiempo, apágala."
      confirmLabel="Eliminar"
      destructive
      onConfirm={() => remove.mutateAsync(removing?.id ?? '')}
    />
  );
  return { update, setRemoving, confirm };
}

function GeneralNotesDialog({ onClose }: { onClose: () => void }) {
  const api = useApi();
  const all = useAllNoteOptions();
  const notes = generalNotes(all.data);
  const { update, setRemoving, confirm } = useNoteMutations();
  const create = useApiMutation(
    (label: string) => api.catalog.createNoteOption({ label, isGeneral: true }),
    INVALIDATE,
    { onError: notifyError },
  );
  const reorder = useApiMutation(
    (ids: string[]) => api.catalog.reorderNoteOptions({ categoryId: null, ids }),
    INVALIDATE,
    { onError: notifyError },
  );
  const busy = update.isPending || reorder.isPending;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        title="Notas generales"
        description="Se ofrecen en todos los productos, después de las de su categoría. Úsalas solo para lo que aplica a todo (ej. Para llevar)."
        footer={<Button onClick={onClose}>Listo</Button>}
      >
        <NewNoteForm
          placeholder="Ej. Para llevar"
          busy={create.isPending}
          onCreate={(label, reset) => {
            create.mutate(label, { onSuccess: reset });
          }}
        />
        {all.isPending ? <Spinner /> : null}
        {all.data && notes.length === 0 ? (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            No hay notas generales.
          </p>
        ) : null}
        <ul className="flex flex-col gap-2">
          {notes.map((note, index) => (
            <li key={note.id} className="flex items-center gap-1">
              <OrderButtons
                label={note.label}
                index={index}
                count={notes.length}
                disabled={busy}
                onMove={(offset) => {
                  reorder.mutate(
                    moved(
                      notes.map((candidate) => candidate.id),
                      index,
                      offset,
                    ),
                  );
                }}
              />
              <NoteRowControls
                note={note}
                busy={busy}
                onUpdate={(body) => {
                  update.mutate({ id: note.id, ...body });
                }}
                onRemove={() => {
                  setRemoving(note);
                }}
              />
            </li>
          ))}
        </ul>
        {confirm}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Todas las notas: texto, si está activa, a qué aplica (general o categorías) y la asignación
 * sugerida por nombre de categoría para organizar de una vez las que quedaron como generales.
 */
export function NotesManagerDialog({ onClose }: { onClose: () => void }) {
  const all = useAllNoteOptions();
  const categories = useCategories().data ?? [];
  const { update, setRemoving, confirm } = useNoteMutations();
  const [editing, setEditing] = useState<{ note: NoteOptionDto | null } | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const notes = [...(all.data ?? [])].sort(
    (a, b) =>
      Number(isNoteAssigned(a)) - Number(isNoteAssigned(b)) || a.label.localeCompare(b.label, 'es'),
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="w-[min(96vw,48rem)]"
        title="Todas las notas"
        description="Una nota puede aplicar a varias categorías. Las generales se ofrecen en todos los productos; las que no tienen categoría ni productos no se ofrecen."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setSuggesting(true);
              }}
            >
              <SparklesIcon /> Sugerir asignación
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setEditing({ note: null });
              }}
            >
              <PlusIcon /> Nueva nota
            </Button>
            <Button onClick={onClose}>Listo</Button>
          </>
        }
      >
        {all.isPending ? <Spinner /> : null}
        <ul className="flex flex-col gap-2">
          {notes.map((note) => (
            <li key={note.id} className="flex flex-col gap-1 rounded-lg border p-2">
              <div className="flex items-center gap-1">
                <NoteRowControls
                  note={note}
                  busy={update.isPending}
                  onUpdate={(body) => {
                    update.mutate({ id: note.id, ...body });
                  }}
                  onRemove={() => {
                    setRemoving(note);
                  }}
                />
              </div>
              <div className="flex items-center gap-2 px-1 text-xs">
                <span
                  className={cn(
                    'flex-1',
                    isNoteAssigned(note) ? 'text-muted-foreground' : 'font-medium text-destructive',
                  )}
                >
                  {scopeText(note, categories)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing({ note });
                  }}
                >
                  <PencilIcon /> Categorías
                </Button>
              </div>
            </li>
          ))}
        </ul>
        {confirm}
        {editing ? (
          <NoteEditorDialog
            note={editing.note}
            categories={categories}
            onClose={() => {
              setEditing(null);
            }}
          />
        ) : null}
        {suggesting ? (
          <SuggestedAssignmentDialog
            notes={all.data ?? []}
            categories={categories}
            onClose={() => {
              setSuggesting(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Alta o edición de una nota con su alcance: general o un conjunto de categorías. */
function NoteEditorDialog({
  note,
  categories,
  onClose,
}: {
  note: NoteOptionDto | null;
  categories: readonly CategoryDto[];
  onClose: () => void;
}) {
  const api = useApi();
  const [label, setLabel] = useState(note?.label ?? '');
  const [isGeneral, setIsGeneral] = useState(note?.isGeneral ?? false);
  const [categoryIds, setCategoryIds] = useState<string[]>(
    note?.categories.map((link) => link.categoryId) ?? [],
  );
  const save = useApiMutation(
    () => {
      const body = { label: label.trim(), isGeneral, categoryIds: isGeneral ? [] : categoryIds };
      return note
        ? api.catalog.updateNoteOption(note.id, body)
        : api.catalog.createNoteOption(body);
    },
    INVALIDATE,
    {
      onSuccess: () => {
        toast.success(note ? 'Nota actualizada' : 'Nota creada');
        onClose();
      },
      onError: notifyError,
    },
  );
  const toggle = (id: string): void => {
    setCategoryIds(
      categoryIds.includes(id)
        ? categoryIds.filter((candidate) => candidate !== id)
        : [...categoryIds, id],
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        title={note ? `Editar «${note.label}»` : 'Nueva nota'}
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={!label.trim() || save.isPending}
              onClick={() => {
                save.mutate();
              }}
            >
              Guardar
            </Button>
          </>
        }
      >
        <Input
          aria-label="Texto de la nota"
          placeholder="Ej. Sin hielo"
          maxLength={LABEL_MAX_LENGTH}
          autoFocus
          value={label}
          onChange={(event) => {
            setLabel(event.target.value);
          }}
        />
        <Switch
          checked={isGeneral}
          onCheckedChange={setIsGeneral}
          label="General: se ofrece en todos los productos"
        />
        {isGeneral ? null : (
          <section className="flex flex-col gap-2" aria-label="Categorías">
            <p className="text-sm text-muted-foreground">
              Categorías donde se ofrece (sus subcategorías también la ven):
            </p>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <Chip
                  key={category.id}
                  active={categoryIds.includes(category.id)}
                  aria-pressed={categoryIds.includes(category.id)}
                  onClick={() => {
                    toggle(category.id);
                  }}
                >
                  {category.name}
                </Chip>
              ))}
            </div>
            {categoryIds.length === 0 && (note?.productIds.length ?? 0) === 0 ? (
              <p className="text-xs font-medium text-destructive">
                Sin categorías esta nota no se ofrece en ningún producto.
              </p>
            ) : null}
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Propuesta de asignación por nombre de categoría para las notas generales o sin asignar. Nada se
 * aplica hasta confirmar, y se puede desmarcar cualquier fila.
 */
function SuggestedAssignmentDialog({
  notes,
  categories,
  onClose,
}: {
  notes: readonly NoteOptionDto[];
  categories: readonly CategoryDto[];
  onClose: () => void;
}) {
  const api = useApi();
  const [proposals] = useState(() => suggestNoteAssignments(notes, categories));
  const [skipped, setSkipped] = useState<string[]>([]);
  const chosen = proposals.filter((proposal) => !skipped.includes(proposal.noteOptionId));
  const apply = useApiMutation(
    () =>
      api.catalog.assignNoteOptions({
        assignments: chosen.map(({ noteOptionId, isGeneral, categoryIds }) => ({
          noteOptionId,
          isGeneral,
          categoryIds,
        })),
      }),
    INVALIDATE,
    {
      onSuccess: () => {
        toast.success(`${String(chosen.length)} notas organizadas`);
        onClose();
      },
      onError: notifyError,
    },
  );
  const nameOf = (id: string): string =>
    categories.find((category) => category.id === id)?.name ?? '?';

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="w-[min(96vw,40rem)]"
        title="Asignación sugerida"
        description="Según el nombre de cada categoría. Revisa, desmarca lo que no aplique y confirma; después puedes ajustar cada nota."
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={chosen.length === 0 || apply.isPending}
              onClick={() => {
                apply.mutate();
              }}
            >
              Aplicar {chosen.length > 0 ? `(${String(chosen.length)})` : ''}
            </Button>
          </>
        }
      >
        {proposals.length === 0 ? (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            No hay nada que sugerir: las notas generales que quedan aplican a todo o no se parecen a
            ninguna categoría. Asígnalas a mano desde «Categorías».
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {proposals.map((proposal) => {
              const checked = !skipped.includes(proposal.noteOptionId);
              return (
                <li key={proposal.noteOptionId}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-2">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-primary"
                      checked={checked}
                      onChange={() => {
                        setSkipped(
                          checked
                            ? [...skipped, proposal.noteOptionId]
                            : skipped.filter((id) => id !== proposal.noteOptionId),
                        );
                      }}
                    />
                    <span className="flex flex-col">
                      <span className="font-medium">{proposal.label}</span>
                      <span className="text-sm text-muted-foreground">
                        {proposal.isGeneral
                          ? 'General (todos los productos)'
                          : `Solo en: ${proposal.categoryIds.map(nameOf).join(', ')}`}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Notas propias de un producto (pestaña del producto): si tiene, el mesero ve esas y las
 * generales en lugar de las de su categoría. Sirve para excepciones.
 */
export function ProductNotesTab({ product }: { product: ProductDto }) {
  const api = useApi();
  const all = useAllNoteOptions();
  const categories = useCategories().data ?? [];
  const candidates = (all.data ?? [])
    .filter((note) => !note.isGeneral)
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  const saved = candidates.filter((note) => note.productIds.includes(product.id));
  const [selected, setSelected] = useState<string[] | null>(null);
  const ids = selected ?? saved.map((note) => note.id);
  const save = useApiMutation(
    () => api.catalog.setProductNoteOptions(product.id, { noteOptionIds: ids }),
    INVALIDATE,
    {
      onSuccess: () => {
        toast.success('Notas del producto guardadas');
        setSelected(null);
      },
      onError: notifyError,
    },
  );
  // Vista previa con la misma regla que usan el celular y la caja.
  const preview = noteSuggestions(
    (all.data ?? []).map((note) =>
      note.isGeneral
        ? note
        : {
            ...note,
            productIds: ids.includes(note.id)
              ? [...new Set([...note.productIds, product.id])]
              : note.productIds.filter((id) => id !== product.id),
          },
    ),
    categories,
    product,
  );

  if (all.isPending) return <Spinner />;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Por defecto el mesero ve las notas de la categoría del producto. Si eliges notas aquí, verá
        solo estas (y las generales). Déjalo vacío para usar las de la categoría.
      </p>
      <div className="flex flex-wrap gap-2">
        {candidates.map((note) => (
          <Chip
            key={note.id}
            active={ids.includes(note.id)}
            aria-pressed={ids.includes(note.id)}
            onClick={() => {
              setSelected(
                ids.includes(note.id) ? ids.filter((id) => id !== note.id) : [...ids, note.id],
              );
            }}
          >
            {note.label}
          </Chip>
        ))}
      </div>
      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay notas por categoría todavía. Créalas en Catálogo → Todas las notas.
        </p>
      ) : null}
      <p className="rounded-lg bg-muted p-3 text-sm">
        <span className="font-medium">El mesero verá: </span>
        {preview.length > 0 ? preview.join(' · ') : 'ninguna nota rápida (solo texto libre)'}
      </p>
      <div className="flex justify-end">
        <Button
          disabled={selected === null || save.isPending}
          onClick={() => {
            save.mutate();
          }}
        >
          Guardar notas
        </Button>
      </div>
    </div>
  );
}
