-- Notas de un toque configurables por categoría (antes estaban fijas en el código).

-- CreateTable
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

-- CreateIndex
CREATE INDEX "category_note_options_category_id_sort_order_idx" ON "category_note_options"("category_id", "sort_order");

-- AddForeignKey
ALTER TABLE "category_note_options" ADD CONSTRAINT "category_note_options_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Invariantes: texto no vacío y sin repetir dentro de la misma categoría (sin distinguir
-- mayúsculas). Las generales (category_id nulo) comparten un mismo grupo.
ALTER TABLE "category_note_options" ADD CONSTRAINT "category_note_options_label_check" CHECK (length(btrim("label")) > 0);
CREATE UNIQUE INDEX "category_note_options_category_label_key" ON "category_note_options" (COALESCE("category_id", '00000000-0000-0000-0000-000000000000'::uuid), lower("label"));

-- Instalaciones existentes: las notas rápidas que el código ofrecía en todos los productos pasan a
-- ser notas generales, así nada cambia para los meseros hasta que el administrador las organice.
-- En una instalación nueva aún no hay configuración: las crea el seed.
INSERT INTO "category_note_options" ("id", "category_id", "label", "sort_order", "updated_at")
SELECT uuidv7(), NULL, note.label, note.position, CURRENT_TIMESTAMP
FROM "restaurant_settings" AS settings,
     unnest(
       CASE settings."business_mode"
         WHEN 'BAR' THEN ARRAY['Sin hielo', 'Poco hielo', 'Sin azúcar', 'Doble', 'Michelada', 'Con limón', 'Bien fría']
         ELSE ARRAY['Sin cebolla', 'Sin sal', 'Sin salsas', 'Término medio', 'Bien asado', 'Extra queso', 'Para llevar']
       END
     ) WITH ORDINALITY AS note(label, position);
