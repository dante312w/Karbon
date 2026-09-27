# ADR 0006 — UUID v7 y "un servidor = una sucursal"

- **Estado:** aceptada (Fase 1)

## Contexto

La especificación pide dejar abierta la multi-sucursal con sincronización futura en la nube, sin activarla aún.

## Opciones

| Opción                                                                 | Pros                                                             | Contras                                                                          |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Un servidor por sucursal; UUID v7; `branch_id` en la configuración** | Esquema simple hoy; IDs únicos globales para sincronizar después | La consolidación multi-sucursal ocurre en la nube                                |
| `branch_id` en todas las tablas operativas desde ya                    | Una BD podría atender varias sucursales                          | Complejidad en cada consulta sin beneficio: un servidor LAN no atiende otra sede |
| IDs autoincrementales                                                  | Compactos                                                        | Colisionan entre sucursales al sincronizar                                       |

## Decisión

Cada instalación es una sucursal con identidad `restaurant_settings.branch_id`. Todas las entidades usan UUID v7 (ordenable por tiempo, buen comportamiento en índices B-tree). Los números legibles (pedido #1234, facturas) son consecutivos locales. Todas las tablas tienen `created_at`/`updated_at` y los datos maestros usan borrado lógico, requisitos para una sincronización incremental.

## Consecuencias

- La futura sincronización etiquetará los registros con `branch_id` en la nube (patrón outbox en una fase posterior).
- El token del QR de mesa usa UUID v4 (no predecible), no v7.
