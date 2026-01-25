"use server";

import { and, asc, desc, eq } from "drizzle-orm";
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
