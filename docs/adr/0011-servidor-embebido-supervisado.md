# ADR 0011 — Servidor embebido: migrador propio y supervisión desde Electron

- **Estado:** aceptada (Fase 10). Precisa las consecuencias de [ADR 0002](0002-despliegue-instalador-unico.md).

## Contexto

ADR 0002 preveía ejecutar `prisma migrate deploy` al arrancar. En el instalador eso obliga a incluir la CLI de Prisma y sus motores (decenas de MB, binarios por plataforma) solo para aplicar SQL ya versionado. Además hacía falta decidir cómo se controlan PostgreSQL y el backend desde Electron.

## Decisión

- **Migrador propio** (`apps/backend/src/database/migrator.ts`): aplica en orden las carpetas de `prisma/migrations`, cada una en su transacción, registrándolas en `_prisma_migrations` con el mismo checksum SHA-256 que Prisma. Así una base creada por el instalador y una creada con la CLI son intercambiables (probado en `migrator.int.test.ts`). Un lock consultivo evita dos migraciones simultáneas; una migración ya aplicada con otro checksum detiene el arranque.
- **PostgreSQL** se controla con `pg_ctl` (no como proceso hijo directo): `initdb --auth scram-sha-256` la primera vez, escucha solo en `127.0.0.1` con una clave aleatoria guardada en `server.json`, y se apaga con `pg_ctl stop -m fast` para un checkpoint limpio. Si ya está corriendo (p. ej. tras un cierre forzado de Electron) se reutiliza.
- **Backend** como proceso hijo con el Node de Electron (`ELECTRON_RUN_AS_NODE`): reinicio automático (máximo 5 por minuto) y vigilancia del PID del padre (`KARBON_PARENT_PID`) para no quedar huérfano.
- **Recursos** (`staging/`) fuera del asar: backend con sus `node_modules` de producción, clientes web, binarios de PostgreSQL y `pg_dump`/`pg_restore` con la clausura de DLL que importan (leída de la tabla de importaciones PE) y el runtime de Visual C++ local.

## Consecuencias

- El instalador pesa ~170 MB y no depende de nada instalado en el equipo (ni PostgreSQL ni el redistribuible de Visual C++).
- Cambios de esquema siguen el flujo normal de Prisma (`prisma migrate dev`); el migrador solo aplica lo versionado.
- Un corte de luz deja PostgreSQL con recuperación de WAL al siguiente arranque; no se pierde lo confirmado.
