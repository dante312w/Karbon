# ADR 0001 — Monorepo con npm workspaces + Turborepo

- **Estado:** aceptada (Fase 1)

## Contexto

Tres aplicaciones (backend, escritorio, PWA) comparten contratos, lógica de dominio y sistema de diseño. La especificación exige scripts `npm install`, `npm run dev` y `npm run build`.

## Opciones

| Opción                         | Pros                                                                          | Contras                                  |
| ------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------- |
| **npm workspaces + Turborepo** | Sin gestor adicional; caché de tareas y orden por dependencias; config mínima | Turborepo es una dependencia más         |
| npm workspaces solos           | Cero herramientas extra                                                       | Sin caché; orden de build manual         |
| Nx                             | Generadores, grafo avanzado                                                   | Curva de aprendizaje y acoplamiento alto |
| pnpm                           | Instalación estricta y rápida                                                 | Contradice los scripts `npm` pedidos     |

## Decisión

npm workspaces (`apps/*`, `packages/*`) orquestado con Turborepo. `@karbon/types` y `@karbon/utils` se compilan a `dist/` porque el backend los consume desde Node; `@karbon/ui` se consume como fuente TypeScript porque solo lo usan apps con Vite.

## Consecuencias

- `turbo run build` compila en orden `types → utils → apps`; `lint`, `typecheck` y `test` dependen de `^build`.
- Los workspaces se referencian con versión `*` (npm no soporta el protocolo `workspace:`).
- Las vulnerabilidades transitivas se corrigen con `overrides` en el `package.json` raíz.
