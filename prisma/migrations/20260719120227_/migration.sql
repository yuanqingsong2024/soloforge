/*
  Warnings:

  - You are about to drop the column `openclaw_profile_id` on the `comms_profiles` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "ticket_id" TEXT,
    "trace_id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "tool" TEXT,
    "approval_id" TEXT,
    "template_id" TEXT,
    "outbound_message_id" TEXT,
    "provider_message_id" TEXT,
    "change_request_id" TEXT,
    "snapshot_id" TEXT,
    "diff_id" TEXT,
    "request" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "previous_hash" TEXT,
    "current_hash" TEXT NOT NULL,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "audit_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_audit_logs" ("action", "actor", "approval_id", "change_request_id", "current_hash", "diff_id", "id", "outbound_message_id", "previous_hash", "provider_message_id", "request", "response", "snapshot_id", "template_id", "ticket_id", "tool", "trace_id", "ts", "workspace_id") SELECT "action", "actor", "approval_id", "change_request_id", "current_hash", "diff_id", "id", "outbound_message_id", "previous_hash", "provider_message_id", "request", "response", "snapshot_id", "template_id", "ticket_id", "tool", "trace_id", "ts", "workspace_id" FROM "audit_logs";
DROP TABLE "audit_logs";
ALTER TABLE "new_audit_logs" RENAME TO "audit_logs";
CREATE INDEX "audit_logs_workspace_id_idx" ON "audit_logs"("workspace_id");
CREATE INDEX "audit_logs_trace_id_idx" ON "audit_logs"("trace_id");
CREATE INDEX "audit_logs_ticket_id_idx" ON "audit_logs"("ticket_id");
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs"("actor");
CREATE INDEX "audit_logs_approval_id_idx" ON "audit_logs"("approval_id");
CREATE INDEX "audit_logs_outbound_message_id_idx" ON "audit_logs"("outbound_message_id");
CREATE INDEX "audit_logs_change_request_id_idx" ON "audit_logs"("change_request_id");
CREATE INDEX "audit_logs_ts_idx" ON "audit_logs"("ts");
CREATE TABLE "new_comms_profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "claude_code_profile_id" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "comms_profiles_claude_code_profile_id_fkey" FOREIGN KEY ("claude_code_profile_id") REFERENCES "connection_profiles" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_comms_profiles" ("created_at", "enabled", "id", "name", "provider", "updated_at") SELECT "created_at", "enabled", "id", "name", "provider", "updated_at" FROM "comms_profiles";
DROP TABLE "comms_profiles";
ALTER TABLE "new_comms_profiles" RENAME TO "comms_profiles";
CREATE UNIQUE INDEX "comms_profiles_name_key" ON "comms_profiles"("name");
CREATE INDEX "comms_profiles_enabled_idx" ON "comms_profiles"("enabled");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
