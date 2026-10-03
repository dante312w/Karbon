-- CreateEnum
CREATE TYPE "floor_element_kind" AS ENUM ('BAR', 'KITCHEN', 'RESTROOM', 'ENTRANCE', 'CASHIER', 'WALL');

-- CreateTable
CREATE TABLE "floor_elements" (
    "id" UUID NOT NULL,
    "area_id" UUID NOT NULL,
    "kind" "floor_element_kind" NOT NULL,
    "label" VARCHAR(40),
    "pos_x" INTEGER NOT NULL DEFAULT 0,
    "pos_y" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER NOT NULL DEFAULT 1,
    "height" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "floor_elements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "floor_elements_area_id_idx" ON "floor_elements"("area_id");

-- AddForeignKey
ALTER TABLE "floor_elements" ADD CONSTRAINT "floor_elements_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Invariantes: posición dentro de la grilla y tamaño razonable.
ALTER TABLE "floor_elements" ADD CONSTRAINT "floor_elements_geometry_check" CHECK ("pos_x" >= 0 AND "pos_y" >= 0 AND "width" BETWEEN 1 AND 24 AND "height" BETWEEN 1 AND 24);
