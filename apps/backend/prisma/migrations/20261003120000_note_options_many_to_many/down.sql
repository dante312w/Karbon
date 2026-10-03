-- Revierte 20261003120000_note_options_many_to_many (no lo aplica el migrador; ver docs/DATABASE.md).
-- Cada asignación a una categoría vuelve a ser una fila propia y las generales quedan sin
-- categoría. Lo que el modelo anterior no puede representar se conserva así:
--   * las notas asignadas solo a productos quedan como generales inactivas;
--   * las asignaciones a productos se pierden (el modelo anterior no las tenía).

CREATE TABLE "category_note_options" (
    "id" UUID NOT NULL,
    "category_id" UUID,
    "label" VARCHAR(60) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "category_note_options_pkey" PRIMARY KEY ("id")
);

INSERT INTO "category_note_options" ("id", "category_id", "label", "sort_order", "is_active", "created_at", "updated_at")
SELECT note."id", NULL, note."label", note."sort_order", note."is_active", note."created_at", note."updated_at"
FROM "note_options" AS note
WHERE note."is_general";

INSERT INTO "category_note_options" ("id", "category_id", "label", "sort_order", "is_active", "created_at", "updated_at")
SELECT
  -- La nota conserva su id en su primera categoría (si no es general); las demás son copias.
  CASE
    WHEN link."category_id" = (
        SELECT min(first."category_id"::text)::uuid
        FROM "note_option_categories" AS first
        WHERE first."note_option_id" = note."id"
      )
    THEN note."id"
    ELSE uuidv7()
  END,
  link."category_id", note."label", link."sort_order", note."is_active", note."created_at", note."updated_at"
FROM "note_options" AS note
JOIN "note_option_categories" AS link ON link."note_option_id" = note."id";

INSERT INTO "category_note_options" ("id", "category_id", "label", "sort_order", "is_active", "created_at", "updated_at")
SELECT note."id", NULL, note."label", note."sort_order", false, note."created_at", note."updated_at"
FROM "note_options" AS note
WHERE NOT note."is_general"
  AND NOT EXISTS (SELECT 1 FROM "note_option_categories" AS link WHERE link."note_option_id" = note."id");

DROP TABLE "note_option_products";
DROP TABLE "note_option_categories";
DROP TABLE "note_options";

CREATE INDEX "category_note_options_category_id_sort_order_idx" ON "category_note_options"("category_id", "sort_order");
ALTER TABLE "category_note_options" ADD CONSTRAINT "category_note_options_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "category_note_options" ADD CONSTRAINT "category_note_options_label_check" CHECK (length(btrim("label")) > 0);
CREATE UNIQUE INDEX "category_note_options_category_label_key" ON "category_note_options" (COALESCE("category_id", '00000000-0000-0000-0000-000000000000'::uuid), lower("label"));

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261003120000_note_options_many_to_many';
