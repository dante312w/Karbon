import { type StaffCallDto, type StaffCallReason, StaffCallStatus } from '@karbon/types';
import {
  elapsedLabel,
  STAFF_CALL_REASON_LABEL,
  staffCallStatusText,
  staffCallTitle,
} from '@karbon/utils';
import { BellRingIcon, FootprintsIcon } from 'lucide-react';
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
  /** `side` en el celular (panel), `modal` en el escritorio. */
  variant?: 'modal' | 'side';
  busy?: boolean;
  onSubmit: (reason: StaffCallReason, message: string | null) => void;
  onClose: () => void;
}

/** Elegir el motivo (y un detalle opcional) antes de llamar al mesero o a caja. */
export function StaffCallDialog({
  title,
  description,
  reasons,
  defaultReason,
  variant = 'modal',
  busy = false,
  onSubmit,
  onClose,
}: StaffCallDialogProps) {
  const [reason, setReason] = useState<StaffCallReason | undefined>(defaultReason ?? reasons[0]);
  const [message, setMessage] = useState('');
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
                if (reason) onSubmit(reason, message.trim() || null);
              }}
            >
              <BellRingIcon /> Llamar
            </Button>
          </>
        }
      >
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
