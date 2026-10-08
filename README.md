# Karbon POS

Sistema POS para **restaurantes y bares** que funciona **sin internet**, sobre la red local del negocio:

- Un **PC servidor** ejecuta la app de escritorio (POS, caja, administración, reportes), el backend y la base de datos, todo desde un único instalador.
- Los **meseros** toman pedidos desde su celular (PWA instalable, sigue funcionando si se cae la WiFi un momento).
- **Cocina o barra** recibe las comandas al instante en un tablero KDS con cronómetro, colores por tiempo y sonido.
- **Modo bar**: el mismo sistema con "Barra" en lugar de "Cocina"; meseros, inventario, caja y reportes son idénticos.
- **Inventario por receta** con kardex, compras, proveedores y alertas de stock mínimo.
- **Caja** con apertura, ingresos/retiros, gastos, cobro mixto (efectivo, tarjeta, transferencia, QR), cuenta dividida y cierre con arqueo.
- **Tiquetes y facturas** en impresora térmica (ESC/POS), A4 o PDF; preparado para facturación electrónica DIAN.
- **Clientes**, **reportes** (ventas, utilidad, horas pico, meseros, productos), **auditoría**, **respaldos** y **licencias**.

## Estado

| Fase | Entregable                                                              | Estado                     |
| ---- | ----------------------------------------------------------------------- | -------------------------- |
| 1    | Arquitectura, wireframes, monorepo, modelo de datos, GitHub             | ✅                         |
| 2    | Backend (REST + WebSocket + auth + RBAC + Swagger)                      | ✅                         |
| 3    | Escritorio: POS, mesas, pedidos                                         | ✅                         |
| 4    | PWA para meseros (offline)                                              | ✅                         |
| 5    | Pantalla de cocina / barra (KDS)                                        | ✅                         |
| 6    | Inventario, compras y proveedores                                       | ✅                         |
| 7    | Caja, pagos y facturación                                               | ✅                         |
| 8    | Reportes, clientes y configuración                                      | ✅                         |
| 9    | Optimización y pruebas                                                  | ✅                         |
| 10   | Lanzamiento: instalador, servidor embebido, HTTPS, licencias, respaldos | ✅ (falta firma de código) |

## Stack

| Capa       | Tecnología                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| Backend    | Node 24 · NestJS 12 (ESM) · Prisma 7 · PostgreSQL 18 · Socket.io · Swagger · class-validator · Helmet   |
| Escritorio | Electron 44 · React 19 · Vite 8 · TailwindCSS 4 · componentes estilo shadcn/ui · Recharts · tsdown      |
| Meseros    | PWA: React 19 · Vite 8 · vite-plugin-pwa (Workbox) · IndexedDB                                          |
| Compartido | TypeScript 6 estricto · `@karbon/types` · `@karbon/utils` · `@karbon/client` · `@karbon/ui`             |
| Calidad    | Turborepo · ESLint (typescript-eslint strict) · Prettier · Vitest · Husky + commitlint · GitHub Actions |

## Estructura

```
apps/
  backend/      API REST + WebSocket, Prisma (schema, migraciones, seed), respaldos, TLS, licencias
  desktop/      Electron: POS, caja, administración y KDS; supervisor del servidor embebido
  mobile/       PWA de meseros
packages/
  types/        Contratos compartidos: DTOs, enums, permisos RBAC, eventos y errores
  utils/        Lógica pura: dinero, totales de pedido, modo bar, tiempos del KDS
  client/       Cliente HTTP tipado, sesión, tiempo real, React Query y cola offline
  ui/           Sistema de diseño: tokens, tema claro/oscuro, componentes, logo
docs/           Arquitectura, API, base de datos, despliegue, manual, ADRs y wireframes
.github/        CI, instalador de Windows, Dependabot y plantillas
```

## Inicio rápido (desarrollo)

Requisitos: **Node 24 LTS**, npm 10+ y Docker Desktop.

```bash
npm install
cp apps/backend/.env.example apps/backend/.env
npm run db:up && npm run db:deploy && npm run db:seed
npm run dev
```

- API: <http://localhost:3000/api/v1/health> · Swagger: <http://localhost:3000/api/docs>
- Escritorio: se abre la ventana de Electron (renderer en <http://localhost:5173>)
- PWA meseros: <http://localhost:5174> (y `http://<IP-del-PC>:5174` desde el celular)

Alternativa sin Node (solo la API, sin app de meseros): `docker compose --profile demo up --build` levanta PostgreSQL + backend con datos demo. Usa el puerto 3000: detenlo antes de `npm run dev`.

### Usuarios de demostración (solo desarrollo)

| Usuario  | Rol           | Contraseña  | PIN  |
| -------- | ------------- | ----------- | ---- |
| `admin`  | Administrador | `Admin123*` | —    |
| `caja`   | Cajero        | `Demo123*`  | 1111 |
| `laura`  | Mesera        | `Demo123*`  | 2222 |
| `andres` | Mesero        | `Demo123*`  | 3333 |
| `cocina` | Cocina        | `Demo123*`  | 4444 |

La clave del administrador es la de la primera vez que se creó la base: `Admin123*` con `npm run db:seed` (`apps/backend/.env`) o `KarbonDemo2026!` si la creó Docker Compose. El seed no cambia la clave de un administrador que ya existe. En modo bar, el usuario de cocina es `barra` (mismo PIN 4444).

En una instalación real no hay usuarios ni claves por defecto: el administrador se crea en el asistente de primera instalación.

## Instalador de Windows

```bash
npm run desktop:release      # → apps/desktop/release/Karbon-POS-Setup-<versión>.exe
```

Incluye el backend, la PWA, el KDS web y PostgreSQL 18; no requiere nada instalado en el equipo del cliente. Detalles (datos, puertos, HTTPS, respaldos, licencias) en [DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Scripts

| Comando                                    | Descripción                                                            |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| `npm run dev`                              | Backend + escritorio + PWA en modo desarrollo                          |
| `npm run dev:backend`                      | Solo el backend                                                        |
| `npm run electron`                         | Solo la app de escritorio                                              |
| `npm run mobile`                           | Solo la PWA de meseros                                                 |
| `npm run build`                            | Compila todo el monorepo (en orden de dependencias, con caché)         |
| `npm run check`                            | Formato + lint + typecheck + pruebas (lo mismo que la CI)              |
| `npm test`                                 | Pruebas unitarias de todos los paquetes                                |
| `npm run test:int -w @karbon/backend`      | Pruebas de integración sobre PostgreSQL real (`TEST_DATABASE_URL`)     |
| `npm run dev:embedded -w @karbon/desktop`  | Escritorio con servidor embebido, igual que el instalador              |
| `npm run desktop:package`                  | Empaqueta la app de escritorio sin instalador (`release/win-unpacked`) |
| `npm run desktop:release`                  | Genera el instalador NSIS                                              |
| `npm run license:issue -w @karbon/backend` | Emite una licencia firmada (solo en el equipo del proveedor)           |
| `npm run db:up` / `db:down`                | Inicia / detiene PostgreSQL en Docker                                  |
| `npm run db:migrate`                       | Crea y aplica una migración a partir de `schema.prisma`                |
| `npm run db:deploy`                        | Aplica migraciones pendientes                                          |
| `npm run db:seed`                          | Seed idempotente (base + demo)                                         |
| `npm run db:reset`                         | Reinicia la base de datos de desarrollo                                |

## Documentación

- [Manual de uso](docs/MANUAL.md) — instalación en el negocio, celulares, operación diaria
- [Arquitectura](docs/ARCHITECTURE.md) — contexto, capas, tiempo real, seguridad, offline, extensiones
- [Base de datos](docs/DATABASE.md) — diagramas ER, convenciones, índices, invariantes, migraciones
- [API](docs/API.md) — convenciones REST, endpoints, eventos Socket.io
- [Despliegue](docs/DEPLOYMENT.md) — desarrollo, Docker, CI/CD, instalador, operación, licencias
- [Calidad](docs/QA.md) — suites de pruebas, criterios de aceptación y prueba manual en iPhone/iPad
- [Decisiones de arquitectura (ADR)](docs/adr/README.md)
- [Wireframes](docs/wireframes/index.html) — abrir en el navegador
- [Seguridad](SECURITY.md) · [Cambios](CHANGELOG.md)

## Contribuir

- Ramas: `main` (estable), `develop` (integración), `feat/*`, `fix/*`.
- Commits con [Conventional Commits](https://www.conventionalcommits.org/es/) y alcance del monorepo, p. ej. `feat(backend): …`, `fix(mobile): …` (validado por commitlint).
- El hook de pre-commit formatea y corrige lint de los archivos preparados.
- Todo PR debe pasar `npm run check` y, si cambia el esquema, incluir su migración.

## Licencia

Software propietario. Todos los derechos reservados.
