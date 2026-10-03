-- Llamar a un mesero en particular: quien llama ve si el aviso ya apareció en el celular del
-- mesero ("vista") y, si nadie responde en el tiempo configurado, el llamado pasa a todos.
-- Reversión: down.sql en esta misma carpeta (ver docs/DATABASE.md).

-- AlterTable
ALTER TABLE "staff_calls" ADD COLUMN "seen_at" TIMESTAMPTZ(3),
ADD COLUMN "seen_by_id" UUID,
ADD COLUMN "escalated_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "restaurant_settings" ADD COLUMN "staff_call_escalate_seconds" INTEGER NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "staff_calls" ADD CONSTRAINT "staff_calls_seen_by_id_fkey" FOREIGN KEY ("seen_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invariantes: quien la vio implica cuándo; solo se escala un llamado al mesero; el tiempo de
-- escalamiento va de 0 (nunca) a 10 minutos.
ALTER TABLE "staff_calls" ADD CONSTRAINT "staff_calls_seen_check" CHECK ("seen_by_id" IS NULL OR "seen_at" IS NOT NULL);
ALTER TABLE "staff_calls" ADD CONSTRAINT "staff_calls_escalated_check" CHECK ("escalated_at" IS NULL OR "target" = 'WAITER');
ALTER TABLE "restaurant_settings" ADD CONSTRAINT "restaurant_settings_staff_call_escalate_check" CHECK ("staff_call_escalate_seconds" BETWEEN 0 AND 600);
