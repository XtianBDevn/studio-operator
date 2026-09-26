-- Brief analysis is now an original document plus an optional human edit.
-- Older column-shaped rows cannot be converted, so they are dropped.
-- Reset the demo with `npm run db:reset` to restore the seeded jobs.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BriefAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "originalJson" TEXT NOT NULL,
    "editedJson" TEXT,
    "decision" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "modelLabel" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BriefAnalysis_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
DROP TABLE "BriefAnalysis";
ALTER TABLE "new_BriefAnalysis" RENAME TO "BriefAnalysis";
CREATE UNIQUE INDEX "BriefAnalysis_jobId_key" ON "BriefAnalysis"("jobId");
CREATE INDEX "BriefAnalysis_decision_idx" ON "BriefAnalysis"("decision");
CREATE INDEX "BriefAnalysis_provider_idx" ON "BriefAnalysis"("provider");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
