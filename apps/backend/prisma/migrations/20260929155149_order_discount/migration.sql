-- Descuento sobre el total del pedido (caja) y límite configurable de descuento.

-- CreateEnum
CREATE TYPE "discount_type" AS ENUM ('PERCENT', 'AMOUNT');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "order_discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "order_discount_at" TIMESTAMPTZ(3),
ADD COLUMN     "order_discount_by_id" UUID,
ADD COLUMN     "order_discount_reason" VARCHAR(255),
ADD COLUMN     "order_discount_type" "discount_type",
ADD COLUMN     "order_discount_value" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "restaurant_settings" ADD COLUMN     "max_discount_percent" DECIMAL(5,2) NOT NULL DEFAULT 100;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_order_discount_by_id_fkey" FOREIGN KEY ("order_discount_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invariantes: el descuento se guarda completo o no se guarda; el porcentaje entre 0 y 100; un
-- valor fijo positivo; y lo que descuenta nunca es negativo (ni existe sin descuento).
ALTER TABLE "orders" ADD CONSTRAINT "orders_order_discount_check" CHECK (
  ("order_discount_type" IS NULL
    AND "order_discount_value" IS NULL
    AND "order_discount_reason" IS NULL
    AND "order_discount_at" IS NULL
    AND "order_discount_amount" = 0)
  OR ("order_discount_type" IS NOT NULL
    AND "order_discount_value" > 0
    AND ("order_discount_type" <> 'PERCENT' OR "order_discount_value" <= 100)
    AND length(btrim("order_discount_reason")) > 0
    AND "order_discount_at" IS NOT NULL
    AND "order_discount_amount" >= 0)
);
ALTER TABLE "restaurant_settings" ADD CONSTRAINT "restaurant_settings_max_discount_check" CHECK ("max_discount_percent" BETWEEN 0 AND 100);
