-- Create notification source and read status enums (idempotent)
DO $$ BEGIN CREATE TYPE "notification_source" AS ENUM ('INCIDENT', 'MONITORING', 'JOB', 'CLOUD_ACCOUNT', 'SYSTEM'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "notification_read_status" AS ENUM ('UNREAD', 'READ'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Create notifications table
CREATE TABLE IF NOT EXISTS "notifications" (
    "id" UUID NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "source" "notification_source" NOT NULL,
    "severity" "alert_severity" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "resource_id" UUID,
    "incident_id" UUID,
    "job_id" UUID,
    "read_status" "notification_read_status" NOT NULL DEFAULT 'UNREAD',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "notifications_source_created_at_idx" ON "notifications" ("source", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "notifications_read_status_created_at_idx" ON "notifications" ("read_status", "created_at" DESC);

DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_resource_id_fkey"
    FOREIGN KEY ("resource_id") REFERENCES "cloud_resources"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_incident_id_fkey"
    FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create notification_preferences table
CREATE TABLE IF NOT EXISTS "notification_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source" "notification_source" NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "notification_preferences_user_id_source_channel_key"
    ON "notification_preferences" ("user_id", "source", "channel");

DO $$ BEGIN
  ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add notification_id to existing notification_deliveries
ALTER TABLE "notification_deliveries" ADD COLUMN IF NOT EXISTS "notification_id" UUID;
CREATE INDEX IF NOT EXISTS "notification_deliveries_notification_id_idx" ON "notification_deliveries" ("notification_id");
DO $$ BEGIN
  ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey"
    FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
