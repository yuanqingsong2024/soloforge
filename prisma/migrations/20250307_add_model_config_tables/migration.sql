-- CreateTable
CREATE TABLE "model_test_results" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "latency_ms" INTEGER,
    "error_message" TEXT,
    "test_payload" TEXT NOT NULL,
    "response" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "model_test_results_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "model_catalog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT 1,
    "is_primary" BOOLEAN NOT NULL DEFAULT 0,
    "fallback_order" INTEGER,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "model_catalog_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "config_drafts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "draft_type" TEXT NOT NULL,
    "content_json" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "config_drafts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "diagnostic_reports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "report_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "findings" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "diagnostic_reports_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "model_test_results_workspace_id_idx" ON "model_test_results"("workspace_id");

-- CreateIndex
CREATE INDEX "model_test_results_provider_idx" ON "model_test_results"("provider");

-- CreateIndex
CREATE INDEX "model_test_results_status_idx" ON "model_test_results"("status");

-- CreateIndex
CREATE INDEX "model_test_results_created_at_idx" ON "model_test_results"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "model_catalog_workspace_id_provider_model_name_key" ON "model_catalog"("workspace_id", "provider", "model_name");

-- CreateIndex
CREATE INDEX "model_catalog_workspace_id_idx" ON "model_catalog"("workspace_id");

-- CreateIndex
CREATE INDEX "model_catalog_enabled_idx" ON "model_catalog"("enabled");

-- CreateIndex
CREATE INDEX "config_drafts_workspace_id_idx" ON "config_drafts"("workspace_id");

-- CreateIndex
CREATE INDEX "config_drafts_draft_type_idx" ON "config_drafts"("draft_type");

-- CreateIndex
CREATE INDEX "config_drafts_updated_at_idx" ON "config_drafts"("updated_at");

-- CreateIndex
CREATE INDEX "diagnostic_reports_workspace_id_idx" ON "diagnostic_reports"("workspace_id");

-- CreateIndex
CREATE INDEX "diagnostic_reports_report_type_idx" ON "diagnostic_reports"("report_type");

-- CreateIndex
CREATE INDEX "diagnostic_reports_severity_idx" ON "diagnostic_reports"("severity");

-- CreateIndex
CREATE INDEX "diagnostic_reports_created_at_idx" ON "diagnostic_reports"("created_at");
