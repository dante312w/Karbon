# ADR 0012 — La entrega la confirma el mesero, y cada quien opera sus pedidos

- **Estado:** aceptada (aprobada por el product owner en la auditoría de meseros, cocina y caja)
- **Complementa:** [ADR 0007](0007-comandas-y-cuenta-dividida.md) (flujo de comandas) y [ADR 0009](0009-modo-bar.md) (permisos del rol Barra)

## Contexto

Cocina marcaba "Entregado" sin saber si el plato llegó a la mesa: solo sabe que lo dejó en el pase. El mesero, que es quien lo lleva, no podía confirmarlo. Además, cualquier usuario con `orders:update` podía modificar pedidos de otro mesero, y los cronómetros del KDS seguían avanzando en las comandas entregadas.

## Opciones

| Opción                                                            | Pros                                                                       | Contras                                                                          |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Ruta propia de entrega en el pedido, con permiso y propiedad**  | RBAC claro (`orders:deliver`); la regla de propiedad vive en un solo lugar | Una ruta más                                                                     |
| Reusar `PATCH /kitchen/tickets/:id/status` con permiso por estado | Una sola ruta                                                              | Mezcla dos actores en un endpoint; el permiso depende del cuerpo de la solicitud |
| Nuevo estado de mesa "Listo para servir"                          | Visible en el plano sin más datos                                          | Cambia un enum persistido, el plano y los reportes                               |

## Decisión

- **Actores:** cocina/barra mueve `NEW → PREPARING → READY` (y deshace su paso). El servicio confirma `READY → DELIVERED` en `POST /orders/:id/tickets/:ticketId/deliver`, y lo deshace en `.../undeliver`. Las transiciones de cada actor están en `order-rules.ts`.
- **Permisos:** `orders:deliver` (confirmar entregas) y `orders:manage_any` (operar pedidos de otros meseros). Por defecto el mesero tiene el primero; caja y administración, ambos. En modo bar, el rol de sistema Barra suma ambos (`systemRolePermissions(role, mode)`).
- **Propiedad:** `canManageOrder(actor, waiterId)` en `@karbon/utils` es la regla única: la usan el backend (`assertCanManageOrder`) y las pantallas, para no ofrecer lo que el servidor rechazaría.
- **Tiempos:** cada paso guarda su marca (`started_at`, `ready_at`, `delivered_at`, `delivered_by_id`); retroceder borra la del paso deshecho. `ticketTiming()` calcula los cronómetros a partir de esas marcas: una comanda entregada tiene un total fijo y no depende de la hora actual.
- **Cobro:** al pagar el pedido completo, lo que seguía en `READY` pasa a `DELIVERED` con `delivered_by_id` nulo (el sistema) y se registra `order.auto_deliver` en la auditoría. Lo que aún se prepara sigue su curso.
- **Mesa:** no hay estado nuevo; la mesa sigue "Esperando comida" hasta que todo se entrega.

## Consecuencias

- Los permisos nuevos llegan a instalaciones existentes por migración de datos: todo rol con `orders:create` recibe `orders:deliver`. Los roles personalizados de cocina pierden la entrega, y el administrador puede asignarla.
- El KDS muestra "Entregado" solo a quien puede confirmarlo; en restaurante, cocina ve "Por recoger" con el tiempo de espera del mesero.
- Las sesiones abiertas antes de la actualización ven los permisos nuevos al renovar el token (15 minutos como máximo) o al volver a ingresar.
- La misma regla de propiedad se aplicará a las demás operaciones de mesa y pedido (mover, unir, editar, cancelar).
