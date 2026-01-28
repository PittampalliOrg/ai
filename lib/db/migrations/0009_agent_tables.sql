-- Agent Tables Migration
-- Creates tables for async coding agent functionality

-- Target repository for agent sessions
CREATE TABLE IF NOT EXISTS "TargetRepository" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner" varchar(256) NOT NULL,
  "repo" varchar(256) NOT NULL,
  "branch" varchar(256) NOT NULL,
  "installationId" text,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

-- Agent session state (extends Chat concept for coding agent)
CREATE TABLE IF NOT EXISTS "AgentSession" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "User"("id"),
  "targetRepositoryId" uuid REFERENCES "TargetRepository"("id"),
  "title" text NOT NULL,
  "status" varchar(20) DEFAULT 'idle',
  "taskPlan" json,
  "branchName" varchar(256),
  "repoPath" varchar(1024),
  "sandboxClaimName" varchar(256),
  "sandboxPodName" varchar(256),
  "sandboxNamespace" varchar(64) DEFAULT 'agent-sandbox',
  "sandboxStatus" varchar(20),
  "workflowId" varchar(256),
  "workflowStatus" varchar(20) DEFAULT 'none',
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

-- Agent messages (uses same structure as Message_v2)
CREATE TABLE IF NOT EXISTS "AgentMessage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "sessionId" uuid NOT NULL REFERENCES "AgentSession"("id"),
  "role" varchar(32) NOT NULL,
  "parts" json NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

-- GitHub installations for multi-org support
CREATE TABLE IF NOT EXISTS "GitHubInstallation" (
  "id" text PRIMARY KEY,
  "userId" uuid NOT NULL REFERENCES "User"("id"),
  "accountLogin" varchar(256) NOT NULL,
  "accountType" varchar(20) NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
