# ADR 0014 — Llamado a un mesero elegido, con "vista" y escalamiento

- **Estado:** aceptada
- **Reemplaza en parte:** [ADR 0013](0013-llamados-internos-persistidos.md) (destinatario deducido por el servidor y aviso a toda la sala `waiters`)

## Contexto

Con la ADR 0013, el servidor deducía a quién iba un llamado (el mesero del pedido) y el aviso viajaba a todos los meseros: el celular solo evitaba sonar en los demás, pero igual lo mostraba. Si la mesa no tenía pedido o tenía cuentas de varios meseros, el llamado iba a todos. En la operación real caja necesita llamar a **un** mesero en particular (el de la mesa, o el que esté libre) y saber si el aviso le llegó.

## Opciones

| Opción                                                        | Pros                                                       | Contras                                                                     |
| ------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Quien llama elige (`waiterId` opcional); sala por usuario** | Control explícito; solo le llega a él; "Todos" sigue igual | Un selector más en la interfaz                                              |
| Seguir deduciendo en el servidor                              | Un toque                                                   | No permite llamar a otro mesero; sin mesa o con varios, a todos             |
| Notificaciones push del sistema                               | Llega con la app cerrada                                   | Requiere HTTPS y suscripción por equipo; no funciona sin red externa en iOS |

## Decisión

- **Destinatario explícito:** `POST /staff-calls` acepta `waiterId` (omitido o `null` = todos). El servidor valida que sea un usuario activo que entrega en la mesa y no cobra (`isWaiterCallRecipient`). Las apps marcan por defecto al mesero de la mesa; el KDS, con un toque, al mesero del pedido.
- **Entrega solo al destinatario:** un llamado dirigido se publica en la sala `user:<id>` del mesero (y en la de quien llamó); los demás meseros ni lo reciben ni lo listan ni pueden tomarlo. El general sigue en la sala `waiters`. El selector (`GET /staff-calls/recipients`) muestra quién tiene un equipo conectado, según las salas del socket en memoria (servidor único, ADR 0011).
- **"Vista":** `seen_at`/`seen_by_id`. La marca el equipo del destinatario cuando el aviso aparece con la app visible (`useMarkStaffCallsSeen`); "Voy" también la marca. Quien llama ve Enviada → Vista → Va … → Atendida.
- **Escalamiento opcional:** `restaurant_settings.staff_call_escalate_seconds` (0 = nunca, por defecto). Una tarea cada 5 s escala los dirigidos que siguen pendientes: llena `escalated_at`, conserva `target_user_id` y avisa a todos los meseros con sonido. Se escala una sola vez.

## Consecuencias

- El mesero desconectado no pierde el llamado: queda en la base y lo ve al volver; si nadie responde y el escalamiento está activo, lo atiende otro.
- `staff_calls` registra a quién iba aunque se escale, quién lo vio, quién fue y cuándo.
- La regla de quién atiende un llamado (`canAnswerStaffCallAs`) vive en `@karbon/utils` y la usan el servidor y las apps.
