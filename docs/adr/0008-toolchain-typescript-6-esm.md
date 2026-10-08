# ADR 0008 — Toolchain: TypeScript 6, backend ESM, Vite 8 + tsdown

- **Estado:** aceptada (Fase 1)

## Contexto

En septiembre de 2026 las versiones estables más recientes son TypeScript 7.0 (compilador nativo), NestJS 12 (solo ESM), Prisma 7 (sin motor Rust, con adaptadores de driver) y Vite 8.

## Decisión

- **TypeScript 6.0.x**: `typescript-eslint` exige `<6.1` y Nest CLI usa 6.0. Se migrará a 7 cuando el ecosistema lo soporte (Dependabot ignora el salto mayor).
- **Backend ESM** (`"type": "module"`, `module: NodeNext`), requisito de NestJS 12. Imports relativos con extensión `.js`.
- **Prisma 7**: `prisma.config.ts`, generador `prisma-client` (código en `src/generated`, no versionado, generado en `postinstall`) y `@prisma/adapter-pg`. Índices parciales con la _preview feature_ `partialIndexes` (una sola caja abierta a la vez, garantizado por la BD).
- **Electron**: `electron-vite` no soporta Vite 8, así que el renderer usa Vite 8 y el proceso principal y el preload se empaquetan con `tsdown` (preload en CommonJS por el sandbox).
- **Pruebas**: Vitest en todo el monorepo (NestJS 12 lo usa por defecto).
- **Node 24 LTS** como versión objetivo (`.nvmrc`).

## Consecuencias

- `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride` y `verbatimModuleSyntax` en todos los paquetes.
- ESLint `strictTypeChecked` + `stylisticTypeChecked`, con `no-explicit-any` como error.
