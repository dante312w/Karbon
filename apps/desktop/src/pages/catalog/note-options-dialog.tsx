import { queryKeys, useApi, useApiMutation } from '@karbon/client';
import type { CategoryDto, NoteOptionDto, UpdateNoteOptionRequest } from '@karbon/types';
import {
  Badge,
  Button,
  cn,
  Dialog,
  DialogContent,
  Input,
  notifyError,
  Spinner,
  Switch,
} from '@karbon/ui';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  MessageSquareTextIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';
import { type SyntheticEvent, useState } from 'react';
import { ConfirmDialog } from '../../components/confirm-dialog';

const LABEL_MAX_LENGTH = 60;

/** Todas las notas, también las inactivas, para administrarlas. */
function useAllNoteOptions() {
  const api = useApi();
  return useQuery({
    queryKey: [...queryKeys.noteOptions, 'all'],
    queryFn: () => api.catalog.noteOptions(true),
  });
}

/** Notas propias de la categoría (`null` = generales) en el orden configurado. */
function notesOf(options: readonly NoteOptionDto[] | undefined, categoryId: string | null) {
  return (options ?? [])
    .filter((option) => option.categoryId === categoryId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Qué notas ve el mesero al pedir un producto de la categoría elegida (o las generales). */
export function NotesStrip({
  category,
  onEdit,
}: {
  category: CategoryDto | null;
  onEdit: () => void;
}) {
  const options = useAllNoteOptions().data;
  const own = notesOf(options, category?.id ?? null).filter((option) => option.isActive);
  const general = category ? notesOf(options, null).filter((option) => option.isActive).length : 0;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm">
      <MessageSquareTextIcon className="size-4 text-muted-foreground" aria-hidden />
      <span className="font-medium">
        {category ? `Notas de ${category.name}` : 'Notas generales (todos los productos)'}
      </span>
      {own.length === 0 ? (
        <span className="text-muted-foreground">Sin notas</span>
      ) : (
        own.map((option) => (
          <Badge key={option.id} variant="secondary">
            {option.label}
          </Badge>
        ))
      )}
      {general > 0 ? (
        <span className="text-xs text-muted-foreground">+ {general} generales</span>
      ) : null}
      <Button variant="ghost" size="sm" className="ml-auto" onClick={onEdit}>
        <PencilIcon /> Editar notas
      </Button>
    </div>
  );
}

/**
 * Administra las notas de un toque de una categoría o las generales. Cada cambio se guarda al
 * momento; los pedidos ya tomados conservan su texto.
 */
export function NoteOptionsDialog({
  category,
  onClose,
}: {
  category: CategoryDto | null;
  onClose: () => void;
}) {
  const api = useApi();
  const all = useAllNoteOptions();
  const categoryId = category?.id ?? null;
  const notes = notesOf(all.data, categoryId);
  const [draft, setDraft] = useState('');
  const [removing, setRemoving] = useState<NoteOptionDto | null>(null);

  const invalidate = [queryKeys.noteOptions];
  const create = useApiMutation(
    (label: string) => api.catalog.createNoteOption({ categoryId, label }),
    invalidate,
    {
      onSuccess: () => {
        setDraft('');
      },
      onError: notifyError,
    },
  );
  const update = useApiMutation(
    ({ id, ...body }: UpdateNoteOptionRequest & { id: string }) =>
      api.catalog.updateNoteOption(id, body),
    invalidate,
    { onError: notifyError },
  );
  const reorder = useApiMutation(
    (ids: string[]) => api.catalog.reorderNoteOptions({ categoryId, ids }),
    invalidate,
    { onError: notifyError },
  );
  const remove = useApiMutation((id: string) => api.catalog.removeNoteOption(id), invalidate);
  const busy = update.isPending || reorder.isPending;

  const move = (index: number, offset: -1 | 1): void => {
    const ids = notes.map((note) => note.id);
    const [moved] = ids.splice(index, 1);
    if (moved === undefined) return;
    ids.splice(index + offset, 0, moved);
    reorder.mutate(ids);
  };
  const submit = (event: SyntheticEvent): void => {
    event.preventDefault();
    const label = draft.trim();
    if (label) create.mutate(label);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        title={category ? `Notas de ${category.name}` : 'Notas generales'}
        description={
          category
            ? 'El mesero las ve al pedir un producto de esta categoría, antes de las notas generales.'
            : 'Se ofrecen en todos los productos, después de las notas de su categoría.'
        }
        footer={<Button onClick={onClose}>Listo</Button>}
      >
        <form className="flex gap-2" onSubmit={submit}>
          <Input
            aria-label="Nueva nota"
            placeholder={category ? 'Ej. Sin cebolla' : 'Ej. Para llevar'}
            maxLength={LABEL_MAX_LENGTH}
            autoFocus
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
          />
          <Button type="submit" disabled={!draft.trim() || create.isPending}>
            <PlusIcon /> Agregar
          </Button>
        </form>
        {all.isPending ? <Spinner /> : null}
        {all.data && notes.length === 0 ? (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            Aún no hay notas. Agrega las que el mesero usa a diario para que las marque con un
            toque.
          </p>
        ) : null}
        {notes.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {notes.map((note, index) => (
              <li key={note.id} className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Subir ${note.label}`}
                  disabled={index === 0 || busy}
                  onClick={() => {
                    move(index, -1);
                  }}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Bajar ${note.label}`}
                  disabled={index === notes.length - 1 || busy}
                  onClick={() => {
                    move(index, 1);
                  }}
                >
                  <ArrowDownIcon />
                </Button>
                {/* La clave incluye el texto: si se renombra desde otro equipo, el campo se actualiza. */}
                <Input
                  key={note.label}
                  aria-label={`Texto de ${note.label}`}
                  className={cn(
                    'flex-1',
                    note.isActive ? '' : 'text-muted-foreground line-through',
                  )}
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
                    if (label !== note.label) update.mutate({ id: note.id, label });
                  }}
                />
                <Switch
                  checked={note.isActive}
                  aria-label={note.isActive ? `Ocultar ${note.label}` : `Mostrar ${note.label}`}
                  title={note.isActive ? 'Visible para el mesero' : 'Oculta'}
                  disabled={busy}
                  className="px-1"
                  onCheckedChange={(isActive) => {
                    update.mutate({ id: note.id, isActive });
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Eliminar ${note.label}`}
                  className="text-destructive"
                  onClick={() => {
                    setRemoving(note);
                  }}
                >
                  <Trash2Icon />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <ConfirmDialog
          open={removing !== null}
          onOpenChange={(open) => {
            if (!open) setRemoving(null);
          }}
          title={`Eliminar «${removing?.label ?? ''}»`}
          description="Los pedidos que ya la tienen no cambian. Si solo quieres dejar de ofrecerla por un tiempo, apágala."
          confirmLabel="Eliminar"
          destructive
          onConfirm={() => remove.mutateAsync(removing?.id ?? '')}
        />
      </DialogContent>
    </Dialog>
  );
}
