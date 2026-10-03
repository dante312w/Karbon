# ADR 0004 — KDS como módulo del renderer de escritorio, servible por web

- **Estado:** aceptada (Fase 1, confirmada por el product owner)

## Contexto

La cocina necesita una pantalla dedicada: puede ser un segundo monitor del PC servidor o una tablet/TV en la cocina.

## Opciones

| Opción                                                                | Pros                                                                     | Contras                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------ |
| **Módulo del renderer de escritorio, también servido por el backend** | Un solo código; corre en Electron (2.º monitor) o en cualquier navegador | El renderer no puede usar APIs de Node/Electron directamente |
| App separada `apps/kds`                                               | Despliegue independiente                                                 | Cuarta app que mantener (auth, sockets, layout)              |
| Solo en Electron                                                      | Lo más simple                                                            | Obliga a tener un PC con la app en la cocina                 |

## Decisión

El KDS es una ruta del renderer React de escritorio. El renderer se construye con `base: './'` y solo accede a Electron mediante `window.karbon` (preload con `contextBridge`); si no existe, asume que corre en un navegador y usa la API del mismo origen.

## Consecuencias

- Buenas prácticas de seguridad de Electron obligatorias: `contextIsolation`, `sandbox`, sin `nodeIntegration`, CSP en el build.
- El build empaquetado se sirve por el protocolo propio `app://karbon` (no `file://`, cuyo origen `null` no puede aceptarse en CORS sin abrir la API a cualquier iframe aislado). El backend acepta siempre ese origen (`DESKTOP_APP_ORIGIN` en `@karbon/types`).
- El backend servirá el build del renderer (Fase 5) además de la PWA.
