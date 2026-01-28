"use server";

import { and, asc, desc, eq, isNotNull, isNull, inArray, lt, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  agentSession,
  agentMessage,
  targetRepository,
  githubInstallation,
  type AgentSession,
  type AgentMessage,
  type TargetRepository,
  type GitHubInstallation,
} from "./schema";

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

// ============================================================================
// Agent Session Queries
// ============================================================================

export async function createAgentSession({
  userId,
  targetRepositoryId,
  title,
  repoPath,
}: {
  userId: string;
  targetRepositoryId?: string;
  title: string;
  repoPath?: string;
}): Promise<AgentSession> {
  const [session] = await db
    .insert(agentSession)
    .values({
      userId,
      targetRepositoryId,
      title,
      status: "idle",
      repoPath,
    })
    .returning();
  return session;
}

export async function getAgentSession({
  id,
}: {
  id: string;
}): Promise<AgentSession | null> {
  const [session] = await db
    .select()
    .from(agentSession)
    .where(eq(agentSession.id, id));
  return session ?? null;
}

export async function getAgentSessionsByUserId({
  userId,
  limit = 20,
}: {
  userId: string;
  limit?: number;
}): Promise<AgentSession[]> {
  return db
    .select()
    .from(agentSession)
    .where(eq(agentSession.userId, userId))
    .orderBy(desc(agentSession.createdAt))
    .limit(limit);
}

export async function updateAgentSessionStatus({
  id,
  status,
  taskPlan,
  branchName,
  repoPath,
  sandboxClaimName,
  sandboxPodName,
  sandboxNamespace,
  sandboxStatus,
}: {
  id: string;
  status?: "idle" | "running" | "completed" | "error";
  taskPlan?: unknown;
  branchName?: string;
  repoPath?: string;
  sandboxClaimName?: string;
  sandboxPodName?: string;
  sandboxNamespace?: string;
  sandboxStatus?: "pending" | "bound" | "ready" | "failed" | "released";
}): Promise<void> {
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };
  if (status !== undefined) updateData.status = status;
  if (taskPlan !== undefined) updateData.taskPlan = taskPlan;
  if (branchName !== undefined) updateData.branchName = branchName;
  if (repoPath !== undefined) updateData.repoPath = repoPath;
  if (sandboxClaimName !== undefined) updateData.sandboxClaimName = sandboxClaimName;
  if (sandboxPodName !== undefined) updateData.sandboxPodName = sandboxPodName;
  if (sandboxNamespace !== undefined) updateData.sandboxNamespace = sandboxNamespace;
  if (sandboxStatus !== undefined) updateData.sandboxStatus = sandboxStatus;

  await db.update(agentSession).set(updateData).where(eq(agentSession.id, id));
}

/**
 * Update sandbox-specific fields for an agent session
 */
export async function updateAgentSessionSandbox({
  id,
  sandboxClaimName,
  sandboxPodName,
  sandboxNamespace,
  sandboxStatus,
}: {
  id: string;
  sandboxClaimName?: string;
  sandboxPodName?: string;
  sandboxNamespace?: string;
  sandboxStatus?: "pending" | "bound" | "ready" | "failed" | "released";
}): Promise<void> {
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };
  if (sandboxClaimName !== undefined) updateData.sandboxClaimName = sandboxClaimName;
  if (sandboxPodName !== undefined) updateData.sandboxPodName = sandboxPodName;
  if (sandboxNamespace !== undefined) updateData.sandboxNamespace = sandboxNamespace;
  if (sandboxStatus !== undefined) updateData.sandboxStatus = sandboxStatus;

  await db.update(agentSession).set(updateData).where(eq(agentSession.id, id));
}

/**
 * Get sessions with active sandboxes (for cleanup)
 */
export async function getSessionsWithActiveSandboxes(): Promise<AgentSession[]> {
  return db
    .select()
    .from(agentSession)
    .where(
      and(
        eq(agentSession.sandboxStatus, "ready"),
        // Only get sessions that haven't been explicitly released
      )
    );
}

// ============================================================================
// Workflow Queries (for Ralph Loop)
// ============================================================================

/**
 * Update workflow status for an agent session
 */
export async function updateAgentSessionWorkflow({
  id,
  workflowId,
  workflowStatus,
}: {
  id: string;
  workflowId?: string;
  workflowStatus?: "none" | "pending" | "running" | "suspended" | "completed" | "failed" | "terminated";
}): Promise<void> {
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };
  if (workflowId !== undefined) updateData.workflowId = workflowId;
  if (workflowStatus !== undefined) updateData.workflowStatus = workflowStatus;

  await db.update(agentSession).set(updateData).where(eq(agentSession.id, id));
}

/**
 * Get session by workflow ID
 */
export async function getAgentSessionByWorkflowId({
  workflowId,
}: {
  workflowId: string;
}): Promise<AgentSession | null> {
  const [session] = await db
    .select()
    .from(agentSession)
    .where(eq(agentSession.workflowId, workflowId));
  return session ?? null;
}

/**
 * Update workflow status cache by workflowId
 * Used by Dapr pub/sub webhook to sync status from workflow events
 */
export async function updateAgentSessionWorkflowStatusByWorkflowId({
  workflowId,
  workflowStatus,
  workflowPhase,
  workflowProgress,
  workflowCurrentTask,
  workflowMessage,
}: {
  workflowId: string;
  workflowStatus?: "none" | "pending" | "running" | "suspended" | "completed" | "failed" | "terminated";
  workflowPhase?: string | null;
  workflowProgress?: number | null;
  workflowCurrentTask?: string | null;
  workflowMessage?: string | null;
}): Promise<void> {
  const updateData: Record<string, unknown> = {
    workflowUpdatedAt: new Date(),
    updatedAt: new Date(),
  };

  if (workflowStatus !== undefined) updateData.workflowStatus = workflowStatus;
  if (workflowPhase !== undefined) updateData.workflowPhase = workflowPhase;
  if (workflowProgress !== undefined) updateData.workflowProgress = workflowProgress;
  if (workflowCurrentTask !== undefined) updateData.workflowCurrentTask = workflowCurrentTask;
  if (workflowMessage !== undefined) updateData.workflowMessage = workflowMessage;

  await db
    .update(agentSession)
    .set(updateData)
    .where(eq(agentSession.workflowId, workflowId));
}

/**
 * Get stale workflows (stuck in running/pending for more than threshold minutes)
 * Used by background reconciliation job
 */
export async function getStaleWorkflows({
  staleThresholdMinutes = 10,
}: {
  staleThresholdMinutes?: number;
} = {}): Promise<AgentSession[]> {
  const threshold = new Date(Date.now() - staleThresholdMinutes * 60 * 1000);

  return db
    .select()
    .from(agentSession)
    .where(
      and(
        isNotNull(agentSession.workflowId),
        inArray(agentSession.workflowStatus, ["running", "pending"]),
        // Check if workflowUpdatedAt is older than threshold, or if it's null (never updated)
        or(
          isNull(agentSession.workflowUpdatedAt),
          lt(agentSession.workflowUpdatedAt, threshold)
        )
      )
    );
}

/**
 * Get sessions with active workflows (for monitoring)
 */
export async function getSessionsWithActiveWorkflows(): Promise<AgentSession[]> {
  return db
    .select()
    .from(agentSession)
    .where(
      and(
        eq(agentSession.workflowStatus, "running"),
      )
    );
}

/**
 * Get agent sessions that have associated workflows (for workflow dashboard).
 * Returns sessions with non-null workflowId, optionally filtered by status.
 * Used by /api/workflows to include planner-agent workflows in the listing.
 */
export async function getAgentSessionsWithWorkflows({
  limit = 50,
  offset = 0,
  status,
}: {
  limit?: number;
  offset?: number;
  status?: string | string[];
}): Promise<AgentSession[]> {
  // Build conditions - workflowId must be non-null
  const conditions = [isNotNull(agentSession.workflowId)];

  // Add status filter if provided
  if (status) {
    const statusArray = Array.isArray(status) ? status : [status];
    // Map UI status values to DB status values
    const mappedStatuses = statusArray.map((s) => {
      const mapping: Record<string, string> = {
        RUNNING: "running",
        COMPLETED: "completed",
        FAILED: "failed",
        SUSPENDED: "suspended",
        TERMINATED: "terminated",
        PENDING: "pending",
      };
      return mapping[s.toUpperCase()] || s.toLowerCase();
    });
    conditions.push(
      inArray(agentSession.workflowStatus, mappedStatuses as ("none" | "pending" | "running" | "suspended" | "completed" | "failed" | "terminated")[])
    );
  }

  return db
    .select()
    .from(agentSession)
    .where(and(...conditions))
    .orderBy(desc(agentSession.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Count agent sessions with workflows (for pagination)
 */
export async function countAgentSessionsWithWorkflows({
  status,
}: {
  status?: string | string[];
} = {}): Promise<number> {
  const conditions = [isNotNull(agentSession.workflowId)];

  if (status) {
    const statusArray = Array.isArray(status) ? status : [status];
    const mappedStatuses = statusArray.map((s) => {
      const mapping: Record<string, string> = {
        RUNNING: "running",
        COMPLETED: "completed",
        FAILED: "failed",
        SUSPENDED: "suspended",
        TERMINATED: "terminated",
        PENDING: "pending",
      };
      return mapping[s.toUpperCase()] || s.toLowerCase();
    });
    conditions.push(
      inArray(agentSession.workflowStatus, mappedStatuses as ("none" | "pending" | "running" | "suspended" | "completed" | "failed" | "terminated")[])
    );
  }

  const result = await db
    .select()
    .from(agentSession)
    .where(and(...conditions));

  return result.length;
}

export async function updateAgentSessionTitle({
  id,
  title,
}: {
  id: string;
  title: string;
}): Promise<void> {
  await db
    .update(agentSession)
    .set({ title, updatedAt: new Date() })
    .where(eq(agentSession.id, id));
}

export async function deleteAgentSession({ id }: { id: string }): Promise<void> {
  // Delete messages first (foreign key constraint)
  await db.delete(agentMessage).where(eq(agentMessage.sessionId, id));
  await db.delete(agentSession).where(eq(agentSession.id, id));
}

// ============================================================================
// Agent Message Queries
// ============================================================================

export async function saveAgentMessages({
  sessionId,
  messages,
}: {
  sessionId: string;
  messages: Array<{
    id?: string;
    role: string;
    parts: unknown;
  }>;
}): Promise<void> {
  if (messages.length === 0) return;

  await db.insert(agentMessage).values(
    messages.map((m) => ({
      id: m.id,
      sessionId,
      role: m.role,
      parts: m.parts,
    }))
  );
}

export async function getAgentMessages({
  sessionId,
}: {
  sessionId: string;
}): Promise<AgentMessage[]> {
  return db
    .select()
    .from(agentMessage)
    .where(eq(agentMessage.sessionId, sessionId))
    .orderBy(asc(agentMessage.createdAt));
}

export async function updateAgentMessage({
  id,
  parts,
}: {
  id: string;
  parts: unknown;
}): Promise<void> {
  await db.update(agentMessage).set({ parts }).where(eq(agentMessage.id, id));
}

// ============================================================================
// Target Repository Queries
// ============================================================================

export async function createOrGetTargetRepository({
  owner,
  repo,
  branch,
  installationId,
}: {
  owner: string;
  repo: string;
  branch: string;
  installationId?: string;
}): Promise<TargetRepository> {
  // Check if repository already exists
  const [existing] = await db
    .select()
    .from(targetRepository)
    .where(
      and(
        eq(targetRepository.owner, owner),
        eq(targetRepository.repo, repo),
        eq(targetRepository.branch, branch)
      )
    );

  if (existing) {
    return existing;
  }

  // Create new repository entry
  const [newRepo] = await db
    .insert(targetRepository)
    .values({
      owner,
      repo,
      branch,
      installationId,
    })
    .returning();

  return newRepo;
}

export async function getTargetRepository({
  id,
}: {
  id: string;
}): Promise<TargetRepository | null> {
  const [repo] = await db
    .select()
    .from(targetRepository)
    .where(eq(targetRepository.id, id));
  return repo ?? null;
}

// ============================================================================
// GitHub Installation Queries
// ============================================================================

export async function saveGitHubInstallation({
  id,
  userId,
  accountLogin,
  accountType,
}: {
  id: string;
  userId: string;
  accountLogin: string;
  accountType: "User" | "Organization";
}): Promise<void> {
  await db
    .insert(githubInstallation)
    .values({ id, userId, accountLogin, accountType })
    .onConflictDoUpdate({
      target: githubInstallation.id,
      set: { accountLogin, accountType },
    });
}

export async function getGitHubInstallations({
  userId,
}: {
  userId: string;
}): Promise<GitHubInstallation[]> {
  return db
    .select()
    .from(githubInstallation)
    .where(eq(githubInstallation.userId, userId));
}

export async function deleteGitHubInstallation({
  id,
}: {
  id: string;
}): Promise<void> {
  await db.delete(githubInstallation).where(eq(githubInstallation.id, id));
}
