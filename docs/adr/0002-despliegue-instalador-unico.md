# ADR 0002 — Despliegue como instalador único

- **Estado:** aceptada (Fase 1, confirmada por el product owner)

## Contexto

Un PC del restaurante actúa como servidor (backend + base de datos) y todo debe funcionar sin internet. El cliente final no es técnico.

## Opciones

| Opción                                                               | Pros                                                                          | Contras                                                           |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **Instalador único**: Electron incluye backend + PostgreSQL embebido | Un `.exe`, sin Docker; soporte simple; el servidor sigue activo en la bandeja | Instalador ~200 MB; gestionamos nosotros la versión de PostgreSQL |
| Servicios de Windows (PostgreSQL + backend), Electron solo cliente   | Arranca sin sesión iniciada                                                   | Instalador complejo, requiere administrador, más soporte          |
| Docker Compose en el PC del restaurante                              | Idéntico a desarrollo                                                         | Docker Desktop + WSL2: pesado y frágil en equipos modestos        |

## Decisión

Instalador único. El proceso principal de Electron arranca PostgreSQL embebido (binarios portables 18.x) y el backend como proceso hijo, los supervisa y los mantiene vivos en la bandeja del sistema aunque se cierre la ventana. Docker queda para desarrollo y CI.

## Consecuencias

- El backend no puede depender de módulos nativos compilados contra un ABI concreto (por eso `bcryptjs` en lugar de `bcrypt`).
- Migraciones (`prisma migrate deploy`) y seed idempotente se ejecutan en cada arranque.
- PostgreSQL de desarrollo (`postgres:18` en Docker) coincide con la versión embebida.
- Pendiente para la fase de empaquetado: supervisión de procesos, backups automáticos y reglas del firewall de Windows.
