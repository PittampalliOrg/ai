-- Migration: Workflow Status Cache
-- Description: Adds columns to AgentSession for caching workflow status from Dapr pub/sub events
-- This enables the workflow list to show real-time status without polling planner-agent

ALTER TABLE "AgentSession" ADD COLUMN "workflowPhase" varchar(50);
ALTER TABLE "AgentSession" ADD COLUMN "workflowProgress" integer;
ALTER TABLE "AgentSession" ADD COLUMN "workflowCurrentTask" text;
ALTER TABLE "AgentSession" ADD COLUMN "workflowMessage" text;
ALTER TABLE "AgentSession" ADD COLUMN "workflowUpdatedAt" timestamp;

-- Index for querying by workflow phase (useful for filtering)
CREATE INDEX "idx_agentSession_workflowPhase" ON "AgentSession" ("workflowPhase");
