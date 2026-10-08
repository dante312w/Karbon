-- CreateEnum
CREATE TYPE "business_mode" AS ENUM ('RESTAURANT', 'BAR');

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "unit_cost" DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "label" VARCHAR(60),
ADD COLUMN     "tip_percent" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "restaurant_settings" ADD COLUMN     "business_mode" "business_mode" NOT NULL DEFAULT 'RESTAURANT',
ADD COLUMN     "license_key" TEXT,
ADD COLUMN     "receipt_header" VARCHAR(500),
ADD COLUMN     "setup_completed_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "key" VARCHAR(100) NOT NULL,
    "user_id" UUID NOT NULL,
    "route" VARCHAR(200) NOT NULL,
    "status_code" INTEGER,
    "response" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("user_id","key")
);

-- CreateIndex
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys"("created_at");

-- Invariantes
ALTER TABLE "orders" ADD CONSTRAINT "orders_tip_percent_check" CHECK ("tip_percent" BETWEEN 0 AND 100);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_unit_cost_check" CHECK ("unit_cost" >= 0);
