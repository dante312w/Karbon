# Cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versiones con [SemVer](https://semver.org/lang/es/).

## [Sin publicar]

### Añadido

- Plano del salón: cada área se ve desde arriba con sus mesas (redondas, cuadradas o rectangulares, con sus sillas según la capacidad), el color del estado, el tiempo y el total de la cuenta, más barra, cocina, baños, entrada, caja y paredes. La vista de tarjetas sigue disponible.
- Editor del plano en Configuración → Salón: arrastrar y soltar (o flechas del teclado) celda por celda, sin encimar mesas.
- Celular del mesero: cada comanda del pedido muestra su estado con texto e ícono ("En cola", "Preparando", "Listo para recoger", "Entregado") y su tiempo en vivo; lo listo se confirma con **Entregado en la mesa**, con opción de deshacer.
- Mesas en el celular, rediseñadas: contadores que filtran (**Para recoger**, **Preparando**, **Cuenta**, **Libres**), tarjetas táctiles más grandes con ícono y texto de estado, cuenta, tiempo abierto, mesero y, si hay algo en cocina, su tiempo y urgencia ("A tiempo", "Demorado", "Crítico"). Dos columnas desde 320 px y más en tablet.
- **Mis pedidos**: primero lo que hay que llevar a la mesa, con hora de apertura, cantidad de productos, espera en cocina y un botón para confirmar de una vez todo lo listo.
- Detalle del pedido en el celular: cada comanda muestra su urgencia y la hora de envío.
- Gestión de mesas desde el celular: detalles del pedido, mover, unir y separar mesas, dividir cuenta, cancelar (con permiso), editar cantidad y notas de lo no enviado, anular lo enviado con motivo y marcar libre una mesa pagada.
- Unir mesas ocupadas: las cuentas de la mesa que se une pasan a la principal, cada una por separado, sin perder productos, comandas ni pagos parciales.
- Permisos nuevos: **Confirmar entregas en la mesa** y **Operar pedidos de otros meseros** (caja y administración).
- Notas de un toque por categoría: el administrador define en el Catálogo las notas de cada categoría ("Sin cebolla" en hamburguesas, "Sin hielo" en bebidas) y las generales; las subcategorías heredan las de su categoría madre. Se pueden renombrar, ordenar, apagar y eliminar sin afectar pedidos anteriores.
- Eliminar una categoría desde el Catálogo (solo si ya no tiene productos ni subcategorías).
- Llamados entre áreas: cocina, barra y caja llaman al mesero ("La mesa necesita atención", "Que venga un momento") desde la comanda, el pedido o la mesa; el mesero llama a caja ("Necesito cobrar", "Ayuda con una cuenta", "Un cliente necesita a caja"). Quien recibe oye un aviso propio (distinto al de "listo") y el celular vibra; **Voy** muestra a todos quién va. Tocar de nuevo insiste en el mismo llamado sin duplicarlo. Los llamados se guardan: no se pierden si el celular estaba bloqueado o sin red.
- Permisos nuevos: **Llamar al mesero** (cocina, barra y caja) y **Llamar a caja** (meseros).
- Descuento sobre el total en caja: porcentaje o valor fijo, con motivo, vista previa del total y registro de quién lo aplicó (valor anterior, descontado y final en la auditoría). Se reparte entre los productos para que los impuestos queden bien, no deja la cuenta por debajo de lo ya pagado y se puede quitar. El mesero lo ve en el celular.
- **Descuento máximo** configurable en Configuración → Negocio; aplica a los descuentos por producto y al del pedido.

### Cambiado

- Cada mesero opera solo sus pedidos (el servidor lo exige en todas las modificaciones); caja, administración y los roles que cobran operan todos. Los pedidos de otro se ven en modo lectura.
- El rol Mesero puede mover, unir y liberar mesas (con sus propias cuentas).
- Al pedir, el mesero y la caja ven solo las notas que aplican al producto, en lugar de la misma lista fija para todo. Las notas que existían pasan a ser generales al actualizar. Marcar una nota ya escrita a mano (sin importar mayúsculas) la reconoce en lugar de repetirla.

- La entrega la confirma el mesero, no cocina: el KDS llega hasta **Listo** y muestra cuánto lleva **por recoger**. En modo bar, el barman también puede entregar desde el tablero. Al cobrar, lo que seguía listo se da por entregado y queda en la auditoría.

- Identidad visual morada: botones y acentos violeta, barra lateral y pantallas de ingreso en morado oscuro, neutros con un leve tinte morado y logo nuevo. El verde queda solo para estados (mesa libre, comanda a tiempo). Paleta de gráficos validada para daltonismo en ambos temas.
- KDS en pantallas anchas (TV): dos o más comandas por fila en cada columna.

### Corregido

- Los celulares no recibían los pedidos que abría otro mesero hasta recargar; ahora llegan al instante.

- KDS: el cronómetro de las comandas entregadas seguía contando. Ahora muestra un **tiempo total fijo**, con cuánto tardó en prepararse y en recogerse, y quién la entregó. Deshacer un paso (Listo → Preparando) ya no deja marcas de tiempo viejas.

- Configuración → Celulares: el QR apuntaba al backend aunque este no publicara la app de meseros (en desarrollo) y, con Docker, a la IP interna del contenedor. Ahora el servidor informa dónde se abre cada app (el mismo servidor en el programa instalado, los puertos de Vite en desarrollo) y, si no se publica, la pantalla lo explica en lugar de mostrar un QR que no sirve.
- Menú lateral: en pantallas bajas (laptops con escala de Windows al 125 %) el botón Configuración quedaba cortado sin forma de llegar a él; ahora está fijo al fondo y los demás módulos se desplazan.
- Tras actualizar, la caché que cada equipo guarda para trabajar sin red podía tener la forma de datos anterior y hacer fallar una pantalla; ahora cada versión usa su propia caché y descarta las anteriores.
- Si una pantalla falla, se muestra un aviso con "Recargar" y el detalle para soporte, sin perder el menú, en lugar del error técnico.
- KDS: con muchas comandas las tarjetas se aplastaban y ocultaban los botones Preparar/Listo; ahora la columna hace scroll y, en comandas largas, el encabezado (mesa y tiempo) queda fijo arriba.
- Reportes: los donuts ya no repiten colores con más de 8 porciones (se agrupan en "Otros") y la leyenda usa el color de texto.

## [0.1.0] — 2026-09-26

Primera versión completa.

### Operación

- Mapa de mesas por áreas con estados en tiempo real; unir, separar y mover pedidos entre mesas; marcar mesas como reservadas (la agenda de reservas está en la API, sin pantalla todavía).
- Pedidos en mesa, para llevar y domicilio: notas y notas rápidas, editar, anular con motivo, duplicar, reordenar, dividir la cuenta, descuentos con permiso, propina.
- PWA para meseros con ingreso por PIN, "mis mesas", aviso con vibración cuando un pedido está listo y cola offline con reenvío automático.
- KDS de cocina o barra: columnas Nuevo → Preparando → Listo → Entregado, cronómetro, colores por tiempo, sonido, marcar productos agotados; también por web en tablets y TVs.
- Modo bar: "Barra" en lugar de "Cocina" en toda la aplicación, con las mismas funciones.

### Caja y facturación

- Apertura con base, ingresos y retiros, gastos, cierre con arqueo y diferencia; historial de turnos.
- Cobro en efectivo (con cambio), tarjeta, transferencia y QR; pagos mixtos; anulación de pagos con reposición de inventario.
- Tiquete POS con numeración autorizada y desglose de impuestos; impresión térmica ESC/POS por red, impresoras de Windows, A4 y PDF; puerto listo para facturación electrónica DIAN.

### Administración

- Inventario por receta con kardex, entradas, salidas, mermas, ajustes por conteo, compras con costo promedio, proveedores y alertas de stock mínimo.
- Catálogo con categorías, imágenes, recetas y costo teórico; clientes con historial.
- Reportes de ventas, utilidad, horas pico, meseros, productos y métodos de pago, exportables a CSV.
- Usuarios, roles personalizados con permisos finos, impuestos, impresoras, numeración, tema claro/oscuro.
- Bitácora de auditoría consultable.

### Instalación y sistema

- Instalador único de Windows con PostgreSQL 18 embebido, servidor supervisado en la bandeja e inicio con Windows.
- Asistente de primera instalación (sin claves por defecto), periodo de prueba de 30 días y licencias firmadas sin conexión.
- HTTPS con CA local para los celulares y modo HTTP de respaldo.
- Respaldos automáticos (diario y al cerrar caja), manuales y restauración.
