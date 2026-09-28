# Registro de decisiones de arquitectura (ADR)

Cada decisión con más de una opción razonable se documenta aquí: contexto, opciones, decisión y consecuencias. Un ADR aceptado no se edita; si la decisión cambia se crea uno nuevo que lo reemplaza.

| #                                                 | Decisión                                                                    | Estado   |
| ------------------------------------------------- | --------------------------------------------------------------------------- | -------- |
| [0001](0001-monorepo-npm-workspaces-turborepo.md) | Monorepo con npm workspaces + Turborepo                                     | Aceptada |
| [0002](0002-despliegue-instalador-unico.md)       | Despliegue como instalador único (Electron + backend + PostgreSQL embebido) | Aceptada |
| [0003](0003-https-ca-local-y-respaldo-http.md)    | HTTPS con CA local y modo HTTP de respaldo para la PWA                      | Aceptada |
| [0004](0004-kds-modulo-web-del-escritorio.md)     | KDS como módulo del renderer de escritorio, servible por web                | Aceptada |
| [0005](0005-dinero-en-unidades-menores.md)        | Dinero: DECIMAL en BD, enteros en unidades menores en la API                | Aceptada |
| [0006](0006-uuid-v7-y-multisucursal.md)           | UUID v7 y "un servidor = una sucursal" para la futura sincronización        | Aceptada |
| [0007](0007-comandas-y-cuenta-dividida.md)        | Comandas (kitchen tickets) y cuenta dividida con pagos múltiples            | Aceptada |
| [0008](0008-toolchain-typescript-6-esm.md)        | Toolchain: TypeScript 6, backend ESM, Vite 8 + tsdown en Electron           | Aceptada |
| [0009](0009-modo-bar.md)                          | Modo bar como configuración (`businessMode`), no como otra aplicación       | Aceptada |
| [0010](0010-licencias-firmadas-sin-conexion.md)   | Licencias firmadas (Ed25519) que se validan sin conexión                    | Aceptada |
| [0011](0011-servidor-embebido-supervisado.md)     | Servidor embebido: migrador propio y supervisión desde Electron             | Aceptada |
| [0012](0012-entrega-confirmada-por-el-mesero.md)  | La entrega la confirma el mesero; propiedad del pedido (`manage_any`)       | Aceptada |
