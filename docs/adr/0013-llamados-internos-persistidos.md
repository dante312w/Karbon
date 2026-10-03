# ADR 0013 — Llamados internos guardados en la base, no solo en el socket

- **Estado:** aceptada (decisión D6 de la auditoría de meseros, cocina y caja)
- **Complementa:** [ADR 0012](0012-entrega-confirmada-por-el-mesero.md) (propiedad del pedido: a qué mesero le suena un llamado)

## Contexto

Cocina y caja necesitan llamar al mesero ("Mesa 12 necesita atención", "pasa por cocina") y el mesero necesita llamar a caja ("necesito cobrar la mesa 5"). Los celulares se duermen, pierden la red del local y, en iPhone, Safari suspende la app en segundo plano: un aviso que solo viaja por el socket se pierde si nadie estaba conectado en ese segundo, y no queda registro de quién respondió.

## Opciones

| Opción                                             | Pros                                                                                    | Contras                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Tabla `staff_calls` + eventos de aviso**         | Sobrevive a reconexiones y suspensiones; estado compartido ("Va Laura"); deja historial | Una tabla y un módulo más                                                    |
| Evento efímero por Socket.io                       | Mínimo código                                                                           | Se pierde sin conexión; no hay "quién va"; sin historial                     |
| Reutilizar el estado del pedido (`BILL_REQUESTED`) | Ya existe para "pedir la cuenta"                                                        | Solo cubre un motivo; no sirve para cocina → mesero ni para mesas sin pedido |

## Decisión

- **Modelo:** `staff_calls` con destino (`WAITER` o `CASHIER`), motivo, estado (`PENDING → ACKNOWLEDGED → RESOLVED`, o `CANCELLED`), mesa, pedido, mesero destinatario, quién llamó, quién respondió y quién cerró. `CHECK`s garantizan que cada destino use sus motivos y que un llamado esté abierto exactamente mientras no tenga `closed_at`.
- **Sin duplicados:** el servidor calcula una `dedupe_key` (destino, motivo, mesa o pedido, destinatario y, para "que venga un momento" o sin mesa, quién llama). Un índice único parcial sobre los abiertos impide dos iguales aun con dos equipos tocando a la vez; repetirlo cuenta como **insistencia** (`call_count`), salvo en los 10 s siguientes (doble toque).
- **Destinatario:** lo deduce el servidor. Con pedido, su mesero; con mesa, el de su cuenta abierta (o de la mesa principal si está unida); con varias cuentas de meseros distintos o sin cuenta, todos los meseros. El cliente nunca elige a quién le suena.
- **Permisos:** `calls:waiter` (llamar al mesero: cocina, barra, caja) y `calls:cashier` (llamar a caja: meseros). Atiende al mesero quien tiene `orders:deliver`; a caja, quien tiene `payments:create`. Las reglas están en `@karbon/utils` (`staff-calls.ts`) y las usan el backend y las tres apps.
- **Avisos:** `staff_call.created` y `staff_call.updated` van a la sala del destino (`waiters` o `cashier`) y a la de quien llamó. El sobre lleva `alert: true` solo cuando debe sonar (nuevo o insistencia); las respuestas actualizan la pantalla sin sonar. Si se pierde un evento, la lista se recarga al reconectar, al volver a la app y cada minuto.
- **Cierre automático:** al cobrar el pedido completo, sus "necesito cobrar" se marcan atendidos por quien cobró; al cerrar la caja, lo que siga abierto se cancela (sin `closed_by`), para que nada suene al día siguiente.

## Consecuencias

- Un solo componente de tarjeta y un solo diálogo (`StaffCallCard`, `StaffCallDialog` en `@karbon/ui`) y un solo hook de avisos (`useStaffCallAlerts` en `@karbon/client`) sirven a caja, cocina y meseros.
- La migración da los permisos a los roles existentes: `calls:waiter` a quien prepara o cobra, `calls:cashier` a quien toma pedidos sin cobrar, ambos al administrador.
- La tabla crece con el uso; es liviana (sin texto largo) y queda como historial para reportes futuros de tiempos de respuesta.
