/*
  Warnings:

  - You are about to drop the `config_editor_history` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "config_editor_history";
PRAGMA foreign_keys=on;
