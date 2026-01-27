/**
 * Sequential Workflow - Planner Agent
 *
 * GitHub Repository + Planner Agent Workflow that:
 * 1. Validates the repository exists and is accessible
 * 2. Clones the repository via planner-agent
 * 3. Creates an implementation plan via planner-agent
 * 4. Waits for user approval
 * 5. Executes the approved plan (if approved)
 *
 * Dapr Features Used:
 * - setCustomStatus(): Real-time progress tracking
 * - waitForExternalEvent(): Wait for plan approval
 * - isReplaying(): Conditional logging during replay
 * - Long-running activities: 30-minute timeout for execution
 */

import { type WorkflowContext, type TWorkflow } from "@dapr/dapr";
import type {
  SequentialInput,
  SequentialOutput,
  SequentialPlan,
} from "../types";

// Activity function references (resolved at runtime by name)
const validateRepositoryActivity = "validateRepositoryActivity";
const cloneRepositoryActivity = "cloneRepositoryActivity";
const createPlanActivity = "createPlanActivity";
const updatePlanStatusActivity = "updatePlanStatusActivity";
const executePlanActivity = "executePlanActivity";

/**
 * Sequential Workflow - Planner Agent
 *
 * This workflow orchestrates repository analysis, planning, and execution:
 * - Validates GitHub repository accessibility
 * - Clones repository via planner-agent service
 * - Generates implementation plan using Claude SDK
 * - Waits for user approval via Dapr external event
 * - Executes the approved plan with Write/Edit/Bash tools
 */
export const sequentialWorkflow: TWorkflow = async function* (
  ctx: WorkflowContext,
  input: SequentialInput
): AsyncGenerator<unknown, SequentialOutput, unknown> {
  const { repository, prompt } = input;

  // Only log on first execution, not during replay
  if (!ctx.isReplaying()) {
    console.log(`[Sequential Workflow] Starting planner agent workflow`);
    console.log(`[Sequential Workflow] Repository: ${repository.owner}/${repository.repo}`);
  }

  // ========================================================================
  // Step 1: Validate Repository
  // ========================================================================

  ctx.setCustomStatus("Validating repository...");

  const validation = (yield ctx.callActivity(validateRepositoryActivity, {
    owner: repository.owner,
    repo: repository.repo,
    branch: repository.branch || "main",
    token: repository.token,
  })) as { valid: boolean; error?: string };

  if (!validation.valid) {
    if (!ctx.isReplaying()) {
      console.log(`[Sequential Workflow] Repository validation failed: ${validation.error}`);
    }
    ctx.setCustomStatus(`Failed: Repository validation - ${validation.error}`);
    return {
      repository: {
        owner: repository.owner,
        repo: repository.repo,
        branch: repository.branch || "main",
        clonePath: "",
      },
      plan: null,
      status: "failed",
      error: validation.error,
    };
  }

  if (!ctx.isReplaying()) {
    console.log(`[Sequential Workflow] Repository validated successfully`);
  }

  // ========================================================================
  // Step 2: Clone Repository via planner-agent
  // ========================================================================

  ctx.setCustomStatus(`Cloning ${repository.owner}/${repository.repo}...`);

  const cloneResult = (yield ctx.callActivity(cloneRepositoryActivity, {
    repository: {
      owner: repository.owner,
      repo: repository.repo,
      branch: repository.branch || "main",
      token: repository.token,
    },
    prompt: prompt,
  })) as { success: boolean; path: string; fileCount?: number; error?: string };

  if (!cloneResult.success) {
    if (!ctx.isReplaying()) {
      console.log(`[Sequential Workflow] Clone failed: ${cloneResult.error}`);
    }
    ctx.setCustomStatus(`Failed: Clone - ${cloneResult.error}`);
    return {
      repository: {
        owner: repository.owner,
        repo: repository.repo,
        branch: repository.branch || "main",
        clonePath: "",
      },
      plan: null,
      status: "failed",
      error: cloneResult.error,
    };
  }

  if (!ctx.isReplaying()) {
    console.log(`[Sequential Workflow] Repository cloned to ${cloneResult.path}`);
  }

  // ========================================================================
  // Step 3: Create Plan via planner-agent
  // ========================================================================

  ctx.setCustomStatus("Creating implementation plan...");

  const planResult = (yield ctx.callActivity(createPlanActivity, {
    repoPath: cloneResult.path,
    prompt,
    workflowId: input.sessionId || ctx.getWorkflowInstanceId(), // Prefer session ID for streaming events
  })) as { plan: SequentialPlan | null; error?: string };

  if (!planResult.plan) {
    if (!ctx.isReplaying()) {
      console.log(`[Sequential Workflow] Plan creation failed: ${planResult.error}`);
    }
    ctx.setCustomStatus(`Failed: Plan creation - ${planResult.error}`);
    return {
      repository: {
        owner: repository.owner,
        repo: repository.repo,
        branch: repository.branch || "main",
        clonePath: cloneResult.path,
      },
      plan: null,
      status: "failed",
      error: planResult.error,
    };
  }

  if (!ctx.isReplaying()) {
    console.log(`[Sequential Workflow] Plan created: ${planResult.plan.title}`);
    console.log(`[Sequential Workflow] Plan has ${planResult.plan.steps.length} steps`);
  }

  // ========================================================================
  // Step 4: Wait for User Approval
  // ========================================================================

  ctx.setCustomStatus("Waiting for plan approval...");

  if (!ctx.isReplaying()) {
    console.log(`[Sequential Workflow] Waiting for plan_approval event`);
  }

  const approval = (yield ctx.waitForExternalEvent("plan_approval")) as {
    approved: boolean;
    comments?: string;
  };

  if (!ctx.isReplaying()) {
    console.log(`[Sequential Workflow] Approval received: ${approval.approved ? "approved" : "rejected"}`);
  }

  // If not approved, return early with rejected status
  if (!approval.approved) {
    const rejectedPlan: SequentialPlan = {
      ...planResult.plan,
      status: "rejected",
    };

    ctx.setCustomStatus("Plan rejected");

    return {
      repository: {
        owner: repository.owner,
        repo: repository.repo,
        branch: repository.branch || "main",
        clonePath: cloneResult.path,
      },
      plan: rejectedPlan,
      status: "failed",
      error: `Plan rejected${approval.comments ? `: ${approval.comments}` : ""}`,
    };
  }

  // ========================================================================
  // Step 5: Persist Approval Status to planner-agent
  // ========================================================================

  ctx.setCustomStatus("Persisting approval status...");

  if (!ctx.isReplaying()) {
    console.log(`[Sequential Workflow] Persisting approval status for plan ${planResult.plan.id}`);
  }

  const statusUpdate = (yield ctx.callActivity(updatePlanStatusActivity, {
    planId: planResult.plan.id,
    status: "approved",
    reviewer: (approval as { reviewer?: string }).reviewer,
    comments: approval.comments,
  })) as { success: boolean; planId: string; status: string; error?: string };

  if (!statusUpdate.success) {
    if (!ctx.isReplaying()) {
      console.log(`[Sequential Workflow] Failed to persist approval status: ${statusUpdate.error}`);
    }
    ctx.setCustomStatus(`Failed: Status update - ${statusUpdate.error}`);
    return {
      repository: {
        owner: repository.owner,
        repo: repository.repo,
        branch: repository.branch || "main",
        clonePath: cloneResult.path,
      },
      plan: planResult.plan,
      status: "failed",
      error: `Failed to persist approval status: ${statusUpdate.error}`,
    };
  }

  if (!ctx.isReplaying()) {
    console.log(`[Sequential Workflow] Approval status persisted successfully`);
  }

  // ========================================================================
  // Step 6: Execute the Approved Plan
  // ========================================================================

  ctx.setCustomStatus("Executing implementation plan...");

  if (!ctx.isReplaying()) {
    console.log(`[Sequential Workflow] Starting plan execution`);
  }

  const executionResult = (yield ctx.callActivity(executePlanActivity, {
    repoPath: cloneResult.path,
    planId: planResult.plan.id,
    workflowId: input.sessionId || ctx.getWorkflowInstanceId(), // Prefer session ID for streaming events
  })) as {
    success: boolean;
    tasksCompleted: number;
    tasksTotal: number;
    filesChanged: string[];
    error?: string;
  };

  if (!ctx.isReplaying()) {
    console.log(`[Sequential Workflow] Execution result: ${executionResult.tasksCompleted}/${executionResult.tasksTotal} tasks completed`);
    console.log(`[Sequential Workflow] Files changed: ${executionResult.filesChanged.length}`);
  }

  // Update plan status to completed
  const completedPlan: SequentialPlan = {
    ...planResult.plan,
    status: "approved", // Keep as approved since we executed it
  };

  const finalStatus = executionResult.success ? "completed" : "failed";
  ctx.setCustomStatus(
    executionResult.success
      ? `Completed: ${executionResult.filesChanged.length} files changed`
      : `Failed: ${executionResult.error || "Execution error"}`
  );

  // ========================================================================
  // Return Final Result
  // ========================================================================

  return {
    repository: {
      owner: repository.owner,
      repo: repository.repo,
      branch: repository.branch || "main",
      clonePath: cloneResult.path,
    },
    plan: completedPlan,
    status: finalStatus,
    error: executionResult.success ? undefined : executionResult.error,
    execution: {
      tasksCompleted: executionResult.tasksCompleted,
      tasksTotal: executionResult.tasksTotal,
      filesChanged: executionResult.filesChanged,
    },
  };
};

/**
 * Get the workflow name for registration
 */
export function getSequentialWorkflowName(): string {
  return "sequentialWorkflow";
}
