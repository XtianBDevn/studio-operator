-- Supervised client agent. Jobs from earlier prompts are unchanged.
CREATE TABLE "AutonomySettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "maxAutoSpendPerJobCents" INTEGER NOT NULL,
    "maxAutoSpendPerRepairCents" INTEGER NOT NULL,
    "maxAttemptsJson" TEXT NOT NULL,
    "allowedFamiliesJson" TEXT NOT NULL,
    "autoSendJson" TEXT NOT NULL,
    "shareConceptsAutomatically" INTEGER NOT NULL,
    "finalDeliveryRequiresApproval" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "ClientAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "ClientAccount_name_idx" ON "ClientAccount"("name");

CREATE TABLE "ClientMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "logosJson" TEXT NOT NULL DEFAULT '[]',
    "colorsJson" TEXT NOT NULL DEFAULT '[]',
    "fontsJson" TEXT NOT NULL DEFAULT '[]',
    "tone" TEXT NOT NULL DEFAULT '',
    "productDetails" TEXT NOT NULL DEFAULT '',
    "winningAssetsJson" TEXT NOT NULL DEFAULT '[]',
    "rejectedStylesJson" TEXT NOT NULL DEFAULT '[]',
    "deliveryPreferences" TEXT NOT NULL DEFAULT '',
    "communicationPreferences" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClientMemory_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ClientAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ClientMemory_accountId_key" ON "ClientMemory"("accountId");

CREATE TABLE "LikenessConsent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "personLabel" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "useScope" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LikenessConsent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ClientAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "LikenessConsent_accountId_idx" ON "LikenessConsent"("accountId");

CREATE TABLE "ClientJobLink" (
    "jobId" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClientJobLink_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ClientAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ClientJobLink_accountId_idx" ON "ClientJobLink"("accountId");

CREATE TABLE "ClientMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "disposition" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "ClientMessage_jobId_idx" ON "ClientMessage"("jobId");
CREATE INDEX "ClientMessage_disposition_idx" ON "ClientMessage"("disposition");

CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "AuditEvent_jobId_idx" ON "AuditEvent"("jobId");
CREATE INDEX "AuditEvent_kind_idx" ON "AuditEvent"("kind");
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

CREATE TABLE "SuperviseCursor" (
    "jobId" TEXT NOT NULL PRIMARY KEY,
    "beat" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
