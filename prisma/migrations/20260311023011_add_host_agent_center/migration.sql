-- CreateTable
CREATE TABLE "host_agents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "target_id" TEXT,
    "name" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "os_type" TEXT NOT NULL,
    "arch" TEXT NOT NULL,
    "agent_version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNREGISTERED',
    "last_heartbeat_at" DATETIME,
    "last_seen_ip" TEXT,
    "auth_mode" TEXT NOT NULL DEFAULT 'TOKEN',
    "capabilities_json" TEXT NOT NULL DEFAULT '{}',
    "labels_json" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "host_agents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "host_agents_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "deployment_targets" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "agent_registrations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "target_id" TEXT,
    "bootstrap_token_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expires_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" DATETIME,
    CONSTRAINT "agent_registrations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_registrations_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "deployment_targets" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "agent_actions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "host_agent_id" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "request_json" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "trace_id" TEXT NOT NULL,
    "timeout_seconds" INTEGER NOT NULL DEFAULT 60,
    "started_at" DATETIME,
    "finished_at" DATETIME,
    "result_json" TEXT,
    "error_summary" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "agent_actions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_actions_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "deployment_targets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_actions_host_agent_id_fkey" FOREIGN KEY ("host_agent_id") REFERENCES "host_agents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "agent_heartbeats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "host_agent_id" TEXT NOT NULL,
    "target_id" TEXT,
    "heartbeat_json" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_heartbeats_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_heartbeats_host_agent_id_fkey" FOREIGN KEY ("host_agent_id") REFERENCES "host_agents" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "agent_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "host_agent_id" TEXT NOT NULL,
    "action_id" TEXT,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data_json" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_logs_host_agent_id_fkey" FOREIGN KEY ("host_agent_id") REFERENCES "host_agents" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agent_logs_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "agent_actions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "host_agents_workspace_id_idx" ON "host_agents"("workspace_id");

-- CreateIndex
CREATE INDEX "host_agents_target_id_idx" ON "host_agents"("target_id");

-- CreateIndex
CREATE INDEX "host_agents_status_idx" ON "host_agents"("status");

-- CreateIndex
CREATE INDEX "host_agents_last_heartbeat_at_idx" ON "host_agents"("last_heartbeat_at");

-- CreateIndex
CREATE INDEX "agent_registrations_workspace_id_idx" ON "agent_registrations"("workspace_id");

-- CreateIndex
CREATE INDEX "agent_registrations_target_id_idx" ON "agent_registrations"("target_id");

-- CreateIndex
CREATE INDEX "agent_registrations_status_idx" ON "agent_registrations"("status");

-- CreateIndex
CREATE INDEX "agent_registrations_expires_at_idx" ON "agent_registrations"("expires_at");

-- CreateIndex
CREATE INDEX "agent_actions_workspace_id_idx" ON "agent_actions"("workspace_id");

-- CreateIndex
CREATE INDEX "agent_actions_target_id_idx" ON "agent_actions"("target_id");

-- CreateIndex
CREATE INDEX "agent_actions_host_agent_id_idx" ON "agent_actions"("host_agent_id");

-- CreateIndex
CREATE INDEX "agent_actions_status_idx" ON "agent_actions"("status");

-- CreateIndex
CREATE INDEX "agent_actions_trace_id_idx" ON "agent_actions"("trace_id");

-- CreateIndex
CREATE INDEX "agent_heartbeats_workspace_id_idx" ON "agent_heartbeats"("workspace_id");

-- CreateIndex
CREATE INDEX "agent_heartbeats_host_agent_id_idx" ON "agent_heartbeats"("host_agent_id");

-- CreateIndex
CREATE INDEX "agent_heartbeats_target_id_idx" ON "agent_heartbeats"("target_id");

-- CreateIndex
CREATE INDEX "agent_heartbeats_created_at_idx" ON "agent_heartbeats"("created_at");

-- CreateIndex
CREATE INDEX "agent_logs_workspace_id_idx" ON "agent_logs"("workspace_id");

-- CreateIndex
CREATE INDEX "agent_logs_host_agent_id_idx" ON "agent_logs"("host_agent_id");

-- CreateIndex
CREATE INDEX "agent_logs_action_id_idx" ON "agent_logs"("action_id");

-- CreateIndex
CREATE INDEX "agent_logs_created_at_idx" ON "agent_logs"("created_at");
