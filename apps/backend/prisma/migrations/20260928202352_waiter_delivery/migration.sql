-- La entrega pasa de cocina al mesero (docs/adr/0012-entrega-confirmada-por-el-mesero.md).

-- AlterTable
ALTER TABLE "kitchen_tickets" ADD COLUMN     "delivered_by_id" UUID;

-- AddForeignKey
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_delivered_by_id_fkey" FOREIGN KEY ("delivered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invariante: solo una comanda entregada registra quién la entregó.
ALTER TABLE "kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_delivered_by_check" CHECK ("delivered_by_id" IS NULL OR "status" = 'DELIVERED');

-- Permisos nuevos en instalaciones existentes (el seed solo corre en instalaciones nuevas).
-- Se agregan sin duplicar y sin tocar el resto de los permisos del rol.
CREATE FUNCTION pg_temp.grant_permissions(target TEXT[], extra TEXT[]) RETURNS TEXT[] AS $$
  SELECT target || ARRAY(SELECT p FROM unnest(extra) AS p WHERE NOT p = ANY(target));
$$ LANGUAGE SQL IMMUTABLE;

-- Todo rol que toma pedidos (de sistema o personalizado) puede confirmar sus entregas.
UPDATE "roles"
SET "permissions" = pg_temp.grant_permissions("permissions", ARRAY['orders:deliver'])
WHERE 'orders:create' = ANY("permissions");

-- Administración y caja operan pedidos de cualquier mesero.
UPDATE "roles"
SET "permissions" = pg_temp.grant_permissions("permissions", ARRAY['orders:deliver', 'orders:manage_any'])
WHERE "is_system" AND "code" IN ('ADMIN', 'CASHIER');

-- En modo bar el barman entrega lo que prepara.
UPDATE "roles"
SET "permissions" = pg_temp.grant_permissions("permissions", ARRAY['orders:deliver', 'orders:manage_any'])
WHERE "is_system" AND "code" = 'KITCHEN'
  AND EXISTS (SELECT 1 FROM "restaurant_settings" WHERE "business_mode" = 'BAR');

DROP FUNCTION pg_temp.grant_permissions(TEXT[], TEXT[]);
