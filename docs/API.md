# API de Karbon POS

- **REST** para operaciones (validadas, auditables, idempotentes).
- **Socket.io** para notificaciones en tiempo real.
- Contratos tipados en [`@karbon/types`](../packages/types/src/index.ts) y cliente tipado en [`@karbon/client`](../packages/client/src/api.ts): los DTOs de este documento son esos tipos.
- Documentación interactiva (Swagger / OpenAPI 3): `http://<servidor>:3000/api/docs` · JSON: `/api/docs-json` (desactivada en el instalador; `SWAGGER_ENABLED=true` para habilitarla).

## Convenciones

| Tema          | Regla                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base          | `/api/v1` (versionado por URI)                                                                                                                                |
| Formato       | JSON UTF-8. Campos en `camelCase`                                                                                                                             |
| Autenticación | `Authorization: Bearer <accessToken>` (JWT, 15 min). Renovación con refresh token rotativo (`POST /auth/refresh`)                                             |
| Dinero        | Enteros en **unidades menores** (`MinorUnits`): `$25.000 COP` → `2500000` ([ADR 0005](adr/0005-dinero-en-unidades-menores.md))                                |
| Fechas        | ISO 8601 en UTC (`2026-09-25T18:30:00.000Z`)                                                                                                                  |
| Paginación    | `?page=1&pageSize=50&search=texto` (máx. 200) → `{ items, total, page, pageSize }`                                                                            |
| Rangos        | `?from=&to=` (ISO, inclusivos) en pedidos, facturas, gastos, kardex y auditoría                                                                               |
| Idempotencia  | Crear pedidos, agregar ítems, enviar a preparación y cobrar aceptan `Idempotency-Key`: reintentar con la misma clave devuelve la misma respuesta sin duplicar |
| Concurrencia  | Las modificaciones de pedidos envían `version`; si no coincide → `409 ORDER_VERSION_CONFLICT`                                                                 |
| Validación    | Campos no declarados en el DTO se rechazan (`400 VALIDATION_FAILED`)                                                                                          |
| Límite de uso | 600 solicitudes/min por IP; 10/min en login, PIN, refresh y asistente de instalación (`429 RATE_LIMITED`)                                                     |

### Errores

Todas las respuestas de error siguen `ApiErrorBody`:

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "El pedido fue modificado por otra terminal",
  "code": "ORDER_VERSION_CONFLICT",
  "path": "/api/v1/orders/0192…/items",
  "timestamp": "2026-09-25T18:30:00.000Z",
  "requestId": "b1f0…"
}
```

Códigos (`ErrorCode` en `@karbon/types`): genéricos (`VALIDATION_FAILED`, `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `REFRESH_TOKEN_INVALID`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`), idempotencia (`IDEMPOTENCY_IN_PROGRESS`, `IDEMPOTENCY_KEY_REUSED`), pedidos (`ORDER_VERSION_CONFLICT`, `ORDER_NOT_EDITABLE`, `ORDER_EMPTY`, `ORDER_HAS_PAYMENTS`, `ITEM_ALREADY_SENT`, `PRODUCT_UNAVAILABLE`, `TABLE_OCCUPIED`, `TABLE_REQUIRED`, `INVALID_STATUS_TRANSITION`), caja (`CASH_SESSION_REQUIRED`, `CASH_SESSION_ALREADY_OPEN`, `PAYMENT_EXCEEDS_BALANCE`, `INSUFFICIENT_TENDERED`), facturación e impresión (`NUMBERING_RANGE_EXHAUSTED`, `FISCAL_PROVIDER_NOT_CONFIGURED`, `PRINTER_UNREACHABLE`, `PRINTER_NOT_SUPPORTED`) y sistema (`SETUP_ALREADY_COMPLETED`, `LICENSE_INVALID` con `402`, `BACKUP_UNAVAILABLE`).

## Endpoints

Todas las rutas cuelgan de `/api/v1`. "Público" = sin token; "autenticado" = cualquier usuario con sesión.

### Sistema, instalación y licencia

| Método y ruta                     | Permiso          | Descripción                                                                                                               |
| --------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                     | público          | Estado del servidor y de la base (`503` + `degraded` si PostgreSQL no responde)                                           |
| `GET /system/info`                | público          | Nombre, versión, URLs LAN (sin VPN, WSL ni Docker) y dónde abrir la app de meseros (`waiterAppUrls`) y el KDS (`kdsUrls`) |
| `GET /system/certificate`         | público          | Si hay HTTPS, sus URLs y la huella de la CA local                                                                         |
| `GET /system/ca.crt`              | público          | Certificado de la CA local para instalar en los celulares                                                                 |
| `GET /setup/status`               | público          | `{ required, businessMode, restaurantName }`                                                                              |
| `POST /setup`                     | público, 1 vez   | Asistente: negocio, modo, moneda, administrador y demo; devuelve la sesión                                                |
| `GET /license`                    | autenticado      | Estado: `TRIAL`, `ACTIVE`, `EXPIRED` o `INVALID`, titular y vencimiento                                                   |
| `POST /license`                   | `settings:write` | Activa una clave `KARBON1.…`                                                                                              |
| `GET /backups`                    | `settings:read`  | Respaldos disponibles                                                                                                     |
| `POST /backups`                   | `settings:write` | Respaldo manual inmediato                                                                                                 |
| `POST /backups/:fileName/restore` | `settings:write` | Restaura (antes guarda un respaldo del estado actual)                                                                     |
| `GET /audit-logs`                 | `audit:read`     | Bitácora paginada; filtros `search` (acción), `entity`, `userId`, `from`, `to`                                            |

### Autenticación, usuarios y roles

| Método y ruta                                  | Permiso                      | Descripción                                                |
| ---------------------------------------------- | ---------------------------- | ---------------------------------------------------------- |
| `POST /auth/login`                             | público                      | Usuario y clave                                            |
| `GET /auth/pin-users` · `POST /auth/pin-login` | público                      | Ingreso rápido en terminales compartidas                   |
| `POST /auth/refresh` · `POST /auth/logout`     | público (con refresh token)  | Rotación con detección de reutilización / cierre           |
| `GET /auth/me`                                 | autenticado                  | Usuario y permisos efectivos                               |
| `GET/POST /users` · `PATCH/DELETE /users/:id`  | `users:read` / `users:write` | Usuarios (PIN opcional, desactivación)                     |
| `GET/POST /roles` · `PATCH/DELETE /roles/:id`  | `roles:read` / `roles:write` | Roles personalizados con cualquier combinación de permisos |

### Configuración

| Método y ruta                                                                       | Permiso                            |
| ----------------------------------------------------------------------------------- | ---------------------------------- |
| `GET /settings` · `PATCH /settings`                                                 | autenticado / `settings:write`     |
| `GET /settings/logo` · `PUT /settings/logo`                                         | público / `settings:write`         |
| `GET /taxes` · `POST /taxes` · `PATCH /taxes/:id`                                   | autenticado / `settings:write`     |
| `GET /printers` · `POST` · `PATCH/DELETE /printers/:id` · `POST /printers/:id/test` | autenticado / `settings:write`     |
| `GET /numbering-ranges` · `POST` · `PATCH /numbering-ranges/:id`                    | `settings:read` / `settings:write` |

### Salón

| Método y ruta                                                                                                | Permiso                                    |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| `GET/POST /areas` · `PATCH/DELETE /areas/:id` (cada área incluye sus `elements` del plano)                   | `tables:read` / `tables:write`             |
| `POST /areas/:id/elements` · `PATCH/DELETE /floor-elements/:id` (barra, cocina, baños, entrada, caja, pared) | `tables:write`                             |
| `GET/POST /tables` · `GET/PATCH/DELETE /tables/:id`                                                          | `tables:read` / `tables:write`             |
| `POST /tables/:id/merge` · `POST /tables/:id/unmerge` · `PATCH /tables/:id/status`                           | `tables:operate`                           |
| `GET/POST /reservations` · `PATCH/DELETE /reservations/:id`                                                  | `reservations:read` / `reservations:write` |

Cada mesa trae en `activeOrders` el resumen de sus cuentas abiertas: total, mesero, `itemCount`, `readyTickets` (comandas listas para recoger) y `preparingSince` (envío de la comanda más antigua aún en cocina). Con eso el celular pinta el mapa sin cargar cada pedido; `table.changed` lo mantiene al día.

### Catálogo

| Método y ruta                                                         | Permiso                                      |
| --------------------------------------------------------------------- | -------------------------------------------- |
| `GET/POST /categories` · `PATCH/DELETE /categories/:id`               | `catalog:read` / `catalog:write`             |
| `GET /products`                                                       | `catalog:read` o `kitchen:update` (KDS)      |
| `GET /products/:id` · `POST /products` · `PATCH/DELETE /products/:id` | `catalog:read` / `catalog:write`             |
| `PATCH /products/:id/availability`                                    | `catalog:write` o `kitchen:update` (agotado) |
| `GET /products/:id/image` · `PUT /products/:id/image`                 | público / `catalog:write`                    |
| `GET /products/:id/recipe` · `PUT /products/:id/recipe`               | `catalog:read` / `catalog:write`             |

### Pedidos y preparación (cocina o barra)

| Método y ruta                                          | Permiso                          | Descripción                                                     |
| ------------------------------------------------------ | -------------------------------- | --------------------------------------------------------------- |
| `GET /orders` · `GET /orders/:id`                      | `orders:read`                    | Historial paginado (`status`, `from`, `to`, `search`) y detalle |
| `POST /orders`                                         | `orders:create`                  | Mesa, para llevar o domicilio; puede enviarse de inmediato      |
| `PATCH /orders/:id`                                    | `orders:update`                  | Cliente, comensales, etiqueta, notas y propina                  |
| `POST /orders/:id/items`                               | `orders:update`                  | Agregar ítems (idempotente)                                     |
| `PATCH /orders/:id/items/:itemId`                      | `orders:update`                  | Cantidad, notas, descuento (`orders:discount`)                  |
| `POST /orders/:id/items/:itemId/cancel` · `/duplicate` | `orders:update`                  | Anular (con motivo) o duplicar un ítem                          |
| `PUT /orders/:id/items/order`                          | `orders:update`                  | Reordenar                                                       |
| `POST /orders/:id/send`                                | `orders:send`                    | Envía lo pendiente: una comanda por estación (idempotente)      |
| `POST /orders/:id/request-bill`                        | `orders:request_bill`            | Mesa en "esperando cuenta"                                      |
| `POST /orders/:id/tickets/:ticketId/deliver`           | `orders:deliver` + propiedad     | Confirma que una comanda **Listo** llegó a la mesa (ver abajo)  |
| `POST /orders/:id/tickets/:ticketId/undeliver`         | `orders:deliver` + propiedad     | Deshace una entrega confirmada por error (vuelve a **Listo**)   |
| `POST /orders/:id/move`                                | `tables:operate`                 | Mover a otra mesa libre                                         |
| `POST /orders/:id/split`                               | `orders:update`                  | Dividir la cuenta por ítems en un pedido nuevo                  |
| `POST /orders/:id/duplicate`                           | `orders:create`                  | Repetir el pedido                                               |
| `POST /orders/:id/cancel`                              | `orders:cancel`                  | Anular con motivo (no si tiene pagos)                           |
| `GET /kitchen/tickets?station=&status=`                | `kitchen:read`                   | Comandas del KDS                                                |
| `PATCH /kitchen/tickets/:id/status`                    | `kitchen:update`                 | `NEW → PREPARING → READY` (o retroceder un paso)                |
| `POST /kitchen/tickets/:id/print`                      | `kitchen:update` o `orders:send` | Reimprime la comanda en su impresora                            |

**Entrega en la mesa** ([ADR 0012](adr/0012-entrega-confirmada-por-el-mesero.md)). Cocina o barra llevan la comanda hasta **Listo**; pedirle `DELIVERED` al KDS responde `409 INVALID_STATUS_TRANSITION`. La entrega la confirma el mesero del pedido; con `orders:manage_any` (caja, administración y la barra en modo bar) se confirma la de cualquier pedido; si no, `403 FORBIDDEN`. Cada paso guarda su hora y retroceder borra la del paso deshecho, así los cronómetros se calculan siempre con marcas reales. Al cobrar el pedido completo, lo que seguía en **Listo** pasa a **Entregado** sin `deliveredBy` y queda en la bitácora (`order.auto_deliver`).

### Caja, pagos y facturación

| Método y ruta                                                                                     | Permiso                                                                                                     |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `GET /cash-sessions/current` · `GET /cash-sessions` · `GET /cash-sessions/:id`                    | `cash:read`                                                                                                 |
| `POST /cash-sessions/open`                                                                        | `cash:open`                                                                                                 |
| `POST /cash-sessions/:id/close`                                                                   | `cash:close` (arqueo y diferencia)                                                                          |
| `GET /cash-sessions/:id/movements` · `POST /cash-sessions/current/movements`                      | `cash:read` / `cash:movements`                                                                              |
| `GET /expenses` · `POST /expenses` · `DELETE /expenses/:id`                                       | `cash:read` / `expenses:write`                                                                              |
| `GET /orders/:id/payments` · `POST /orders/:id/payments`                                          | `orders:read` / `payments:create` (idempotente; efectivo, tarjeta, transferencia, QR; varios pagos = mixto) |
| `POST /payments/:id/void`                                                                         | `payments:void` (reabre el pedido y repone inventario)                                                      |
| `GET /orders/:id/receipt` · `POST /orders/:id/receipt/print`                                      | `orders:read` (tiquete o precuenta)                                                                         |
| `POST /orders/:id/invoices`                                                                       | `invoices:issue`                                                                                            |
| `GET /invoices` · `GET /invoices/:id` · `GET /invoices/:id/document` · `POST /invoices/:id/print` | `invoices:issue`                                                                                            |
| `POST /invoices/:id/void`                                                                         | `invoices:void`                                                                                             |

### Inventario, compras, clientes y reportes

| Método y ruta                                                                            | Permiso                                                                                 |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `GET/POST /ingredients` · `GET/PATCH/DELETE /ingredients/:id`                            | `inventory:read` / `inventory:write`                                                    |
| `GET /inventory/movements` (kardex) · `POST /inventory/movements`                        | `inventory:read` / `inventory:write` (entrada, salida, merma, ajuste)                   |
| `GET /inventory/alerts`                                                                  | `inventory:read`                                                                        |
| `GET/POST /suppliers` · `PATCH/DELETE /suppliers/:id`                                    | `suppliers:read` / `suppliers:write`                                                    |
| `GET/POST /purchases` · `GET /purchases/:id` · `POST /purchases/:id/receive` · `/cancel` | `purchases:read` / `purchases:write`                                                    |
| `GET/POST /customers` · `GET/PATCH/DELETE /customers/:id` · `GET /customers/:id/history` | `customers:read` / `customers:write`                                                    |
| `GET /reports/dashboard?from=&to=`                                                       | `reports:read` (ventas, utilidad, por hora, por mesero, top productos, métodos de pago) |

## Tiempo real (Socket.io)

Conexión en el mismo origen que la API (`/socket.io`), autenticada con el access token:

```ts
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@karbon/types';

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(serverUrl, {
  auth: { token: accessToken },
});
socket.on('order.updated', ({ id, occurredAt, data }) => {
  /* data.order: OrderDto */
});
```

- Los clientes **no emiten** eventos: las mutaciones van por REST (`ClientToServerEvents` está vacío a propósito).
- El servidor une cada socket a salas según los permisos del usuario. Un socket con token inválido o expirado se desconecta.
- Cada evento es un `EventEnvelope<T>`: `{ id, occurredAt, data }`. Al reconectar, el cliente recarga el estado por REST y descarta eventos con `id` ya procesado. `@karbon/client` lo hace automáticamente: `bindRealtimeCache` actualiza o invalida la caché de React Query con cada evento.

### Salas

| Sala        | Quién se une                             |
| ----------- | ---------------------------------------- |
| `admin`     | Usuarios con `settings:read`             |
| `cashier`   | Usuarios con `cash:read`                 |
| `waiters`   | Usuarios con `orders:create`             |
| `kitchen`   | Usuarios con `kitchen:read`              |
| `user:<id>` | Cada usuario (notificaciones personales) |

### Eventos

| Evento              | Payload (`data`)                               | Cuándo                                                                            |
| ------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------- |
| `order.created`     | `{ order: OrderDto }`                          | Se crea un pedido (cocina, caja, administración y meseros)                        |
| `order.updated`     | `{ order: OrderDto }`                          | Ítems, envío a preparación, avance de comandas, pagos, cancelación                |
| `kitchen.ready`     | `{ ticket: KitchenTicketDto, waiterId }`       | Una comanda pasa a **Listo** (al mesero que la tomó y a caja)                     |
| `kitchen.delivered` | `{ ticket: KitchenTicketDto, waiterId }`       | Se confirma o se deshace una entrega (al mesero, cocina, caja y administración)   |
| `table.changed`     | `{ table: TableDto }`                          | Cambia el estado de una mesa, se une o se mueve un pedido                         |
| `inventory.updated` | `{ ingredientIds, lowStock: LowStockAlert[] }` | Movimientos de inventario (ventas, compras, ajustes)                              |
| `cash.closed`       | `{ session: CashSessionDto }`                  | Se cierra un turno de caja                                                        |
| `settings.updated`  | `{ settings: RestaurantSettingsDto }`          | Cambia la configuración (p. ej. restaurante ↔ bar): todas las terminales recargan |
