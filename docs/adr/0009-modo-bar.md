# ADR 0009 — Modo bar como configuración, no como otra aplicación

- **Estado:** aceptada (pedido del product owner durante la construcción)

## Contexto

Se pidió un modo para bares que reutilice meseros, inventario, caja y todo lo demás, cambiando "cocina" por "barra". Un bar no tiene cocina: todas las comandas se preparan en la barra, y el vocabulario de la operación cambia (notas rápidas, estados de mesa, nombre del rol).

## Opciones

| Opción                                          | Pros                                                               | Contras                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| **Un campo `businessMode` en la configuración** | Un solo código; se cambia en caliente; nada que mantener dos veces | Cada texto visible que dependa del modo debe pasar por un punto único       |
| Otra app / otro build para bares                | Libertad total de UI                                               | Duplica pedidos, caja, inventario, KDS; las correcciones se hacen dos veces |
| Estaciones configurables sin noción de modo     | Máxima flexibilidad                                                | Más configuración para un cliente no técnico; no resuelve el vocabulario    |

## Decisión

`restaurant_settings.business_mode` (`RESTAURANT` | `BAR`), elegido en el asistente y editable en Configuración → Negocio.

- **Vocabulario:** `getTerminology(mode)` en `@karbon/utils` es la única fuente de los textos que cambian ("Cocina"/"Barra", "Enviar a cocina"/"Enviar a barra", "Esperando comida"/"Esperando pedido", notas rápidas). Escritorio, PWA y KDS la consumen con `useTerminology()`.
- **Enrutamiento:** `effectiveStation()` envía todas las comandas a la estación `BAR` en modo bar; en restaurante cada producto conserva su estación (cocina o bar). `enabledStations(mode)` decide qué columnas muestra el KDS.
- **Rol:** el rol de sistema `KITCHEN` se renombra a "Barra" al cambiar de modo (el código y los permisos no cambian).
- **Tiempo real:** el evento `settings.updated` hace que todas las terminales recarguen la configuración y el vocabulario sin reiniciar.

## Consecuencias

- Meseros, mesas, inventario por receta, caja, facturación, clientes y reportes son idénticos en ambos modos (cubierto por la prueba de integración "modo bar").
- Un texto nuevo que dependa del modo debe agregarse a `Terminology`, no escribirse en un componente.
- Cambiar de modo con comandas abiertas no las mueve de estación: aplica a los envíos siguientes.
