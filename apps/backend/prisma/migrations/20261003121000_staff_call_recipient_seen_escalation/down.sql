-- Revierte 20261003121000_staff_call_recipient_seen_escalation (no lo aplica el migrador; ver
-- docs/DATABASE.md). Se pierde cuándo y quién vio cada llamado y si se escaló; el destinatario
-- (target_user_id) se conserva.

ALTER TABLE "restaurant_settings" DROP CONSTRAINT "restaurant_settings_staff_call_escalate_check";
ALTER TABLE "restaurant_settings" DROP COLUMN "staff_call_escalate_seconds";

ALTER TABLE "staff_calls" DROP CONSTRAINT "staff_calls_escalated_check";
ALTER TABLE "staff_calls" DROP CONSTRAINT "staff_calls_seen_check";
ALTER TABLE "staff_calls" DROP CONSTRAINT "staff_calls_seen_by_id_fkey";
ALTER TABLE "staff_calls" DROP COLUMN "escalated_at",
DROP COLUMN "seen_by_id",
DROP COLUMN "seen_at";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261003121000_staff_call_recipient_seen_escalation';
