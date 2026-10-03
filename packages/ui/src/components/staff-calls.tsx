import {
  type StaffCallDto,
  type StaffCallReason,
  type StaffCallRecipientDto,
  StaffCallStatus,
} from '@karbon/types';
import {
  elapsedLabel,
  STAFF_CALL_REASON_LABEL,
  staffCallStatusText,
  staffCallTitle,
} from '@karbon/utils';
import { BellRingIcon, FootprintsIcon, UsersIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { cn } from '../lib/cn';
import { Badge } from './badge';
import { Button } from './button';
import { Dialog, DialogContent } from './dialog';
import { Input } from './form';

export interface StaffCallCardProps {
  call: StaffCallDto;
  now: number;
  /** Resalta los que suenan en este equipo (para mí o para todos). */
  highlight?: boolean;
  /** Muestra a quién va cuando es para otro mesero. */
  showRecipient?: boolean;
  actions?: ReactNode;
  className?: string;
}

/** Un llamado interno tal como lo ven caja, cocina y meseros. */
export function StaffCallCard({
  call,
  now,
  highlight = false,
  showRecipient = false,
  actions,
  className,
}: StaffCallCardProps) {
  const pending = call.status === StaffCallStatus.PENDING;
  const Icon = pending ? BellRingIcon : FootprintsIcon;
  const elapsed = elapsedLabel(call.createdAt, now);
  const from =
    call.createdBy.roleName === call.createdBy.name
      ? call.createdBy.name
      : `${call.createdBy.name} (${call.createdBy.roleName})`;
  return (
    <article
      className={cn(
        'flex flex-col gap-2 rounded-xl border p-3',
        highlight ? 'border-primary bg-primary/10' : 'bg-card',
        className,
      )}
      aria-label={staffCallTitle(call)}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-full',
            pending ? 'bg-urgency-warning text-black' : 'bg-muted text-foreground',
            pending && highlight && 'animate-pulse',
          )}
          aria-hidden
        >
          <Icon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="leading-tight font-semibold">{staffCallTitle(call)}</p>
          {call.message ? <p className="text-sm">«{call.message}»</p> : null}
          <p className="text-xs text-muted-foreground">
            {from} · {elapsed === '0 min' ? 'justo ahora' : `hace ${elapsed}`}
            {showRecipient && call.targetUser ? ` · Para ${call.targetUser.name}` : ''}
          </p>
          <p className={cn('text-xs font-semibold', pending ? 'text-urgency-critical' : '')}>
            {staffCallStatusText(call)}
          </p>
        </div>
        {call.callCount > 1 ? (
          <Badge variant="destructive" aria-label={`${String(call.callCount)} avisos`}>
            ×{call.callCount}
          </Badge>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </article>
  );
}

export interface StaffCallDialogProps {
  title: string;
  description?: string;
  reasons: readonly StaffCallReason[];
  defaultReason?: StaffCallReason;
  /**
   * Al llamar al mesero: a quién se puede llamar y quién va marcado de entrada (el mesero de la
   * mesa; `null` = todos). Sin esta prop no hay selector (p. ej. al llamar a caja).
   */
  recipients?: {
    options: readonly StaffCallRecipientDto[];
    loading?: boolean;
    defaultId: string | null;
  };
  /** `side` en el celular (panel), `modal` en el escritorio. */
  variant?: 'modal' | 'side';
  busy?: boolean;
  /** `recipientId`: el mesero elegido o `null` = todos. */
  onSubmit: (reason: StaffCallReason, message: string | null, recipientId: string | null) => void;
  onClose: () => void;
}

/** "Todos los meseros" o uno en particular, con quién está conectado ahora. */
function RecipientPicker({
  options,
  loading,
  value,
  onChange,
}: {
  options: readonly StaffCallRecipientDto[];
  loading: boolean;
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const choice = (id: string | null, label: ReactNode, key: string) => (
    <Button
      key={key}
      type="button"
      role="radio"
      aria-checked={value === id}
      variant={value === id ? 'default' : 'outline'}
      size="touch"
      className="justify-start"
      onClick={() => {
        onChange(id);
      }}
    >
      {label}
    </Button>
  );
  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label="A quién">
      <p className="text-sm font-medium">¿A quién?</p>
      {choice(
        null,
        <>
          <UsersIcon /> Todos los meseros
        </>,
        'all',
      )}
      {options.map((recipient) =>
        choice(
          recipient.id,
          <span className="flex w-full items-center gap-2">
            <span
              className={cn(
                'size-2.5 shrink-0 rounded-full',
                recipient.online ? 'bg-status-free' : 'bg-muted-foreground/40',
              )}
              aria-hidden
            />
            <span className="flex-1 text-left">{recipient.name}</span>
            <span className="text-xs font-normal opacity-80">
              {recipient.online ? 'conectado' : 'sin conexión'}
            </span>
          </span>,
          recipient.id,
        ),
      )}
      {!loading && options.length === 0 ? (
        <p className="text-xs text-muted-foreground">No hay meseros activos para elegir.</p>
      ) : null}
    </div>
  );
}

/** Elegir el motivo (y un detalle opcional) antes de llamar al mesero o a caja. */
export function StaffCallDialog({
  title,
  description,
  reasons,
  defaultReason,
  recipients,
  variant = 'modal',
  busy = false,
  onSubmit,
  onClose,
}: StaffCallDialogProps) {
  const [reason, setReason] = useState<StaffCallReason | undefined>(defaultReason ?? reasons[0]);
  const [message, setMessage] = useState('');
  // Mientras no elija, va marcado el mesero de la mesa (si está en la lista) o "Todos".
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const fallback =
    recipients?.options.some((option) => option.id === recipients.defaultId) === true
      ? recipients.defaultId
      : null;
  const recipientId = chosen === undefined ? fallback : chosen;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        variant={variant}
        title={title}
        {...(description ? { description } : {})}
        footer={
          <>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              size="lg"
              disabled={!reason || busy}
              onClick={() => {
                if (reason) onSubmit(reason, message.trim() || null, recipientId);
              }}
            >
              <BellRingIcon /> Llamar
            </Button>
          </>
        }
      >
        {recipients ? (
          <RecipientPicker
            options={recipients.options}
            loading={recipients.loading ?? false}
            value={recipientId}
            onChange={setChosen}
          />
        ) : null}
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Motivo">
          {reasons.map((option) => (
            <Button
              key={option}
              type="button"
              role="radio"
              aria-checked={reason === option}
              variant={reason === option ? 'default' : 'outline'}
              size="touch"
              className="justify-start"
              onClick={() => {
                setReason(option);
              }}
            >
              {STAFF_CALL_REASON_LABEL[option]}
            </Button>
          ))}
        </div>
        <Input
          aria-label="Detalle"
          placeholder="Detalle (opcional)"
          maxLength={140}
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
