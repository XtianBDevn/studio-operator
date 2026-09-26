-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "rawBrief" TEXT NOT NULL,
    "budgetCents" INTEGER NOT NULL,
    "deadline" DATETIME,
    "status" TEXT NOT NULL,
    "clientNotes" TEXT NOT NULL DEFAULT '',
    "channelFeeBps" INTEGER NOT NULL DEFAULT 0,
    "contingencyBps" INTEGER NOT NULL DEFAULT 1500,
    "maxBudgetCents" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ReferenceAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReferenceAsset_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BriefAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "deliverables" TEXT NOT NULL,
    "dimensions" TEXT NOT NULL,
    "durations" TEXT NOT NULL,
    "referenceNotes" TEXT NOT NULL,
    "exactText" TEXT NOT NULL,
    "brandConstraints" TEXT NOT NULL,
    "rightsConcerns" TEXT NOT NULL,
    "missingInformation" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "decision" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "modelLabel" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BriefAnalysis_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkflowStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "selectedModel" TEXT NOT NULL,
    "modelKind" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "inputs" TEXT NOT NULL,
    "expectedOutputs" TEXT NOT NULL,
    "estimatedAttempts" INTEGER NOT NULL,
    "unitCostCents" INTEGER NOT NULL,
    "estimatedTotalCents" INTEGER NOT NULL,
    "approvalStatus" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkflowStep_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Generation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "stepId" TEXT,
    "providerRequestId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "costEstimateCents" INTEGER NOT NULL,
    "actualCostCents" INTEGER,
    "outputUrl" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    CONSTRAINT "Generation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Generation_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "WorkflowStep" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Revision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "clientNote" TEXT NOT NULL,
    "affectedDeliverable" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "expectedIncrementalCents" INTEGER NOT NULL,
    "approvalStatus" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Revision_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApprovalGate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "resolvedAt" DATETIME,
    CONSTRAINT "ApprovalGate_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE INDEX "Job_source_idx" ON "Job"("source");

-- CreateIndex
CREATE INDEX "Job_createdAt_idx" ON "Job"("createdAt");

-- CreateIndex
CREATE INDEX "ReferenceAsset_jobId_idx" ON "ReferenceAsset"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "BriefAnalysis_jobId_key" ON "BriefAnalysis"("jobId");

-- CreateIndex
CREATE INDEX "WorkflowStep_jobId_idx" ON "WorkflowStep"("jobId");

-- CreateIndex
CREATE INDEX "WorkflowStep_approvalStatus_idx" ON "WorkflowStep"("approvalStatus");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStep_jobId_position_key" ON "WorkflowStep"("jobId", "position");

-- CreateIndex
CREATE INDEX "Generation_jobId_idx" ON "Generation"("jobId");

-- CreateIndex
CREATE INDEX "Generation_stepId_idx" ON "Generation"("stepId");

-- CreateIndex
CREATE INDEX "Generation_status_idx" ON "Generation"("status");

-- CreateIndex
CREATE INDEX "Revision_jobId_idx" ON "Revision"("jobId");

-- CreateIndex
CREATE INDEX "Revision_approvalStatus_idx" ON "Revision"("approvalStatus");

-- CreateIndex
CREATE INDEX "ApprovalGate_jobId_idx" ON "ApprovalGate"("jobId");

-- CreateIndex
CREATE INDEX "ApprovalGate_kind_idx" ON "ApprovalGate"("kind");

-- CreateIndex
CREATE INDEX "ApprovalGate_status_idx" ON "ApprovalGate"("status");
