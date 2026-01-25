/**
 * Save Checkpoint Activity
 *
 * Persists the current plan state to the database for durability.
 */

import { type WorkflowActivityContext } from "@dapr/dapr";
import { type TActivity } from "../workflow-runtime";
import { type TaskPlan } from "@/lib/types/ralph-plan";
import { updateAgentSessionStatus } from "@/lib/db/agent-queries";
import { saveState } from "@/lib/sandbox/dapr-client";

/**
 * Input for the save checkpoint activity
 */
export interface SaveCheckpointInput {
  sessionId: string;
  plan: TaskPlan;
  phase: "planning" | "iterating" | "executing" | "completed" | "failed";
  currentItemId?: string;
}

/**
 * Checkpoint data stored in Dapr state store
 */
interface WorkflowCheckpoint {
  sessionId: string;
  plan: TaskPlan;
  phase: string;
  currentItemId?: string;
  timestamp: string;
  version: number;
}

/**
 * State store name for workflow checkpoints
 */
const WORKFLOW_STATE_STORE = process.env.DAPR_WORKFLOW_STATE_STORE || "workflowstatestore";

/**
 * Generate a checkpoint key for a session
 */
function getCheckpointKey(sessionId: string): string {
  return `ralph:checkpoint:${sessionId}`;
}

/**
 * Save Checkpoint Activity
 *
 * Saves the current workflow state to both:
 * 1. The PostgreSQL database (via agent session)
 * 2. The Dapr state store (for workflow replay)
 */
export const saveCheckpointActivity: TActivity<SaveCheckpointInput, void> = async (
  _ctx: WorkflowActivityContext,
  input: SaveCheckpointInput
): Promise<void> => {
  const { sessionId, plan, phase, currentItemId } = input;

  console.log(`[SaveCheckpoint] Saving checkpoint for session ${sessionId}, phase: ${phase}`);

  try {
    // Determine the database status based on phase
    let dbStatus: "idle" | "running" | "completed" | "error" = "running";
    if (phase === "completed") {
      dbStatus = "completed";
    } else if (phase === "failed" || plan.status === "failed") {
      dbStatus = "error";
    }

    // Save to PostgreSQL database
    await updateAgentSessionStatus({
      id: sessionId,
      taskPlan: plan,
      status: dbStatus,
    });

    // Also save to Dapr state store for workflow durability
    // This enables resume from last checkpoint if the process crashes
    const checkpoint: WorkflowCheckpoint = {
      sessionId,
      plan,
      phase,
      currentItemId,
      timestamp: new Date().toISOString(),
      version: 1,
    };

    const stateResult = await saveState(
      getCheckpointKey(sessionId),
      checkpoint,
      { storeName: WORKFLOW_STATE_STORE }
    );

    if (!stateResult.success) {
      console.warn(
        `[SaveCheckpoint] Failed to save to Dapr state store: ${stateResult.error}`
      );
      // Don't throw - database save is the primary persistence
    }

    console.log(
      `[SaveCheckpoint] Checkpoint saved successfully. Plan status: ${plan.status}, items: ${plan.items.length}`
    );
  } catch (error) {
    console.error(`[SaveCheckpoint] Error saving checkpoint:`, error);
    // Don't throw - checkpoint failure shouldn't stop the workflow
    // The workflow will replay from the last successful activity
  }
};

/**
 * Load a checkpoint from Dapr state store
 * This is used when resuming a workflow after a crash
 */
export async function loadCheckpoint(
  sessionId: string
): Promise<WorkflowCheckpoint | null> {
  const { getState } = await import("@/lib/sandbox/dapr-client");

  const result = await getState<WorkflowCheckpoint>(
    getCheckpointKey(sessionId),
    { storeName: WORKFLOW_STATE_STORE }
  );

  if (!result.success || !result.data) {
    return null;
  }

  return result.data;
}

/**
 * Delete a checkpoint from Dapr state store
 * Called when a workflow completes or is cancelled
 */
export async function deleteCheckpoint(sessionId: string): Promise<void> {
  const { deleteState } = await import("@/lib/sandbox/dapr-client");

  await deleteState(getCheckpointKey(sessionId), {
    storeName: WORKFLOW_STATE_STORE,
  });
}
