-- Notas de un toque: una misma nota se asigna a varias categorías y, como excepción, a productos
-- puntuales (sus notas reemplazan las de la categoría). Antes cada nota pertenecía a una sola
-- categoría (o a ninguna = general) y la misma nota se repetía por categoría.
-- Reversión: down.sql en esta misma carpeta (ver docs/DATABASE.md).

ALTER TABLE "category_note_options" RENAME TO "note_options";
ALTER TABLE "note_options" RENAME CONSTRAINT "category_note_options_pkey" TO "note_options_pkey";
ALTER TABLE "note_options" RENAME CONSTRAINT "category_note_options_label_check" TO "note_options_label_check";
ALTER TABLE "note_options" ADD COLUMN "is_general" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "note_option_categories" (
    "note_option_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "note_option_categories_pkey" PRIMARY KEY ("note_option_id","category_id")
);

-- CreateTable
CREATE TABLE "note_option_products" (
    "note_option_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,

    CONSTRAINT "note_option_products_pkey" PRIMARY KEY ("note_option_id","product_id")
);

-- CreateIndex
CREATE INDEX "note_option_categories_category_id_sort_order_idx" ON "note_option_categories"("category_id", "sort_order");

-- CreateIndex
CREATE INDEX "note_option_products_product_id_idx" ON "note_option_products"("product_id");

-- AddForeignKey
ALTER TABLE "note_option_categories" ADD CONSTRAINT "note_option_categories_note_option_id_fkey" FOREIGN KEY ("note_option_id") REFERENCES "note_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_option_categories" ADD CONSTRAINT "note_option_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_option_products" ADD CONSTRAINT "note_option_products_note_option_id_fkey" FOREIGN KEY ("note_option_id") REFERENCES "note_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_option_products" ADD CONSTRAINT "note_option_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Datos: la misma nota repetida en varias categorías (sin distinguir mayúsculas) pasa a ser una
-- sola nota con todas esas categorías. Se conserva la más antigua; las sin categoría quedan como
-- generales, así nada cambia para el mesero hasta que el administrador las organice.
CREATE TEMP TABLE "note_canon" AS
SELECT
  "id",
  "category_id",
  "sort_order",
  "is_active",
  first_value("id") OVER (PARTITION BY lower(btrim("label")) ORDER BY "created_at", "id") AS "canon_id"
FROM "note_options";

INSERT INTO "note_option_categories" ("note_option_id", "category_id", "sort_order")
SELECT "canon_id", "category_id", min("sort_order")
FROM "note_canon"
WHERE "category_id" IS NOT NULL
GROUP BY "canon_id", "category_id";

UPDATE "note_options" AS note
SET "is_general" = true,
    "sort_order" = general."sort_order"
FROM (
  SELECT "canon_id", min("sort_order") AS "sort_order"
  FROM "note_canon"
  WHERE "category_id" IS NULL
  GROUP BY "canon_id"
) AS general
WHERE note."id" = general."canon_id";

-- Una general ya se ofrece en todos los productos: asignarla además a categorías sobra.
DELETE FROM "note_option_categories" AS link
USING "note_options" AS note
WHERE note."id" = link."note_option_id" AND note."is_general";

-- Una nota fusionada sigue activa si estaba activa en alguna categoría.
UPDATE "note_options" AS note
SET "is_active" = merged."is_active"
FROM (
  SELECT "canon_id", bool_or("is_active") AS "is_active"
  FROM "note_canon"
  GROUP BY "canon_id"
) AS merged
WHERE note."id" = merged."canon_id";

DELETE FROM "note_options" WHERE "id" NOT IN (SELECT DISTINCT "canon_id" FROM "note_canon");
DROP TABLE "note_canon";

-- La categoría ya vive en note_option_categories.
DROP INDEX "category_note_options_category_label_key";
DROP INDEX "category_note_options_category_id_sort_order_idx";
ALTER TABLE "note_options" DROP CONSTRAINT "category_note_options_category_id_fkey";
ALTER TABLE "note_options" DROP COLUMN "category_id";

-- Invariante: cada texto existe una sola vez (sin distinguir mayúsculas).
CREATE UNIQUE INDEX "note_options_label_key" ON "note_options" (lower("label"));
