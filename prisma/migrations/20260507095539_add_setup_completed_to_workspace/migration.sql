-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_workspaces" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "env_type" TEXT NOT NULL DEFAULT 'DEV',
    "is_read_only_default" BOOLEAN NOT NULL DEFAULT false,
    "unlock_until" DATETIME,
    "setup_completed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_workspaces" ("created_at", "description", "env_type", "id", "is_read_only_default", "name", "unlock_until", "updated_at") SELECT "created_at", "description", "env_type", "id", "is_read_only_default", "name", "unlock_until", "updated_at" FROM "workspaces";
DROP TABLE "workspaces";
ALTER TABLE "new_workspaces" RENAME TO "workspaces";
CREATE UNIQUE INDEX "workspaces_name_key" ON "workspaces"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
