-- CreateTable
CREATE TABLE "pipelines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "pipeline_steps" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pipeline_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "role_name" TEXT NOT NULL,
    "input_artifacts" TEXT NOT NULL,
    "output_artifacts" TEXT NOT NULL,
    "require_approval_actions" TEXT NOT NULL,
    "allow_rework" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "pipeline_steps_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ticket_pipeline_states" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticket_id" TEXT NOT NULL,
    "pipeline_id" TEXT NOT NULL,
    "current_step_order" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_pipeline_states_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ticket_pipeline_states_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticket_id" TEXT NOT NULL,
    "step_order" INTEGER,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "request" TEXT NOT NULL,
    "result" TEXT,
    "logs" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "jobs_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" DATETIME,
    "last_error" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "pipelines_name_key" ON "pipelines"("name");

-- CreateIndex
CREATE INDEX "pipeline_steps_pipeline_id_idx" ON "pipeline_steps"("pipeline_id");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_steps_pipeline_id_order_key" ON "pipeline_steps"("pipeline_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_pipeline_states_ticket_id_key" ON "ticket_pipeline_states"("ticket_id");

-- CreateIndex
CREATE INDEX "ticket_pipeline_states_pipeline_id_idx" ON "ticket_pipeline_states"("pipeline_id");

-- CreateIndex
CREATE INDEX "ticket_pipeline_states_status_idx" ON "ticket_pipeline_states"("status");

-- CreateIndex
CREATE INDEX "jobs_ticket_id_idx" ON "jobs"("ticket_id");

-- CreateIndex
CREATE INDEX "jobs_trace_id_idx" ON "jobs"("trace_id");

-- CreateIndex
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- CreateIndex
CREATE INDEX "outbox_events_status_idx" ON "outbox_events"("status");

-- CreateIndex
CREATE INDEX "outbox_events_next_retry_at_idx" ON "outbox_events"("next_retry_at");

-- CreateIndex
CREATE INDEX "outbox_events_trace_id_idx" ON "outbox_events"("trace_id");
