-- CreateTable
CREATE TABLE "plugins" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "description" TEXT,
    "author" TEXT,
    "homepage" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "config_json" TEXT NOT NULL DEFAULT '{}',
    "manifest_json" TEXT NOT NULL DEFAULT '{}',
    "entry_point" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "plugin_instances" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plugin_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config_json" TEXT NOT NULL DEFAULT '{}',
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "plugin_instances_plugin_id_fkey" FOREIGN KEY ("plugin_id") REFERENCES "plugins" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "plugins_name_key" ON "plugins"("name");

-- CreateIndex
CREATE INDEX "plugins_enabled_idx" ON "plugins"("enabled");

-- CreateIndex
CREATE INDEX "plugin_instances_enabled_idx" ON "plugin_instances"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "plugin_instances_plugin_id_name_key" ON "plugin_instances"("plugin_id", "name");
