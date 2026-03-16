-- CreateTable
CREATE TABLE "version_catalog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "release_channel" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "metadata_json" TEXT NOT NULL DEFAULT '{}',
    "release_notes_summary" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "version_catalog_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "installed_versions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "installed_version" TEXT NOT NULL,
    "detected_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "details_json" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "installed_versions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "installed_versions_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "deployment_targets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "upgrade_policies" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "target_scope_json" TEXT NOT NULL DEFAULT '{}',
    "release_channel_scope_json" TEXT NOT NULL DEFAULT '{}',
    "auto_detect_updates" BOOLEAN NOT NULL DEFAULT true,
    "require_backup" BOOLEAN NOT NULL DEFAULT true,
    "require_approval" BOOLEAN NOT NULL DEFAULT true,
    "require_maintenance_window" BOOLEAN NOT NULL DEFAULT false,
    "allow_auto_rollback" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "upgrade_policies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "maintenance_windows" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "cron_or_rule" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "maintenance_windows_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "upgrade_plans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "policy_id" TEXT,
    "component" TEXT NOT NULL,
    "current_version" TEXT NOT NULL,
    "target_version" TEXT NOT NULL,
    "release_channel" TEXT NOT NULL,
    "plan_json" TEXT NOT NULL,
    "risk_level" TEXT NOT NULL,
    "dry_run_result_json" TEXT,
    "status" TEXT NOT NULL,
    "approval_id" TEXT,
    "operation_id" TEXT,
    "trace_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "upgrade_plans_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "upgrade_plans_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "deployment_targets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "upgrade_plans_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "upgrade_policies" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "upgrade_runs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "upgrade_plan_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" DATETIME,
    "result_json" TEXT NOT NULL DEFAULT '{}',
    "rollback_result_json" TEXT,
    CONSTRAINT "upgrade_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "upgrade_runs_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "deployment_targets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "upgrade_runs_upgrade_plan_id_fkey" FOREIGN KEY ("upgrade_plan_id") REFERENCES "upgrade_plans" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "version_catalog_workspace_id_idx" ON "version_catalog"("workspace_id");

-- CreateIndex
CREATE INDEX "version_catalog_component_idx" ON "version_catalog"("component");

-- CreateIndex
CREATE INDEX "version_catalog_release_channel_idx" ON "version_catalog"("release_channel");

-- CreateIndex
CREATE UNIQUE INDEX "version_catalog_workspace_id_component_version_release_channel_key" ON "version_catalog"("workspace_id", "component", "version", "release_channel");

-- CreateIndex
CREATE INDEX "installed_versions_workspace_id_idx" ON "installed_versions"("workspace_id");

-- CreateIndex
CREATE INDEX "installed_versions_target_id_idx" ON "installed_versions"("target_id");

-- CreateIndex
CREATE INDEX "installed_versions_component_idx" ON "installed_versions"("component");

-- CreateIndex
CREATE INDEX "installed_versions_detected_at_idx" ON "installed_versions"("detected_at");

-- CreateIndex
CREATE UNIQUE INDEX "installed_versions_target_id_component_key" ON "installed_versions"("target_id", "component");

-- CreateIndex
CREATE INDEX "upgrade_policies_workspace_id_idx" ON "upgrade_policies"("workspace_id");

-- CreateIndex
CREATE INDEX "upgrade_policies_enabled_idx" ON "upgrade_policies"("enabled");

-- CreateIndex
CREATE INDEX "maintenance_windows_workspace_id_idx" ON "maintenance_windows"("workspace_id");

-- CreateIndex
CREATE INDEX "maintenance_windows_enabled_idx" ON "maintenance_windows"("enabled");

-- CreateIndex
CREATE INDEX "upgrade_plans_workspace_id_idx" ON "upgrade_plans"("workspace_id");

-- CreateIndex
CREATE INDEX "upgrade_plans_target_id_idx" ON "upgrade_plans"("target_id");

-- CreateIndex
CREATE INDEX "upgrade_plans_policy_id_idx" ON "upgrade_plans"("policy_id");

-- CreateIndex
CREATE INDEX "upgrade_plans_status_idx" ON "upgrade_plans"("status");

-- CreateIndex
CREATE INDEX "upgrade_plans_trace_id_idx" ON "upgrade_plans"("trace_id");

-- CreateIndex
CREATE INDEX "upgrade_runs_workspace_id_idx" ON "upgrade_runs"("workspace_id");

-- CreateIndex
CREATE INDEX "upgrade_runs_target_id_idx" ON "upgrade_runs"("target_id");

-- CreateIndex
CREATE INDEX "upgrade_runs_upgrade_plan_id_idx" ON "upgrade_runs"("upgrade_plan_id");

-- CreateIndex
CREATE INDEX "upgrade_runs_status_idx" ON "upgrade_runs"("status");

-- CreateIndex
CREATE INDEX "upgrade_runs_started_at_idx" ON "upgrade_runs"("started_at");
