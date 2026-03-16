-- CreateTable
CREATE TABLE "event_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "target_id" TEXT,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "payload_json" TEXT NOT NULL,
    "trace_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "event_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "operations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "target_id" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "trace_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "operations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "operation_phases" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operation_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order_no" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" DATETIME,
    "ended_at" DATETIME,
    CONSTRAINT "operation_phases_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "operations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "operation_steps" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phase_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "step_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "request_json" TEXT NOT NULL DEFAULT '{}',
    "result_json" TEXT,
    "logs" TEXT,
    "started_at" DATETIME,
    "ended_at" DATETIME,
    "deployment_job_id" TEXT,
    "change_request_id" TEXT,
    "alert_id" TEXT,
    CONSTRAINT "operation_steps_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "operation_phases" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "doctor_checks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "target_id" TEXT,
    "check_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "result_json" TEXT NOT NULL,
    "score" INTEGER,
    "trace_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "doctor_checks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "target_id" TEXT,
    "source_check_id" TEXT,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "trace_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "alerts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "doctor_schedules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "target_id" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "interval_minutes" INTEGER NOT NULL DEFAULT 30,
    "check_types_json" TEXT NOT NULL DEFAULT '[]',
    "last_run_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "doctor_schedules_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notification_policies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "event_filters" TEXT NOT NULL,
    "target_filters" TEXT NOT NULL,
    "delivery_targets" TEXT NOT NULL,
    "template_id" TEXT,
    "cooldown_seconds" INTEGER NOT NULL DEFAULT 300,
    "dedupe_window_seconds" INTEGER NOT NULL DEFAULT 900,
    "quiet_hours_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "notification_policies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "event_records_workspace_id_idx" ON "event_records"("workspace_id");

-- CreateIndex
CREATE INDEX "event_records_target_id_idx" ON "event_records"("target_id");

-- CreateIndex
CREATE INDEX "event_records_source_type_idx" ON "event_records"("source_type");

-- CreateIndex
CREATE INDEX "event_records_event_type_idx" ON "event_records"("event_type");

-- CreateIndex
CREATE INDEX "event_records_severity_idx" ON "event_records"("severity");

-- CreateIndex
CREATE INDEX "event_records_trace_id_idx" ON "event_records"("trace_id");

-- CreateIndex
CREATE INDEX "event_records_created_at_idx" ON "event_records"("created_at");

-- CreateIndex
CREATE INDEX "operations_workspace_id_idx" ON "operations"("workspace_id");

-- CreateIndex
CREATE INDEX "operations_target_id_idx" ON "operations"("target_id");

-- CreateIndex
CREATE INDEX "operations_trace_id_idx" ON "operations"("trace_id");

-- CreateIndex
CREATE INDEX "operations_status_idx" ON "operations"("status");

-- CreateIndex
CREATE INDEX "operations_type_idx" ON "operations"("type");

-- CreateIndex
CREATE INDEX "operation_phases_operation_id_idx" ON "operation_phases"("operation_id");

-- CreateIndex
CREATE INDEX "operation_phases_status_idx" ON "operation_phases"("status");

-- CreateIndex
CREATE UNIQUE INDEX "operation_phases_operation_id_order_no_key" ON "operation_phases"("operation_id", "order_no");

-- CreateIndex
CREATE INDEX "operation_steps_phase_id_idx" ON "operation_steps"("phase_id");

-- CreateIndex
CREATE INDEX "operation_steps_status_idx" ON "operation_steps"("status");

-- CreateIndex
CREATE INDEX "operation_steps_step_type_idx" ON "operation_steps"("step_type");

-- CreateIndex
CREATE INDEX "operation_steps_deployment_job_id_idx" ON "operation_steps"("deployment_job_id");

-- CreateIndex
CREATE INDEX "operation_steps_change_request_id_idx" ON "operation_steps"("change_request_id");

-- CreateIndex
CREATE INDEX "operation_steps_alert_id_idx" ON "operation_steps"("alert_id");

-- CreateIndex
CREATE INDEX "doctor_checks_workspace_id_idx" ON "doctor_checks"("workspace_id");

-- CreateIndex
CREATE INDEX "doctor_checks_target_id_idx" ON "doctor_checks"("target_id");

-- CreateIndex
CREATE INDEX "doctor_checks_check_type_idx" ON "doctor_checks"("check_type");

-- CreateIndex
CREATE INDEX "doctor_checks_status_idx" ON "doctor_checks"("status");

-- CreateIndex
CREATE INDEX "doctor_checks_trace_id_idx" ON "doctor_checks"("trace_id");

-- CreateIndex
CREATE INDEX "doctor_checks_created_at_idx" ON "doctor_checks"("created_at");

-- CreateIndex
CREATE INDEX "alerts_workspace_id_idx" ON "alerts"("workspace_id");

-- CreateIndex
CREATE INDEX "alerts_target_id_idx" ON "alerts"("target_id");

-- CreateIndex
CREATE INDEX "alerts_source_check_id_idx" ON "alerts"("source_check_id");

-- CreateIndex
CREATE INDEX "alerts_severity_idx" ON "alerts"("severity");

-- CreateIndex
CREATE INDEX "alerts_status_idx" ON "alerts"("status");

-- CreateIndex
CREATE INDEX "alerts_dedupe_key_idx" ON "alerts"("dedupe_key");

-- CreateIndex
CREATE INDEX "alerts_trace_id_idx" ON "alerts"("trace_id");

-- CreateIndex
CREATE INDEX "doctor_schedules_workspace_id_idx" ON "doctor_schedules"("workspace_id");

-- CreateIndex
CREATE INDEX "doctor_schedules_target_id_idx" ON "doctor_schedules"("target_id");

-- CreateIndex
CREATE INDEX "doctor_schedules_enabled_idx" ON "doctor_schedules"("enabled");

-- CreateIndex
CREATE INDEX "notification_policies_workspace_id_idx" ON "notification_policies"("workspace_id");

-- CreateIndex
CREATE INDEX "notification_policies_enabled_idx" ON "notification_policies"("enabled");

-- CreateIndex
CREATE INDEX "notification_policies_template_id_idx" ON "notification_policies"("template_id");
