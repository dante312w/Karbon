# ADR 0007 — Comandas (kitchen tickets) y cuenta dividida con pagos múltiples

- **Estado:** aceptada (Fase 1)

## Contexto

Un pedido de mesa se envía a cocina en rondas (bebidas, luego platos, luego postres) y los productos pueden ir a estaciones distintas (cocina o bar). El KDS mueve tarjetas por Nuevo → Preparando → Listo → Entregado. También hay que soportar pago mixto y dividir la cuenta.

## Decisión

- **Comanda** (`kitchen_tickets`): cada "enviar a cocina" crea una comanda por estación con los ítems pendientes (`sequence` = ronda). El KDS opera sobre comandas; el estado comercial del pedido (`OPEN`, `BILL_REQUESTED`, `PAID`, `CANCELLED`) es independiente.
- **Estado de la mesa**: se deriva del pedido y sus comandas y se persiste para pintar el mapa sin cálculos.
- **Pago mixto**: varios `payments` con métodos distintos en el mismo pedido (no existe un método "MIXTO").
- **Dividir cuenta**: en partes iguales = varios pagos (`splitEvenly`); por ítems = mover ítems a un pedido nuevo (`split_from_id`) y cobrarlo aparte.
- **Concurrencia**: `orders.version` para bloqueo optimista entre terminales.

## Consecuencias

- Agregar productos a un pedido ya enviado genera una comanda nueva, sin reabrir la anterior.
- A evaluar en las Fases 3/4: modificadores con precio (p. ej. "extra queso +$3.000") como entidad; hoy las notas cubren instrucciones sin costo.
