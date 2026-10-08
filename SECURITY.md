# Seguridad

## Reportar una vulnerabilidad

No abras un issue público. Escribe al equipo de Karbon con la descripción, los pasos para reproducirla y la versión afectada. Respondemos en un máximo de 5 días hábiles y coordinamos la divulgación una vez publicada la corrección.

## Versiones con soporte

| Versión | Soporte                   |
| ------- | ------------------------- |
| 0.1.x   | Correcciones de seguridad |

## Secretos del proyecto

| Secreto                              | Dónde vive                                                          | Regla                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Clave privada de licencias (Ed25519) | `apps/backend/.secrets/license-private.pem` (ignorada)              | Solo en el equipo que emite licencias, con respaldo cifrado fuera de línea. Nunca en git, CI ni instaladores |
| Certificado de firma de código       | Secretos del repositorio en GitHub (`CSC_LINK`, `CSC_KEY_PASSWORD`) | Solo lo usa el workflow `desktop.yml`                                                                        |
| `JWT_SECRET` y clave de PostgreSQL   | `server.json` en cada instalación (generados al azar)               | Únicos por equipo; nunca se comparten entre clientes                                                         |
| `apps/backend/.env`                  | Solo desarrollo (ignorado)                                          | Nunca con credenciales reales de un cliente                                                                  |

Si la clave privada de licencias se filtra: generar un par nuevo, reemplazar la clave pública en `apps/backend/src/modules/license/license-key.ts`, publicar una versión y reemitir las licencias vigentes.

## Medidas implementadas

Resumen en [docs/ARCHITECTURE.md § Seguridad](docs/ARCHITECTURE.md#7-seguridad): HTTPS con CA local restringida, PostgreSQL solo en `127.0.0.1`, JWT corto + refresh rotativo con detección de reutilización, RBAC por permisos, rate limiting, validación estricta, bitácora de auditoría, Electron con `contextIsolation` y `sandbox`, y licencias firmadas.
