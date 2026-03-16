/*
  Warnings:

  - You are about to drop the column `sent_at` on the `outbound_messages` table. All the data in the column will be lost.
  - Added the required column `content_hash` to the `outbound_messages` table without a default value. This is not possible if the table is not empty.
  - Added the required column `idempotency_key` to the `outbound_messages` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN "approval_id" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "outbound_message_id" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "provider_message_id" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "template_id" TEXT;

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "tags" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "contact_targets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contact_id" TEXT NOT NULL,
    "comms_target_id" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "channel" TEXT NOT NULL,
    "to_masked" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contact_targets_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contact_targets_comms_target_id_fkey" FOREIGN KEY ("comms_target_id") REFERENCES "comms_targets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "channel_constraints" TEXT NOT NULL,
    "content_format" TEXT NOT NULL,
    "subject_template" TEXT,
    "body_template" TEXT NOT NULL,
    "variables_schema" TEXT NOT NULL,
    "defaults" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "template_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "template_id" TEXT NOT NULL,
    "ticket_id" TEXT,
    "variables" TEXT NOT NULL,
    "rendered_subject" TEXT,
    "rendered_body" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "template_runs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "message_templates" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "template_runs_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_outbound_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    CONSTRAINT "outbound_messages_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_outbound_messages" ("artifact_id", "body", "channel", "created_at", "id", "last_error", "status", "subject", "ticket_id", "to", "trace_id", "updated_at") SELECT "artifact_id", "body", "channel", "created_at", "id", "last_error", "status", "subject", "ticket_id", "to", "trace_id", "updated_at" FROM "outbound_messages";
DROP TABLE "outbound_messages";
ALTER TABLE "new_outbound_messages" RENAME TO "outbound_messages";
CREATE UNIQUE INDEX "outbound_messages_idempotency_key_key" ON "outbound_messages"("idempotency_key");
CREATE INDEX "outbound_messages_ticket_id_idx" ON "outbound_messages"("ticket_id");
CREATE INDEX "outbound_messages_artifact_id_idx" ON "outbound_messages"("artifact_id");
CREATE INDEX "outbound_messages_status_idx" ON "outbound_messages"("status");
CREATE INDEX "outbound_messages_trace_id_idx" ON "outbound_messages"("trace_id");
CREATE INDEX "outbound_messages_next_retry_at_idx" ON "outbound_messages"("next_retry_at");
CREATE INDEX "outbound_messages_content_hash_idx" ON "outbound_messages"("content_hash");
CREATE TABLE "new_tickets" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    CONSTRAINT "tickets_primary_target_id_fkey" FOREIGN KEY ("primary_target_id") REFERENCES "comms_targets" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_tickets" ("assignee_agent_id", "created_at", "customer_meta", "due_at", "id", "priority", "source", "status", "title", "updated_at") SELECT "assignee_agent_id", "created_at", "customer_meta", "due_at", "id", "priority", "source", "status", "title", "updated_at" FROM "tickets";
DROP TABLE "tickets";
ALTER TABLE "new_tickets" RENAME TO "tickets";
CREATE INDEX "tickets_contact_id_idx" ON "tickets"("contact_id");
CREATE INDEX "tickets_primary_target_id_idx" ON "tickets"("primary_target_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "contacts_name_idx" ON "contacts"("name");

-- CreateIndex
CREATE INDEX "contact_targets_contact_id_is_primary_idx" ON "contact_targets"("contact_id", "is_primary");

-- CreateIndex
CREATE UNIQUE INDEX "contact_targets_contact_id_comms_target_id_key" ON "contact_targets"("contact_id", "comms_target_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_name_key" ON "message_templates"("name");

-- CreateIndex
CREATE INDEX "message_templates_scenario_enabled_idx" ON "message_templates"("scenario", "enabled");

-- CreateIndex
CREATE INDEX "template_runs_template_id_idx" ON "template_runs"("template_id");

-- CreateIndex
CREATE INDEX "template_runs_ticket_id_idx" ON "template_runs"("ticket_id");

-- CreateIndex
CREATE INDEX "audit_logs_approval_id_idx" ON "audit_logs"("approval_id");

-- CreateIndex
CREATE INDEX "audit_logs_outbound_message_id_idx" ON "audit_logs"("outbound_message_id");
