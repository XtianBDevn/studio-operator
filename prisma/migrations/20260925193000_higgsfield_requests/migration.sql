-- Provider request handles, cost reconciliation, and connection tests.
-- Existing generation rows keep working: every new column is nullable.
ALTER TABLE "Generation" ADD COLUMN "providerStatus" TEXT;
ALTER TABLE "Generation" ADD COLUMN "statusUrl" TEXT;
ALTER TABLE "Generation" ADD COLUMN "cancelUrl" TEXT;
ALTER TABLE "Generation" ADD COLUMN "correlationId" TEXT;
ALTER TABLE "Generation" ADD COLUMN "settingsJson" TEXT;
ALTER TABLE "Generation" ADD COLUMN "assetKind" TEXT;
ALTER TABLE "Generation" ADD COLUMN "localPath" TEXT;
ALTER TABLE "Generation" ADD COLUMN "providerOutputUrl" TEXT;
ALTER TABLE "Generation" ADD COLUMN "estimatedCredits" TEXT;
ALTER TABLE "Generation" ADD COLUMN "estimatedUsd" TEXT;
ALTER TABLE "Generation" ADD COLUMN "actualCredits" TEXT;
ALTER TABLE "Generation" ADD COLUMN "actualUsd" TEXT;
ALTER TABLE "Generation" ADD COLUMN "costSource" TEXT;
ALTER TABLE "Generation" ADD COLUMN "retryOfId" TEXT;

CREATE INDEX "Generation_providerRequestId_idx" ON "Generation"("providerRequestId");
CREATE INDEX "Generation_retryOfId_idx" ON "Generation"("retryOfId");

CREATE TABLE "ConnectionTest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "endpointId" TEXT NOT NULL,
    "confirmed" INTEGER NOT NULL,
    "providerRequestId" TEXT,
    "statusUrl" TEXT,
    "cancelUrl" TEXT,
    "correlationId" TEXT,
    "providerStatus" TEXT,
    "appStatus" TEXT NOT NULL,
    "estimatedCredits" TEXT,
    "estimatedUsd" TEXT,
    "costEstimateCents" INTEGER,
    "actualCostCents" INTEGER,
    "actualCredits" TEXT,
    "actualUsd" TEXT,
    "costSource" TEXT,
    "outputUrl" TEXT,
    "localPath" TEXT,
    "settingsJson" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "ConnectionTest_createdAt_idx" ON "ConnectionTest"("createdAt");
