# ADR 0015 — Notas de un toque: muchas a muchas con categorías, excepciones por producto

- **Estado:** aceptada

## Contexto

Las notas de un toque se guardaban en `category_note_options` con **una** categoría por fila (o ninguna = general). Para ofrecer "Sin hielo" en Bebidas y en Cócteles había que repetir la nota, y al actualizar una instalación todas las notas que antes estaban fijas en el código quedaron como generales: el mesero veía "Sin cebolla" al pedir una cerveza. Faltaba además una forma de hacer excepciones para un producto puntual.

## Opciones

| Opción                                                                 | Pros                                                          | Contras                                                    |
| ---------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| **`note_options` + `note_option_categories` + `note_option_products`** | Una nota, muchas categorías; orden por categoría; excepciones | Dos tablas de enlace; migración de datos                   |
| Mantener una fila por categoría                                        | Sin migración                                                 | Duplica textos; renombrar o apagar hay que hacerlo N veces |
| Etiquetas libres en producto                                           | Flexible                                                      | Hay que asignarlas producto por producto                   |

## Decisión

- Cada texto existe una vez (`lower(label)` único). Una nota es **general** (todos los productos) o aplica a sus categorías (con orden propio en cada una; las subcategorías heredan) y, como excepción, a productos.
- Las **notas propias de un producto reemplazan** las de su categoría (decisión del usuario): sirven para excepciones como una hamburguesa vegana. Las generales se ofrecen siempre.
- La regla vive en `noteSuggestions` (`@karbon/utils`) y la usan caja, celular y la vista previa del catálogo.
- La migración fusiona las repetidas y deja las sin categoría como generales (nada cambia para el mesero). La **asignación sugerida** por nombre de categoría (`suggestNoteAssignments`) se calcula en el cliente y solo se aplica cuando el administrador la confirma (`PUT /note-options/assignments`, todo o nada).
- La migración trae `down.sql` (ver docs/DATABASE.md).

## Consecuencias

- Asignación masiva desde la categoría (`PUT /categories/:id/note-options`) y desde el producto (`PUT /products/:id/note-options`).
- Una nota no general sin asignaciones no se ofrece; el catálogo la marca "Sin asignar".
- `note_options.changed` avisa a caja y celulares para que recarguen las notas.
