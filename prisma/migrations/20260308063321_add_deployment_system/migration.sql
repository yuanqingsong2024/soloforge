/*
  Warnings:

  - You are about to drop the column `draft_type` on the `config_drafts` table. All the data in the column will be lost.
  - Added the required column `category` to the `config_drafts` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN "change_request_id" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "diff_id" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "snapshot_id" TEXT;

-- CreateTable
CREATE TABLE "workspace_snapshots" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "content_json" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workspace_snapshots_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "snapshot_diffs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "desired_snapshot_id" TEXT NOT NULL,
    "actual_snapshot_id" TEXT NOT NULL,
    "diff_json" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "snapshot_diffs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "snapshot_diffs_desired_snapshot_id_fkey" FOREIGN KEY ("desired_snapshot_id") REFERENCES "workspace_snapshots" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "snapshot_diffs_actual_snapshot_id_fkey" FOREIGN KEY ("actual_snapshot_id") REFERENCES "workspace_snapshots" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "change_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "diff_json" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "approval_id" TEXT,
    "job_id" TEXT,
    "trace_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "change_requests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "config_editor_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "draft_id" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "action_payload" TEXT NOT NULL,
    "seq_no" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "deployment_targets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "name" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "connection_mode" TEXT NOT NULL,
    "host" TEXT,
    "port" INTEGER,
    "ssh_user" TEXT,
    "ssh_port" INTEGER,
    "gateway_url" TEXT,
    "docker_enabled" BOOLEAN NOT NULL DEFAULT false,
    "tailscale_enabled" BOOLEAN NOT NULL DEFAULT false,
    "env_type" TEXT NOT NULL DEFAULT 'DEV',
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "last_check_at" DATETIME,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "deployment_targets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "deployment_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "target_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "trace_id" TEXT NOT NULL,
    "request_json" TEXT NOT NULL,
    "result_json" TEXT,
    "logs" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" DATETIME,
    "last_error" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "deployment_jobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "deployment_jobs_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "deployment_targets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_config_drafts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "content_json" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "config_drafts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_config_drafts" ("content_hash", "content_json", "created_at", "created_by", "id", "updated_at", "version", "workspace_id") SELECT "content_hash", "content_json", "created_at", "created_by", "id", "updated_at", "version", "workspace_id" FROM "config_drafts";
DROP TABLE "config_drafts";
ALTER TABLE "new_config_drafts" RENAME TO "config_drafts";
CREATE INDEX "config_drafts_workspace_id_idx" ON "config_drafts"("workspace_id");
CREATE INDEX "config_drafts_category_idx" ON "config_drafts"("category");
CREATE INDEX "config_drafts_updated_at_idx" ON "config_drafts"("updated_at");
CREATE TABLE "new_workspaces" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "env_type" TEXT NOT NULL DEFAULT 'DEV',
    "is_read_only_default" BOOLEAN NOT NULL DEFAULT false,
    "unlock_until" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_workspaces" ("created_at", "description", "id", "name", "updated_at") SELECT "created_at", "description", "id", "name", "updated_at" FROM "workspaces";
DROP TABLE "workspaces";
ALTER TABLE "new_workspaces" RENAME TO "workspaces";
CREATE UNIQUE INDEX "workspaces_name_key" ON "workspaces"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "workspace_snapshots_workspace_id_idx" ON "workspace_snapshots"("workspace_id");

-- CreateIndex
CREATE INDEX "workspace_snapshots_kind_idx" ON "workspace_snapshots"("kind");

-- CreateIndex
CREATE INDEX "workspace_snapshots_created_at_idx" ON "workspace_snapshots"("created_at");

-- CreateIndex
CREATE INDEX "snapshot_diffs_workspace_id_idx" ON "snapshot_diffs"("workspace_id");

-- CreateIndex
CREATE INDEX "snapshot_diffs_severity_idx" ON "snapshot_diffs"("severity");

-- CreateIndex
CREATE INDEX "snapshot_diffs_created_at_idx" ON "snapshot_diffs"("created_at");

-- CreateIndex
CREATE INDEX "change_requests_workspace_id_idx" ON "change_requests"("workspace_id");

-- CreateIndex
CREATE INDEX "change_requests_status_idx" ON "change_requests"("status");

-- CreateIndex
CREATE INDEX "change_requests_type_idx" ON "change_requests"("type");

-- CreateIndex
CREATE INDEX "change_requests_trace_id_idx" ON "change_requests"("trace_id");

-- CreateIndex
CREATE INDEX "config_editor_history_workspace_id_idx" ON "config_editor_history"("workspace_id");

-- CreateIndex
CREATE INDEX "config_editor_history_draft_id_idx" ON "config_editor_history"("draft_id");

-- CreateIndex
CREATE INDEX "config_editor_history_seq_no_idx" ON "config_editor_history"("seq_no");

-- CreateIndex
CREATE INDEX "deployment_targets_workspace_id_idx" ON "deployment_targets"("workspace_id");

-- CreateIndex
CREATE INDEX "deployment_targets_status_idx" ON "deployment_targets"("status");

-- CreateIndex
CREATE INDEX "deployment_targets_env_type_idx" ON "deployment_targets"("env_type");

-- CreateIndex
CREATE INDEX "deployment_jobs_workspace_id_idx" ON "deployment_jobs"("workspace_id");

-- CreateIndex
CREATE INDEX "deployment_jobs_target_id_idx" ON "deployment_jobs"("target_id");

-- CreateIndex
CREATE INDEX "deployment_jobs_trace_id_idx" ON "deployment_jobs"("trace_id");

-- CreateIndex
CREATE INDEX "deployment_jobs_status_idx" ON "deployment_jobs"("status");

-- CreateIndex
CREATE INDEX "deployment_jobs_type_idx" ON "deployment_jobs"("type");

-- CreateIndex
CREATE INDEX "audit_logs_change_request_id_idx" ON "audit_logs"("change_request_id");
