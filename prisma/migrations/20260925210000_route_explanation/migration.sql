-- Route explanation for the model router.
-- Existing plans keep working: every new column is nullable.
ALTER TABLE "WorkflowStep" ADD COLUMN "routeStage" TEXT;
ALTER TABLE "WorkflowStep" ADD COLUMN "routeRole" TEXT;
ALTER TABLE "WorkflowStep" ADD COLUMN "whyFit" TEXT;
ALTER TABLE "WorkflowStep" ADD COLUMN "failureMode" TEXT;
ALTER TABLE "WorkflowStep" ADD COLUMN "alternativeModel" TEXT;
ALTER TABLE "WorkflowStep" ADD COLUMN "docsUrl" TEXT;
ALTER TABLE "WorkflowStep" ADD COLUMN "substituteNote" TEXT;
