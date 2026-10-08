import { Badge } from '../components/badge';
import { StatusDot } from '../components/status-dot';
import { cn } from '../lib/cn';
import type { ServerConnection } from './use-server-health';

const PRESENTATION: Record<ServerConnection['status'], { label: string; dot: string }> = {
  checking: { label: 'Conectando…', dot: 'bg-muted-foreground animate-pulse' },
  online: { label: 'Conectado al servidor', dot: 'bg-status-free' },
  degraded: { label: 'Base de datos no disponible', dot: 'bg-urgency-warning' },
  offline: { label: 'Sin conexión con el servidor', dot: 'bg-urgency-critical' },
};

export interface ConnectionBadgeProps {
  connection: ServerConnection;
  className?: string;
}

export function ConnectionBadge({ connection, className }: ConnectionBadgeProps) {
  const { label, dot } = PRESENTATION[connection.status];
  return (
    <Badge variant="outline" role="status" className={cn('gap-2 py-1', className)}>
      <StatusDot className={dot} />
      {label}
    </Badge>
  );
}
