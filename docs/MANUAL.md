# Manual de uso de Karbon POS

Guía para instalar Karbon en el negocio y operarlo en el día a día. Está pensada para el administrador del restaurante o bar, no para programadores.

## 1. Lo que necesitas

- **Un PC con Windows 10 u 11** que será el servidor (idealmente el de la caja). 4 GB de RAM o más.
- **Router WiFi** al que se conectan el PC, los celulares de los meseros y la tablet de cocina/barra. No hace falta internet.
- **Celulares Android** con Chrome para los meseros (iPhone con Safari también funciona).
- Opcional: impresora térmica de 80 mm (por red o USB) y una tablet o TV para la cocina o la barra.

> Consejo: pide a quien administra el router que **reserve la IP del PC servidor** (DHCP estático). Así la dirección que usan los celulares no cambia.

## 2. Instalación en el PC servidor

1. Ejecuta `Karbon-POS-Setup-<versión>.exe` y sigue los pasos. El instalador crea el acceso directo y permite que los celulares de la red privada lleguen al servidor (regla del firewall de Windows).
2. Abre **Karbon POS**. La primera vez prepara la base de datos (unos segundos) y muestra el **asistente**:
   - Nombre del negocio y tipo: **Restaurante** o **Bar** (en modo bar la aplicación habla de "Barra" en lugar de "Cocina").
   - Moneda.
   - Usuario y clave del **administrador**. Guárdalos: no hay claves por defecto.
   - Opcional: cargar datos de demostración para practicar.
3. Karbon queda en la **bandeja del sistema** (junto al reloj). Cerrar la ventana **no apaga** el servidor: los celulares siguen trabajando. Para apagar del todo: clic derecho en el ícono → **Salir**.
4. Recomendado: activa **Iniciar con Windows** (menú de la bandeja o Configuración → Sistema) para que el servidor arranque solo al encender el PC.

## 3. Configurar el negocio

Todo está en **Configuración** (solo administradores):

| Pestaña     | Qué se hace                                                                              |
| ----------- | ---------------------------------------------------------------------------------------- |
| Negocio     | Datos del tiquete, logo, moneda, propina sugerida, modo restaurante/bar, tiempos del KDS |
| Salón       | El plano de cada área: arrastra mesas, barra, cocina, baños, entrada y caja a su lugar   |
| Usuarios    | Personal con usuario, clave y **PIN** de 4 dígitos; roles y permisos                     |
| Impuestos   | Impoconsumo, IVA, exento; si los precios ya incluyen impuestos                           |
| Impresoras  | Impresoras térmicas por red (IP) o de Windows, y para qué se usa cada una                |
| Facturación | Numeración autorizada de tiquetes/facturas                                               |
| Celulares   | Código QR para conectar celulares y el tablero de cocina/barra                           |
| Sistema     | Versión, licencia, respaldos e inicio con Windows                                        |
| Auditoría   | Quién anuló, descontó, cerró caja o cambió permisos, y cuándo                            |

Después carga el **Catálogo** (categorías, productos, precios, imágenes y estación: cocina o barra) y, si vas a controlar inventario, los **insumos** y la **receta** de cada producto.

## 4. Conectar los celulares de los meseros

En el PC abre **Configuración → Celulares**. Con cada celular (conectado a la misma WiFi):

1. **Instala el certificado del local** (una sola vez): en la sección "Conexión segura (HTTPS)" escanea el QR del certificado, descárgalo e instálalo. Android: Ajustes → Seguridad → Instalar certificado CA. iPhone: Ajustes → Perfil descargado → Instalar, y actívalo en Información → Confianza de certificados.
2. **Abre la app**: escanea el QR con la dirección del servidor (por ejemplo `https://192.168.1.10:3443`) y ábrelo en Chrome.
3. En Chrome: menú ⋮ → **Instalar aplicación** (o "Agregar a pantalla principal"). Queda como una app más.
4. Cada mesero entra tocando su nombre y escribiendo su **PIN**.

Sin el certificado la app funciona igual en modo básico (HTTP); solo que si se corta la WiFi hay que esperar a que vuelva para recargarla.

## 5. Tablero de cocina o barra (KDS)

- En el PC: menú **Cocina** (o **Barra**).
- En una tablet o TV: abre la dirección que muestra **Configuración → Celulares → Tablero** (termina en `/app/#/kds`) e ingresa con el usuario de cocina/barra.
- Las comandas llegan solas con sonido. Toca **Preparar** → **Listo**: el mesero recibe el aviso en su celular.
- **La entrega la confirma el mesero**: al llevar el plato a la mesa toca **Entregado en la mesa** en su celular, y la comanda sale de la columna Listo. Mientras tanto la tarjeta muestra cuánto lleva **por recoger**. En modo bar, el barman también puede marcar **Entregado** desde el tablero. Si nadie lo confirma, se da por entregado al cobrar la cuenta.
- Los colores indican el tiempo de espera (verde, amarillo, rojo; los minutos se configuran en Negocio).
- En **Ver entregados recientes** cada comanda muestra su **tiempo total** (fijo, ya no cuenta), cuánto tardó en prepararse y en recogerse, y quién la entregó.
- Si se acaba un producto, márcalo como **agotado** desde el tablero: los meseros dejan de verlo disponible.

## 6. Operación diaria

### Abrir caja

**Caja → Abrir caja** con la base de efectivo. Sin caja abierta se pueden tomar pedidos, pero no cobrar.

### Tomar un pedido

- **Mesero (celular):** Mesas → toca la mesa → agrega productos (con notas rápidas como "sin cebolla" o "sin hielo") → **Enviar a cocina/barra**. Si la señal se cae, el pedido queda en cola y se envía solo al volver.
  - Arriba de las mesas, los contadores **Para recoger**, **Preparando**, **Cuenta** y **Libres** filtran el salón con un toque.
  - Cada mesa con algo en cocina muestra cuánto lleva y si va **A tiempo**, **Demorado** o **Crítico** (los minutos son los del tablero de cocina).
  - En **Mis pedidos** aparece primero lo listo para llevar; **Entregado en la mesa** lo confirma todo de una vez.
  - En el pedido, el botón **⋮** abre las acciones: detalles (personas y notas), **mover** a otra mesa libre, **unir mesas** (las cuentas de la otra mesa pasan a esta, cada una por separado), **separar**, **dividir cuenta** y, con permiso, **cancelar**.
  - Toca un producto **sin enviar** para cambiar la cantidad o la nota, o quitarlo. Uno ya enviado solo se anula con motivo (con permiso; si no, pídelo a caja).
  - Cada mesero opera **sus** pedidos: los de otro compañero se ven con un candado. Caja y administración pueden operar todos.
  - Una mesa **Pagada** se marca libre desde el celular al tocarla.
- **Caja (PC):** Mesas → mesa → agregar productos, o **Pedido sin mesa** para llevar o domicilio.
- Se puede agregar más rondas, cambiar cantidades, anular ítems (con motivo), mover el pedido a otra mesa, unir mesas o **dividir la cuenta**.

### Cobrar

1. El mesero toca **Pedir cuenta** (la mesa pasa a "esperando cuenta") o la caja abre el pedido directamente.
2. **Cobrar**: elige efectivo (calcula el cambio), tarjeta, transferencia o QR. Para pagos mixtos, registra varios pagos hasta completar el total.
3. Imprime el **tiquete** o la **factura** (térmica, A4 o PDF). La mesa queda libre y el inventario se descuenta según las recetas.

### Durante el turno

- **Ingresos / retiros** de efectivo y **gastos** desde Caja.
- **Inventario**: registra compras (actualizan el costo promedio), entradas, salidas, mermas y ajustes por conteo. Las alertas avisan qué insumos están bajo el mínimo.

### Cerrar caja

**Caja → Cerrar caja**: cuenta el efectivo y escríbelo. Karbon calcula lo esperado, muestra la diferencia y guarda el informe del turno. Al cerrar se hace un **respaldo automático**.

## 7. Reportes

**Reportes** muestra ventas, utilidad, pedidos, ticket promedio, horas pico, ventas por mesero, productos más vendidos y métodos de pago, por día, semana, mes o rango. Se pueden exportar a CSV (Excel).

## 8. Respaldos

- Automáticos: todos los días a las 3:00 a. m. (con el PC encendido) y cada vez que se cierra caja. Se guardan los últimos 30.
- Manual: **Configuración → Sistema → Respaldar ahora**.
- Restaurar: en la misma lista, **Restaurar** sobre el respaldo deseado (antes se guarda una copia del estado actual).
- Recomendado: copia de vez en cuando la carpeta `%APPDATA%\Karbon POS\data\backups` a una memoria USB o a la nube.

## 9. Licencia

Karbon incluye **30 días de prueba**. Para activar la licencia: **Configuración → Sistema → Licencia**, copia el **código de instalación** y envíalo a tu proveedor; pega la clave que te entreguen y pulsa **Activar**. Si la licencia vence, puedes seguir cobrando y cerrando caja, pero no abrir pedidos nuevos hasta renovarla.

## 10. Problemas frecuentes

| Síntoma                                               | Qué hacer                                                                                                                         |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| El celular muestra "Sin conexión"                     | Verifica que esté en la WiFi del negocio y que Karbon esté abierto en el PC (ícono en la bandeja)                                 |
| Cambió la IP del PC y los celulares no conectan       | Reserva la IP en el router; mientras tanto, vuelve a escanear el QR de Configuración → Celulares                                  |
| La tablet del KDS no suena                            | Toca **Activar sonido** en el tablero (los navegadores bloquean el sonido hasta que se toca la pantalla)                          |
| La impresora de red no imprime                        | Configuración → Impresoras → **Imprimir prueba**; revisa la IP y que la impresora esté en la misma red                            |
| El ícono de la bandeja dice "Servidor: con problemas" | Cierra Karbon desde la bandeja (**Salir**) y ábrelo de nuevo; si persiste, envía a soporte la carpeta `%APPDATA%\Karbon POS\logs` |
