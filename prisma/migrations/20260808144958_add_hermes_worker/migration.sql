-- CreateTable
CREATE TABLE "hermes_workers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "base_url" TEXT NOT NULL,
    "ws_url" TEXT,
    "auth_token_ref" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "capabilities" TEXT NOT NULL DEFAULT '{}',
    "last_health_at" DATETIME,
    "last_health_status" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "hermes_tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worker_id" TEXT NOT NULL,
    "ticket_id" TEXT,
    "task_type" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "context" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL,
    "result" TEXT,
    "error" TEXT,
    "logs" TEXT,
    "trace_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "hermes_tasks_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "hermes_workers" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "hermes_tasks_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "hermes_workers_name_key" ON "hermes_workers"("name");

-- CreateIndex
CREATE INDEX "hermes_workers_enabled_idx" ON "hermes_workers"("enabled");

-- CreateIndex
CREATE INDEX "hermes_tasks_worker_id_idx" ON "hermes_tasks"("worker_id");

-- CreateIndex
CREATE INDEX "hermes_tasks_ticket_id_idx" ON "hermes_tasks"("ticket_id");

-- CreateIndex
CREATE INDEX "hermes_tasks_status_idx" ON "hermes_tasks"("status");

-- CreateIndex
CREATE INDEX "hermes_tasks_trace_id_idx" ON "hermes_tasks"("trace_id");
