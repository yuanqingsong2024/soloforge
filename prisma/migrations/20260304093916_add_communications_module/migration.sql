-- CreateTable
CREATE TABLE "comms_profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "openclaw_profile_id" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "comms_profiles_openclaw_profile_id_fkey" FOREIGN KEY ("openclaw_profile_id") REFERENCES "connection_profiles" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "comms_targets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "comms_profile_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "allowlisted" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "comms_targets_comms_profile_id_fkey" FOREIGN KEY ("comms_profile_id") REFERENCES "comms_profiles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "outbound_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticket_id" TEXT,
    "artifact_id" TEXT,
    "channel" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "last_error" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" DATETIME,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "outbound_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "outbound_messages_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "comms_profiles_name_key" ON "comms_profiles"("name");

-- CreateIndex
CREATE INDEX "comms_profiles_enabled_idx" ON "comms_profiles"("enabled");

-- CreateIndex
CREATE INDEX "comms_targets_allowlisted_idx" ON "comms_targets"("allowlisted");

-- CreateIndex
CREATE UNIQUE INDEX "comms_targets_comms_profile_id_channel_to_key" ON "comms_targets"("comms_profile_id", "channel", "to");

-- CreateIndex
CREATE UNIQUE INDEX "outbound_messages_trace_id_key" ON "outbound_messages"("trace_id");

-- CreateIndex
CREATE INDEX "outbound_messages_ticket_id_idx" ON "outbound_messages"("ticket_id");

-- CreateIndex
CREATE INDEX "outbound_messages_artifact_id_idx" ON "outbound_messages"("artifact_id");

-- CreateIndex
CREATE INDEX "outbound_messages_status_idx" ON "outbound_messages"("status");
