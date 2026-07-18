-- CreateTable
CREATE TABLE "openclaw_detections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspace_id" TEXT NOT NULL,
    "detected" BOOLEAN NOT NULL,
    "detection_method" TEXT NOT NULL,
    "details_json" TEXT NOT NULL,
    "detected_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "openclaw_detections_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "openclaw_detections_workspace_id_idx" ON "openclaw_detections"("workspace_id");

-- CreateIndex
CREATE INDEX "openclaw_detections_detected_at_idx" ON "openclaw_detections"("detected_at");
