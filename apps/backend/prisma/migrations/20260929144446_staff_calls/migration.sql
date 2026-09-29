-- Llamados internos: cocina/caja llaman al mesero y el mesero llama a caja
-- (docs/adr/0013-llamados-internos-persistidos.md).

-- CreateEnum
CREATE TYPE "staff_call_target" AS ENUM ('WAITER', 'CASHIER');

-- CreateEnum
CREATE TYPE "staff_call_reason" AS ENUM ('TABLE_ATTENTION', 'COME_OVER', 'CHARGE_TABLE', 'ACCOUNT_HELP', 'CUSTOMER_ATTENTION');

-- CreateEnum
CREATE TYPE "staff_call_status" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'RESOLVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "staff_calls" (
    "id" UUID NOT NULL,
    "target" "staff_call_target" NOT NULL,
    "reason" "staff_call_reason" NOT NULL,
    "status" "staff_call_status" NOT NULL DEFAULT 'PENDING',
    "message" VARCHAR(140),
    "table_id" UUID,
    "order_id" UUID,
    "target_user_id" UUID,
    "created_by_id" UUID NOT NULL,
    "acknowledged_by_id" UUID,
    "closed_by_id" UUID,
    "dedupe_key" VARCHAR(200) NOT NULL,
    "call_count" INTEGER NOT NULL DEFAULT 1,
    "last_called_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "staff_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_calls_status_target_idx" ON "staff_calls"("status", "target");

-- CreateIndex
CREATE INDEX "staff_calls_created_at_idx" ON "staff_calls"("created_at");

-- AddForeignKey
ALTER TABLE "staff_calls" ADD CONSTRAINT "staff_calls_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_calls" ADD CONSTRAINT "staff_calls_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_calls" ADD CONSTRAINT "staff_calls_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_calls" ADD CONSTRAINT "staff_calls_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_calls" ADD CONSTRAINT "staff_calls_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_calls" ADD CONSTRAINT "staff_calls_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invariantes: cada destino con sus motivos; solo el llamado al mesero apunta a una persona;
-- un llamado está abierto exactamente mientras no tenga fecha de cierre.
ALTER TABLE "staff_calls" ADD CONSTRAINT "staff_calls_reason_check" CHECK (
  ("target" = 'WAITER' AND "reason" IN ('TABLE_ATTENTION', 'COME_OVER'))
  OR ("target" = 'CASHIER' AND "reason" IN ('CHARGE_TABLE', 'ACCOUNT_HELP', 'CUSTOMER_ATTENTION'))
);
ALTER TABLE "staff_calls" ADD CONSTRAINT "staff_calls_target_user_check" CHECK ("target" = 'WAITER' OR "target_user_id" IS NULL);
ALTER TABLE "staff_calls" ADD CONSTRAINT "staff_calls_closed_check" CHECK (("closed_at" IS NULL) = ("status" IN ('PENDING', 'ACKNOWLEDGED')));
ALTER TABLE "staff_calls" ADD CONSTRAINT "staff_calls_acknowledged_check" CHECK ("status" <> 'ACKNOWLEDGED' OR "acknowledged_at" IS NOT NULL);
ALTER TABLE "staff_calls" ADD CONSTRAINT "staff_calls_call_count_check" CHECK ("call_count" >= 1);
ALTER TABLE "staff_calls" ADD CONSTRAINT "staff_calls_message_check" CHECK ("message" IS NULL OR length(btrim("message")) > 0);

-- Un solo llamado abierto por clave: tocar de nuevo insiste en el mismo en lugar de duplicarlo,
-- aun con dos equipos tocando a la vez.
CREATE UNIQUE INDEX "staff_calls_open_dedupe_key" ON "staff_calls" ("dedupe_key") WHERE "status" IN ('PENDING', 'ACKNOWLEDGED');

-- Permisos en instalaciones existentes (sin quitar ninguno): llaman al mesero quienes preparan o
-- cobran; llaman a caja quienes toman pedidos sin cobrar. El administrador, ambos.
CREATE FUNCTION pg_temp.grant_permissions(target TEXT[], extra TEXT[]) RETURNS TEXT[] AS $$
  SELECT target || ARRAY(SELECT p FROM unnest(extra) AS p WHERE NOT p = ANY(target));
$$ LANGUAGE SQL IMMUTABLE;

UPDATE "roles"
SET "permissions" = pg_temp.grant_permissions("permissions", ARRAY['calls:waiter'])
WHERE 'kitchen:update' = ANY("permissions") OR 'payments:create' = ANY("permissions");

UPDATE "roles"
SET "permissions" = pg_temp.grant_permissions("permissions", ARRAY['calls:cashier'])
WHERE ('orders:create' = ANY("permissions") AND NOT 'payments:create' = ANY("permissions"))
   OR ("is_system" AND "code" = 'ADMIN');

DROP FUNCTION pg_temp.grant_permissions(TEXT[], TEXT[]);
