## Qué cambia

<!-- Resumen breve del cambio y su motivación. Enlaza el issue si existe (Closes #123). -->

## Fase / módulo

- [ ] Backend
- [ ] Escritorio (POS / caja / admin)
- [ ] PWA meseros
- [ ] KDS
- [ ] Paquetes compartidos (`types`, `utils`, `ui`)
- [ ] Base de datos (migración incluida)
- [ ] CI / documentación

## Cómo se probó

<!-- Pruebas automatizadas agregadas y pasos de prueba manual. -->

## Checklist

- [ ] `npm run check` pasa localmente (formato, lint, tipos y pruebas)
- [ ] Si cambió `schema.prisma`, se incluye la migración generada con `npm run db:migrate`
- [ ] Si cambió un contrato de `@karbon/types`, backend y clientes quedan alineados
- [ ] Documentación actualizada (`docs/`) si cambia arquitectura, API o despliegue
