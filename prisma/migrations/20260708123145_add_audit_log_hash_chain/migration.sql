/*
  Warnings:

  - Added the required column `current_hash` to the `audit_logs` table without a default value. This is not possible if the table is not empty.
  - Added the optional column `previous_hash` to the `audit_logs` table.

  Migration strategy:
  1. Create new table with default values for the new columns
  2. Copy existing data
  3. Drop old table and rename new table
  4. Post-migration: existing rows get empty hashes, new rows will be chained from the latest hash
*/
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
    "previous_hash" TEXT DEFAULT '',
    "current_hash" TEXT NOT NULL DEFAULT '',
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "audit_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_audit_logs" (
    "id", "workspace_id", "ticket_id", "trace_id", "actor", "action",
    "tool", "approval_id", "template_id", "outbound_message_id",
    "provider_message_id", "change_request_id", "snapshot_id", "diff_id",
    "request", "response", "ts"
) SELECT
    "id", "workspace_id", "ticket_id", "trace_id", "actor", "action",
    "tool", "approval_id", "template_id", "outbound_message_id",
    "provider_message_id", "change_request_id", "snapshot_id", "diff_id",
    "request", "response", "ts"
FROM "audit_logs";

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

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
