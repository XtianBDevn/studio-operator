-- QA reports and client delivery notes. Existing jobs are unchanged.
CREATE TABLE "QaReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "checklistJson" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "repairModelId" TEXT,
    "repairModelLabel" TEXT,
    "incrementalCents" INTEGER NOT NULL DEFAULT 0,
    "newTotalCents" INTEGER NOT NULL,
    "updatedMarginCents" INTEGER NOT NULL,
    "withinLimits" INTEGER NOT NULL,
    "autoRepaired" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QaReport_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "QaReport_jobId_idx" ON "QaReport"("jobId");
CREATE INDEX "QaReport_verdict_idx" ON "QaReport"("verdict");

CREATE TABLE "DeliveryNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "modelLabel" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeliveryNote_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DeliveryNote_jobId_key" ON "DeliveryNote"("jobId");
