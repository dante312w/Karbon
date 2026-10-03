# ADR 0005 — Dinero: DECIMAL en BD, enteros en unidades menores en la API

- **Estado:** aceptada (Fase 1)

## Contexto

Los errores de coma flotante (`0.1 + 0.2 !== 0.3`) son inaceptables en un POS. Los clientes calculan vistas previas de totales; el backend es la fuente de verdad.

## Opciones

| Opción                                                 | Pros                                                                | Contras                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------- |
| **DECIMAL(14,2) en BD + enteros (centavos) en la API** | SQL legible y exacto para reportes y facturación; aritmética entera | Conversión en la frontera del backend                           |
| Enteros en BD y API                                    | Una sola representación                                             | SQL menos legible; `BIGINT` no se serializa a JSON directamente |
| DECIMAL en BD y números decimales en la API            | Natural de leer                                                     | Errores de coma flotante en los clientes                        |

## Decisión

- BD: `DECIMAL(14,2)` dinero, `DECIMAL(14,3)` cantidades de inventario, `DECIMAL(14,4)` costos unitarios, `DECIMAL(5,2)` tarifas.
- API: dinero como `MinorUnits` (entero, unidades menores ISO 4217); costos unitarios y cantidades como `number` con precisión documentada.
- `@karbon/utils` concentra la aritmética (porcentajes en puntos básicos, redondeo _half away from zero_, `allocate` sin pérdida de centavos) y `calculateOrderTotals`, la misma función en backend y clientes.
- Solo `apps/backend/src/common/money.ts` convierte `Decimal ↔ MinorUnits`.

## Consecuencias

- El impuesto se calcula por tarifa agrupada, para que el desglose coincida con el comprobante.
- La propina sugerida se calcula sobre el subtotal antes de impuestos.
- Los decimales de cada moneda salen de una tabla ISO 4217 explícita, no de `Intl`: las pruebas mostraron que algunas versiones de ICU reportan 0 decimales para COP, y backend, Electron y navegadores deben convertir exactamente igual. Monedas fuera de la tabla se rechazan.
