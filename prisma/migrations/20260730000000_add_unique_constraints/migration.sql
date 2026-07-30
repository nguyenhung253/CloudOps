-- Add unique constraint on Incident.dedupKey (nullable, so multiple NULLs are fine)
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_dedup_key_key" UNIQUE ("dedup_key");

-- Partial unique index on AlertRule (name, cloud_account_id) WHERE deleted_at IS NULL
-- Ensures no two active rules share the same name within a cloud account
CREATE UNIQUE INDEX "alert_rules_name_cloud_account_id_active_idx"
  ON "alert_rules" ("name", "cloud_account_id")
  WHERE "deleted_at" IS NULL;

-- Index to support authorization checks (user's cloud accounts for alert rules)
CREATE INDEX "alert_rules_created_by_cloud_account_id_idx"
  ON "alert_rules" ("created_by", "cloud_account_id");
