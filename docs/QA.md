# Calidad: pruebas y criterios de aceptación

Cómo se verifica la evolución del POS para meseros, cocina, caja e iOS: qué prueba automática cubre cada criterio y qué queda para revisar a mano en un iPhone o iPad real.

## Cómo correr las pruebas

| Comando                               | Qué corre                                                                   | Requisitos                                  |
| ------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------- |
| `npm run check`                       | Formato, lint, tipos y pruebas unitarias de todos los paquetes              | Ninguno                                     |
| `npm run test:int -w @karbon/backend` | Integración sobre PostgreSQL real: API, transacciones, permisos y Socket.io | `npm run db:up` (base `karbon_test` limpia) |
| `npm run test:e2e -w @karbon/backend` | Capa HTTP completa (validación, errores, salud) sin base de datos           | Ninguno                                     |

La integración recrea la base en cada corrida, aplica las mismas migraciones que producción y carga el seed de demostración. Los archivos corren uno tras otro sobre la misma base: cada suite usa mesas que las demás no tocan (o crea las suyas) y deja la caja y la configuración como las encontró.

## Suites

| Suite                     | Archivo                                               | Qué valida                                                                                                                                                                                                      |
| ------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operación de un turno     | `apps/backend/test/operation-flow.int.test.ts`        | Pedido → cocina → entrega → caja → inventario → facturación → cierre; propiedad del pedido; mover, unir y separar mesas; modo bar                                                                               |
| Tiempo real entre equipos | `apps/backend/test/realtime-sync.int.test.ts`         | Eventos entre celulares, caja y cocina; notas editadas en vivo; cronómetro congelado; reconexión del socket                                                                                                     |
| Notas de un toque         | `apps/backend/test/catalog-notes.int.test.ts`         | Una nota en varias categorías, asignación masiva por categoría y sugerida, notas propias de producto, nota sin asignar, permisos, duplicados, orden, activación, borrado de categoría                           |
| Unir mesas                | `apps/backend/test/table-merge.int.test.ts`           | Abrir sin productos, unir libre + abierta, dos abiertas, con pedido + sin pedido, dos con consumo (confirmación), permisos, separar parcial, liberar sin consumo                                                |
| Migraciones reversibles   | `apps/backend/test/migrations-reversible.int.test.ts` | Conversión de notas de una instalación existente, columnas de llamados y `down.sql` de punta a punta                                                                                                            |
| Llamados internos         | `apps/backend/test/staff-calls.int.test.ts`           | Selector de meseros con conexión, llamado a uno solo (los demás no lo reciben), "Todos", vista, insistencia, "Voy" solo del destinatario, mesero desconectado y escalamiento, cierre al cobrar y al cerrar caja |
| Descuentos en caja        | `apps/backend/test/order-discount.int.test.ts`        | Porcentaje y valor fijo, validación, límite, división de cuenta, pagos parciales y auditoría                                                                                                                    |
| Reglas compartidas        | `packages/utils/src/*.test.ts`                        | Totales e impuestos, cronómetros (`ticketTiming`), propiedad, notas, llamados, operaciones de mesa                                                                                                              |
| Cliente                   | `packages/client/src/**/*.test.ts`                    | Sesión, caché sin red, reanudación del socket al volver a la app (iOS)                                                                                                                                          |

## Criterios de aceptación → evidencia

### Meseros

| Criterio                               | Evidencia                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| La interfaz de mesas es clara y táctil | Revisión en 320–430 px y iPad: sin desbordes y ningún control táctil menor a 44 px (paso G)                   |
| Gestiona las operaciones permitidas    | `operation-flow` → "mesas desde el celular: cada mesero opera lo suyo"                                        |
| Puede unir mesas                       | `operation-flow` → "une una mesa ocupada…"; `realtime-sync` → "mover y unir mesas…"                           |
| Edita pedidos según permisos           | `operation-flow` → "otro mesero no modifica, envía ni cobra un pedido ajeno"                                  |
| Agrega notas                           | `realtime-sync` → "la nota de un producto sin enviar se edita…"; `note-options.test.ts` (`toggleNote`)        |
| Ve el progreso de preparación          | `table-summary.test.ts`, `kds.test.ts` (`summarizePreparation`); `realtime-sync` → "listo le llega al mesero" |
| Sabe cuánto tiempo lleva un pedido     | `kds.test.ts` (`ticketTiming`, urgencia)                                                                      |
| Marca pedidos como entregados          | `operation-flow` → "el mesero confirma la entrega…"                                                           |

### Cocina

| Criterio                                      | Evidencia                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Nuevo → Preparando → Listo                    | `operation-flow` → "avanza la comanda y avisa al mesero…"; `order-rules.test.ts`                 |
| Ya no controla la entrega                     | `operation-flow` → "cocina ya no entrega: la confirma el mesero"                                 |
| El historial de entregados mantiene su tiempo | `realtime-sync` → "al entregar, el cronómetro queda congelado"; `kds.test.ts`                    |
| Las notificaciones funcionan                  | `realtime-sync` (eventos `kitchen.ready`, `kitchen.delivered`); `staff-calls` (llamar al mesero) |

### Notas

| Criterio                          | Evidencia                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------- |
| Dependen de la categoría          | `note-options.test.ts` (`noteSuggestions`); `catalog-notes` → "el seed trae…" |
| Existe editor administrativo      | Catálogo → **Editar notas** (verificado en el navegador, paso D)              |
| Se pueden activar y desactivar    | `catalog-notes` → "una nota apagada deja de verla el mesero…"                 |
| El mesero las selecciona al pedir | `note-options.test.ts` (`toggleNote`, `hasNote`); verificado en el celular    |

### Caja

| Criterio                                   | Evidencia                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Recibe llamadas de meseros                 | `staff-calls` → "el mesero llama a caja para cobrar…"                                                  |
| Aplica descuentos                          | `order-discount` → "10 % sobre $100.000 deja $90.000…"                                                 |
| Los descuentos se validan en el backend    | `order-discount` → "valida el tipo, el valor…", "respeta el descuento máximo…", "con pagos parciales…" |
| Queda registrado quién aplicó el descuento | `order-discount` (auditoría con `previousTotal`, `discountAmount`, `finalTotal`)                       |
| Los cálculos son correctos                 | `order-totals.test.ts` (reparto entre tarifas, propina, límite con redondeo)                           |

### iOS

| Criterio                              | Evidencia                                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Funciona en iPhone y iPad             | Revisión en 320, 375, 390, 430 px, iPad vertical/horizontal y celular horizontal (emulado); lista manual de abajo |
| Los elementos son táctiles            | Botones, chips y cierre de paneles ≥ 44 px con puntero táctil; sin controles que dependan del mouse               |
| Sin problemas con notch/áreas seguras | `env(safe-area-inset-*)` en encabezado, barras inferiores, paneles y avisos, también en horizontal                |
| Funciona instalada como PWA           | Metas de iOS, manifiesto con orientación libre y pantallas de inicio generadas en el build                        |
| La comunicación LAN sigue funcionando | La PWA usa el mismo origen que el servidor del local; sin servicios en la nube                                    |
| Socket.io reconecta correctamente     | `resume-sync.test.ts` (volver de segundo plano, cambio de WiFi); `realtime-sync` → "un socket que se reconecta…"  |

## Prueba manual en iPhone y iPad

Las pruebas automáticas y la emulación del navegador no reemplazan un equipo real: iOS decide cuándo suspende la app, cuándo deja sonar audio y cómo dibuja la barra de estado. Antes de entregar una versión, recorrer esta lista en un iPhone pequeño (SE), uno moderno (con isla) y un iPad, en Safari y con la app instalada:

1. Abrir `https://<IP del PC>:3443` en Safari → Compartir → **Agregar a inicio**. Al abrirla: pantalla de inicio morada y luego la app a pantalla completa; hora y batería legibles sobre la franja de marca, en tema claro y oscuro.
2. Girar a horizontal: nada queda bajo el notch o la isla, y las acciones del pedido van en una fila.
3. Tocar un campo de búsqueda o de nota: la página **no** se agranda.
4. Tocar la pantalla una vez; desde otro equipo marcar una comanda como **Listo** y hacer un **Llamar mesero**: suenan con la app abierta.
5. Bloquear el iPhone 30 s, cambiar algo desde caja y desbloquear: la app muestra el cambio en menos de 2 s (sin recargar a mano).
6. Apagar y encender la WiFi (o pasar a otra red del local): la app vuelve sola y envía los pedidos que quedaron en cola.
7. En iPad: mapa de mesas en horizontal (6 columnas), paneles laterales completos y KDS web sin botón de pantalla completa en iPhone.

Anotar el modelo, la versión de iOS y el resultado de cada punto en la nota de la versión.
