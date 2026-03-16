-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- 为兼容历史数据与默认 workspace_id，创建默认工作区（Local）
INSERT INTO "workspaces" ("id", "name", "description", "created_at", "updated_at")
VALUES ('00000000-0000-0000-0000-000000000001', 'Local', '本地默认工作区', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- CreateTable
CREATE TABLE "workspace_profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workspace_profiles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "workspace_profiles_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "connection_profiles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "workspace_policies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "policy_json" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "workspace_policies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "request" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "audit_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_audit_logs" ("action", "actor", "approval_id", "id", "outbound_message_id", "provider_message_id", "request", "response", "template_id", "ticket_id", "tool", "trace_id", "ts") SELECT "action", "actor", "approval_id", "id", "outbound_message_id", "provider_message_id", "request", "response", "template_id", "ticket_id", "tool", "trace_id", "ts" FROM "audit_logs";
DROP TABLE "audit_logs";
ALTER TABLE "new_audit_logs" RENAME TO "audit_logs";
CREATE INDEX "audit_logs_workspace_id_idx" ON "audit_logs"("workspace_id");
CREATE INDEX "audit_logs_trace_id_idx" ON "audit_logs"("trace_id");
CREATE INDEX "audit_logs_ticket_id_idx" ON "audit_logs"("ticket_id");
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs"("actor");
CREATE INDEX "audit_logs_approval_id_idx" ON "audit_logs"("approval_id");
CREATE INDEX "audit_logs_outbound_message_id_idx" ON "audit_logs"("outbound_message_id");
CREATE TABLE "new_comms_targets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "comms_profile_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "allowlisted" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "comms_targets_comms_profile_id_fkey" FOREIGN KEY ("comms_profile_id") REFERENCES "comms_profiles" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "comms_targets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_comms_targets" ("allowlisted", "channel", "comms_profile_id", "created_at", "display_name", "id", "notes", "to", "updated_at") SELECT "allowlisted", "channel", "comms_profile_id", "created_at", "display_name", "id", "notes", "to", "updated_at" FROM "comms_targets";
DROP TABLE "comms_targets";
ALTER TABLE "new_comms_targets" RENAME TO "comms_targets";
CREATE INDEX "comms_targets_workspace_id_idx" ON "comms_targets"("workspace_id");
CREATE INDEX "comms_targets_allowlisted_idx" ON "comms_targets"("allowlisted");
CREATE UNIQUE INDEX "comms_targets_comms_profile_id_channel_to_key" ON "comms_targets"("comms_profile_id", "channel", "to");
CREATE TABLE "new_contacts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "name" TEXT NOT NULL,
    "company" TEXT,
    "tags" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "contacts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_contacts" ("company", "created_at", "id", "name", "notes", "tags", "updated_at") SELECT "company", "created_at", "id", "name", "notes", "tags", "updated_at" FROM "contacts";
DROP TABLE "contacts";
ALTER TABLE "new_contacts" RENAME TO "contacts";
CREATE INDEX "contacts_workspace_id_idx" ON "contacts"("workspace_id");
CREATE INDEX "contacts_name_idx" ON "contacts"("name");
CREATE TABLE "new_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "ticket_id" TEXT,
    "step_order" INTEGER,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "request" TEXT NOT NULL,
    "result" TEXT,
    "logs" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "jobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "jobs_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_jobs" ("created_at", "id", "logs", "request", "result", "status", "step_order", "ticket_id", "trace_id", "type", "updated_at") SELECT "created_at", "id", "logs", "request", "result", "status", "step_order", "ticket_id", "trace_id", "type", "updated_at" FROM "jobs";
DROP TABLE "jobs";
ALTER TABLE "new_jobs" RENAME TO "jobs";
CREATE INDEX "jobs_workspace_id_idx" ON "jobs"("workspace_id");
CREATE INDEX "jobs_ticket_id_idx" ON "jobs"("ticket_id");
CREATE INDEX "jobs_trace_id_idx" ON "jobs"("trace_id");
CREATE INDEX "jobs_status_idx" ON "jobs"("status");
CREATE TABLE "new_outbound_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "ticket_id" TEXT,
    "artifact_id" TEXT,
    "approval_id" TEXT,
    "template_id" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'openclaw',
    "channel" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "to_masked" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "provider_receipt" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" DATETIME,
    "last_error" TEXT,
    "last_sent_at" DATETIME,
    "content_hash" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "outbound_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "outbound_messages_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "outbound_messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_outbound_messages" ("approval_id", "artifact_id", "attempts", "body", "channel", "content_hash", "created_at", "id", "idempotency_key", "last_error", "last_sent_at", "next_retry_at", "provider", "provider_message_id", "provider_receipt", "status", "subject", "template_id", "ticket_id", "to", "to_masked", "trace_id", "updated_at") SELECT "approval_id", "artifact_id", "attempts", "body", "channel", "content_hash", "created_at", "id", "idempotency_key", "last_error", "last_sent_at", "next_retry_at", "provider", "provider_message_id", "provider_receipt", "status", "subject", "template_id", "ticket_id", "to", "to_masked", "trace_id", "updated_at" FROM "outbound_messages";
DROP TABLE "outbound_messages";
ALTER TABLE "new_outbound_messages" RENAME TO "outbound_messages";
CREATE UNIQUE INDEX "outbound_messages_idempotency_key_key" ON "outbound_messages"("idempotency_key");
CREATE INDEX "outbound_messages_workspace_id_idx" ON "outbound_messages"("workspace_id");
CREATE INDEX "outbound_messages_ticket_id_idx" ON "outbound_messages"("ticket_id");
CREATE INDEX "outbound_messages_artifact_id_idx" ON "outbound_messages"("artifact_id");
CREATE INDEX "outbound_messages_status_idx" ON "outbound_messages"("status");
CREATE INDEX "outbound_messages_trace_id_idx" ON "outbound_messages"("trace_id");
CREATE INDEX "outbound_messages_next_retry_at_idx" ON "outbound_messages"("next_retry_at");
CREATE INDEX "outbound_messages_content_hash_idx" ON "outbound_messages"("content_hash");
CREATE TABLE "new_outbox_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "kind" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" DATETIME,
    "last_error" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "outbox_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_outbox_events" ("attempts", "created_at", "id", "kind", "last_error", "next_retry_at", "payload", "status", "trace_id", "updated_at") SELECT "attempts", "created_at", "id", "kind", "last_error", "next_retry_at", "payload", "status", "trace_id", "updated_at" FROM "outbox_events";
DROP TABLE "outbox_events";
ALTER TABLE "new_outbox_events" RENAME TO "outbox_events";
CREATE INDEX "outbox_events_workspace_id_idx" ON "outbox_events"("workspace_id");
CREATE INDEX "outbox_events_status_idx" ON "outbox_events"("status");
CREATE INDEX "outbox_events_next_retry_at_idx" ON "outbox_events"("next_retry_at");
CREATE INDEX "outbox_events_trace_id_idx" ON "outbox_events"("trace_id");
CREATE TABLE "new_tickets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "assignee_agent_id" TEXT,
    "contact_id" TEXT,
    "primary_target_id" TEXT,
    "due_at" DATETIME,
    "customer_meta" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "tickets_assignee_agent_id_fkey" FOREIGN KEY ("assignee_agent_id") REFERENCES "agents" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "tickets_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "tickets_primary_target_id_fkey" FOREIGN KEY ("primary_target_id") REFERENCES "comms_targets" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "tickets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_tickets" ("assignee_agent_id", "contact_id", "created_at", "customer_meta", "due_at", "id", "primary_target_id", "priority", "source", "status", "title", "updated_at") SELECT "assignee_agent_id", "contact_id", "created_at", "customer_meta", "due_at", "id", "primary_target_id", "priority", "source", "status", "title", "updated_at" FROM "tickets";
DROP TABLE "tickets";
ALTER TABLE "new_tickets" RENAME TO "tickets";
CREATE INDEX "tickets_workspace_id_idx" ON "tickets"("workspace_id");
CREATE INDEX "tickets_contact_id_idx" ON "tickets"("contact_id");
CREATE INDEX "tickets_primary_target_id_idx" ON "tickets"("primary_target_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_name_key" ON "workspaces"("name");

-- CreateIndex
CREATE INDEX "workspace_profiles_workspace_id_idx" ON "workspace_profiles"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_profiles_workspace_id_profile_id_key" ON "workspace_profiles"("workspace_id", "profile_id");

-- CreateIndex
CREATE INDEX "workspace_policies_workspace_id_idx" ON "workspace_policies"("workspace_id");
