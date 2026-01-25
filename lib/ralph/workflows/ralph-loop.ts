/**
 * Ralph Loop Workflow
 *
 * Main Dapr workflow orchestrator for the Ralph Loop agentic flow.
 * Implements the full lifecycle: Planning -> Iteration -> Acceptance -> Execution -> PR
 */

import { type WorkflowContext, type TWorkflow } from "@dapr/dapr";
import {
  type TaskPlan,
  type TaskPlanItem,
  type UserPlanResponse,
  type RalphWorkflowInput,
  getNextExecutableItem,
  isPlanComplete,
  derivePlanStatus,
} from "@/lib/types/ralph-plan";

// Activity function references (resolved at runtime)
const createPlanActivity = "createPlanActivity";
const iteratePlanActivity = "iteratePlanActivity";
const executePlanItemActivity = "executePlanItemActivity";
const createPRActivity = "createPRActivity";
const saveCheckpointActivity = "saveCheckpointActivity";

/**
 * External event names used by the workflow
 */
export const RALPH_EVENTS = {
  USER_PLAN_RESPONSE: "user_plan_response",
  CANCEL_WORKFLOW: "cancel_workflow",
  PAUSE_WORKFLOW: "pause_workflow",
  RESUME_WORKFLOW: "resume_workflow",
} as const;

/**
 * Main Ralph Loop Workflow
 *
 * This workflow orchestrates the entire Ralph Loop process:
 * 1. Creates an initial plan from the user prompt
 * 2. Waits for user to iterate on or accept the plan
 * 3. Executes each plan item in order
 * 4. Creates a PR with the completed changes
 *
 * The workflow is durable - it survives restarts and can resume from checkpoints.
 */
export const ralphLoopWorkflow: TWorkflow = async function* (
  ctx: WorkflowContext,
  input: RalphWorkflowInput
): any {
  const { sessionId, userPrompt, targetRepo } = input;

  console.log(`[Ralph Workflow] Starting workflow for session ${sessionId}`);

  // ========================================================================
  // Phase 1: Create Initial Plan
  // ========================================================================

  let plan: TaskPlan = (yield ctx.callActivity(createPlanActivity, {
    sessionId,
    prompt: userPrompt,
  })) as TaskPlan;

  console.log(
    `[Ralph Workflow] Initial plan created with ${plan.items.length} items`
  );

  // Save initial checkpoint
  yield ctx.callActivity(saveCheckpointActivity, {
    sessionId,
    plan,
    phase: "planning",
  });

  // ========================================================================
  // Phase 2: Iteration Loop - Wait for User Acceptance
  // ========================================================================

  while (plan.status !== "accepted") {
    console.log(
      `[Ralph Workflow] Waiting for user response (iteration ${plan.iteration})`
    );

    // Wait for external event from user
    const userResponse = (yield ctx.waitForExternalEvent(
      RALPH_EVENTS.USER_PLAN_RESPONSE
    )) as UserPlanResponse;

    if (userResponse.accepted) {
      // User accepted the plan
      plan.status = "accepted";
      plan.acceptedAt = new Date().toISOString();
      plan.updatedAt = new Date().toISOString();

      console.log("[Ralph Workflow] Plan accepted by user");
    } else if (userResponse.feedback) {
      // User provided feedback - iterate on the plan
      plan = (yield ctx.callActivity(iteratePlanActivity, {
        plan,
        feedback: userResponse.feedback,
      })) as TaskPlan;

      plan.iteration += 1;
      plan.status = "iterating";
      plan.updatedAt = new Date().toISOString();

      console.log(`[Ralph Workflow] Plan updated based on feedback (iteration ${plan.iteration})`);
    }

    // Save checkpoint after each iteration
    yield ctx.callActivity(saveCheckpointActivity, {
      sessionId,
      plan,
      phase: "iterating",
    });
  }

  // ========================================================================
  // Phase 3: Execute Plan Items
  // ========================================================================

  console.log("[Ralph Workflow] Beginning execution phase");
  plan.status = "executing";
  plan.updatedAt = new Date().toISOString();

  // Save checkpoint before execution starts
  yield ctx.callActivity(saveCheckpointActivity, {
    sessionId,
    plan,
    phase: "executing",
  });

  // Execute items in dependency order
  let nextItem = getNextExecutableItem(plan);
  let executionIndex = 0;

  while (nextItem && !isPlanComplete(plan)) {
    const itemIndex = plan.items.findIndex((i) => i.id === nextItem!.id);

    console.log(
      `[Ralph Workflow] Executing item ${executionIndex + 1}: ${nextItem.title}`
    );

    // Mark as in progress
    plan.items[itemIndex].status = "in_progress";
    plan.currentItemIndex = itemIndex;
    plan.updatedAt = new Date().toISOString();

    // Execute the item
    const executedItem = (yield ctx.callActivity(executePlanItemActivity, {
      sessionId,
      item: nextItem,
      plan,
      targetRepo,
    })) as TaskPlanItem;

    // Update plan with execution result
    plan.items[itemIndex] = executedItem;
    plan.updatedAt = new Date().toISOString();

    // Update overall plan status
    plan.status = derivePlanStatus(plan);

    // Save checkpoint after each item
    yield ctx.callActivity(saveCheckpointActivity, {
      sessionId,
      plan,
      phase: "executing",
      currentItemId: executedItem.id,
    });

    console.log(
      `[Ralph Workflow] Item ${executedItem.id} completed with status: ${executedItem.status}`
    );

    // Check if plan has failed
    if (plan.status === "failed") {
      console.log("[Ralph Workflow] Plan execution failed");
      break;
    }

    // Get next executable item
    nextItem = getNextExecutableItem(plan);
    executionIndex++;
  }

  // ========================================================================
  // Phase 4: Create PR (if completed successfully)
  // ========================================================================

  if (plan.status === "completed" || isPlanComplete(plan)) {
    console.log("[Ralph Workflow] All items completed, creating PR");

    plan.status = "completed";
    plan.completedAt = new Date().toISOString();
    plan.updatedAt = new Date().toISOString();

    // Create PR with all changes
    const prInfo = (yield ctx.callActivity(createPRActivity, {
      sessionId,
      plan,
      targetRepo,
    })) as { number: number; url: string; status: string; branch?: string };

    plan.prInfo = {
      number: prInfo.number,
      url: prInfo.url,
      status: prInfo.status as "open" | "merged" | "closed",
      branch: prInfo.branch,
    };

    console.log(`[Ralph Workflow] PR created: ${prInfo.url}`);
  }

  // Save final checkpoint
  yield ctx.callActivity(saveCheckpointActivity, {
    sessionId,
    plan,
    phase: "completed",
  });

  console.log(`[Ralph Workflow] Workflow completed with status: ${plan.status}`);

  return plan;
};

/**
 * Get the workflow name for registration
 */
export function getRalphLoopWorkflowName(): string {
  return "ralphLoopWorkflow";
}
