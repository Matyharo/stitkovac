-- AlterTable
ALTER TABLE "PrintJob" ADD COLUMN "snapshot" TEXT;

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoginThrottle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attempts" INTEGER NOT NULL,
    "until" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FeedConfig" (
    "lockId" TEXT,
    "lockExpiresAt" DATETIME,
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL DEFAULT '',
    "autoApplySafe" BOOLEAN NOT NULL DEFAULT true,
    "priceThresholdPercent" REAL NOT NULL DEFAULT 30.0,
    "checkEanValidity" BOOLEAN NOT NULL DEFAULT true,
    "cronSecret" TEXT NOT NULL DEFAULT '',
    "lastSyncAt" DATETIME,
    "syncStatus" TEXT,
    "syncMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_FeedConfig" ("autoApplySafe", "checkEanValidity", "createdAt", "cronSecret", "id", "lastSyncAt", "priceThresholdPercent", "syncMessage", "syncStatus", "updatedAt", "url") SELECT "autoApplySafe", "checkEanValidity", "createdAt", "cronSecret", "id", "lastSyncAt", "priceThresholdPercent", "syncMessage", "syncStatus", "updatedAt", "url" FROM "FeedConfig";
DROP TABLE "FeedConfig";
ALTER TABLE "new_FeedConfig" RENAME TO "FeedConfig";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");

-- CreateIndex
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

