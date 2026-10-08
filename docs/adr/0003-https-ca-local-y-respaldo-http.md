# ADR 0003 — HTTPS con CA local y modo HTTP de respaldo

- **Estado:** aceptada (Fase 1, confirmada por el product owner)

## Contexto

Chrome solo registra Service Workers e instala PWAs en contextos seguros (HTTPS o `localhost`). Con `http://192.168.1.10` el celular obtiene un acceso directo, sin modo app ni caché. No se puede depender de internet ni de DNS público.

## Opciones

| Opción                               | Pros                                                                         | Contras                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **CA local + respaldo HTTP**         | PWA completa sin internet; sin certificado la app sigue funcionando por HTTP | Paso único por celular (~1 min) para instalar el certificado                              |
| Solo HTTP                            | Cero configuración                                                           | No cumple "instalable"; sin caché del shell                                               |
| Dominio público con certificado real | Cero configuración en celulares                                              | Dominio, DNS y emisión ACME en la nube; requiere internet para resolver: rompe el offline |

## Decisión

Al instalar, el servidor genera una CA raíz propia con **Name Constraints** (solo IPs privadas RFC 1918 y `*.local`) y un certificado de servidor firmado por ella. El escritorio muestra un QR para descargar e instalar la CA en cada celular. El backend atiende HTTPS (443) y HTTP (80).

- Con la CA instalada → contexto seguro → Service Worker, instalación y caché del shell.
- Sin la CA → modo HTTP de respaldo: la app funciona igual; la cola de pedidos pendientes usa IndexedDB, disponible en HTTP.

## Consecuencias

- La PWA registra el Service Worker solo si `window.isSecureContext` (implementado desde la Fase 1).
- Las Name Constraints limitan el daño si la clave de la CA se filtra: no puede suplantar sitios públicos.
- El navegador no puede descubrir servidores (no hay mDNS/UDP en la web): la PWA la sirve el propio servidor y el escritorio muestra su URL y QR (`GET /api/v1/system/info`). Se recomienda reservar la IP del servidor en el router (DHCP).
