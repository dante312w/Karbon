import { SocketEvent } from '@karbon/types';
import { useSession, useSocketEvent, useTerminology } from '@karbon/client';
import { playChime, toast } from '@karbon/ui';
import { useNavigate } from 'react-router';
import { vibrate } from '../lib/haptics';

/**
 * Aviso al mesero cuando cocina/barra marca su comanda como lista: sonido, vibración y un
 * aviso que abre el pedido. El servidor solo le envía los listos de sus propios pedidos.
 */
export function ReadyNotifier() {
  const session = useSession();
  const terms = useTerminology();
  const navigate = useNavigate();

  useSocketEvent(SocketEvent.KITCHEN_READY, ({ ticket, waiterId }) => {
    if (waiterId !== session?.user.id) return;
    playChime('new');
    vibrate([200, 100, 200]);
    const place = ticket.tableName ?? `Pedido #${ticket.orderNumber}`;
    toast.success(`${place}: listo en ${terms.prepArea.toLowerCase()}`, {
      description: ticket.items.map((item) => `${item.quantity}× ${item.productName}`).join(', '),
      duration: 15_000,
      action: {
        label: 'Ver',
        onClick: () => {
          void navigate(`/pedido/${ticket.orderId}`);
        },
      },
    });
  });

  return null;
}
