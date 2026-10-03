# ADR 0010 — Licencias firmadas que se validan sin conexión

- **Estado:** aceptada (Fase 10)

## Contexto

El producto se vende por suscripción o licencia, pero el servidor del restaurante opera sin internet. La validación no puede depender de un servicio en línea y un corte de licencia nunca debe dejar al negocio sin poder cobrar lo que ya tiene abierto.

## Opciones

| Opción                                                    | Pros                                                        | Contras                                                              |
| --------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| **Clave firmada (Ed25519) con la clave pública embebida** | Funciona sin internet; imposible de fabricar sin la privada | Revocar exige esperar el vencimiento o emitir versiones nuevas       |
| Activación en línea contra un servidor de licencias       | Revocación inmediata, conteo real de terminales             | Requiere internet; un corte de nuestro servicio detiene restaurantes |
| Número de serie con checksum                              | Trivial                                                     | Se genera un keygen en minutos                                       |

## Decisión

- Formato `KARBON1.<payload base64url>.<firma base64url>`; el payload lleva titular, plan, terminales, emisión, vencimiento y, opcionalmente, el `branchId` de la instalación.
- El backend verifica con la clave pública incluida en el código (`license-key.ts`). La privada queda fuera del repositorio (`apps/backend/.secrets/`) y solo se usa con `npm run license:issue`.
- Sin licencia: 30 días de prueba desde que se completa el asistente.
- Licencia vencida o inválida: se bloquea **solo** la creación de pedidos (`402 LICENSE_INVALID`); se puede cobrar, cerrar caja, consultar reportes y activar una clave nueva. Una clave guardada que deja de validar se ignora (vuelve al estado de prueba/vencida) en lugar de tumbar el servidor.

## Consecuencias

- La activación en línea (conteo de terminales, revocación) puede añadirse después como capa opcional sin cambiar el formato.
- Rotar la clave privada invalida todas las licencias emitidas: la clave pública admite ser una lista si algún día hay que convivir con dos.
- La activación queda en la bitácora de auditoría (`license.activate`).
