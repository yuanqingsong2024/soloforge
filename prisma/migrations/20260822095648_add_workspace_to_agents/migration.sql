-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_agents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    "role_id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "runtime" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "agents_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "agents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_agents" ("created_at", "enabled", "id", "model", "name", "role_id", "runtime", "updated_at") SELECT "created_at", "enabled", "id", "model", "name", "role_id", "runtime", "updated_at" FROM "agents";
DROP TABLE "agents";
ALTER TABLE "new_agents" RENAME TO "agents";
CREATE INDEX "agents_workspace_id_idx" ON "agents"("workspace_id");
CREATE UNIQUE INDEX "agents_workspace_id_name_key" ON "agents"("workspace_id", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
