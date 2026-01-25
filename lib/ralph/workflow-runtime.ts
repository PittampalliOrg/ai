/**
 * Ralph Loop Workflow Runtime
 *
 * Initializes and manages the Dapr Workflow runtime for the Ralph Loop.
 * Provides singleton access to workflow client and runtime.
 */

import {
  DaprWorkflowClient,
  WorkflowRuntime,
  type TWorkflow,
  type WorkflowActivityContext,
} from "@dapr/dapr";

/**
 * Type for workflow activities (matches Dapr's TWorkflowActivity)
 */
export type TActivity<TInput = unknown, TOutput = unknown> = (
  context: WorkflowActivityContext,
  input: TInput
) => TOutput | Promise<TOutput>;

// ============================================================================
// Singleton Instances
// ============================================================================

let workflowRuntime: WorkflowRuntime | null = null;
let workflowClient: DaprWorkflowClient | null = null;
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;

// ============================================================================
// Configuration
// ============================================================================

const DAPR_HOST = process.env.DAPR_HOST || "localhost";
const DAPR_GRPC_PORT = process.env.DAPR_GRPC_PORT || "50001";
const WORKFLOW_ENABLED = process.env.DAPR_WORKFLOW_ENABLED === "true";

// ============================================================================
// Type Exports
// ============================================================================

export type { TWorkflow };
export type WorkflowContextType = Parameters<TWorkflow>[0];
export type ActivityContextType = WorkflowActivityContext;

// ============================================================================
// Workflow Registration
// ============================================================================

// Lazy-loaded workflows and activities
type WorkflowModule = {
  ralphLoopWorkflow: TWorkflow;
};

type ActivitiesModule = {
  createPlanActivity: TActivity;
  iteratePlanActivity: TActivity;
  executePlanItemActivity: TActivity;
  createPRActivity: TActivity;
  saveCheckpointActivity: TActivity;
};

/**
 * Initialize the Dapr Workflow runtime
 * This should be called during application startup
 */
export async function initializeWorkflowRuntime(): Promise<{
  workflowRuntime: WorkflowRuntime;
  workflowClient: DaprWorkflowClient;
}> {
  // Return existing if already initialized
  if (isInitialized && workflowRuntime && workflowClient) {
    return { workflowRuntime, workflowClient };
  }

  // Wait for existing initialization if in progress
  if (initializationPromise) {
    await initializationPromise;
    if (workflowRuntime && workflowClient) {
      return { workflowRuntime, workflowClient };
    }
  }

  // Check if workflow is enabled
  if (!WORKFLOW_ENABLED) {
    console.log("[Ralph Workflow] Dapr Workflow is disabled (DAPR_WORKFLOW_ENABLED != true)");
    throw new Error("Dapr Workflow is disabled");
  }

  // Start initialization
  initializationPromise = (async () => {
    console.log(`[Ralph Workflow] Initializing Dapr Workflow runtime...`);
    console.log(`[Ralph Workflow] Dapr host: ${DAPR_HOST}:${DAPR_GRPC_PORT}`);

    try {
      // Create workflow runtime and client
      workflowRuntime = new WorkflowRuntime();
      workflowClient = new DaprWorkflowClient();

      // Dynamically import workflows and activities to avoid circular dependencies
      const [workflowModule, activitiesModule] = await Promise.all([
        import("./workflows/ralph-loop") as Promise<WorkflowModule>,
        import("./activities") as Promise<ActivitiesModule>,
      ]);

      // Register the main workflow
      workflowRuntime.registerWorkflow(workflowModule.ralphLoopWorkflow);

      // Register all activities
      workflowRuntime.registerActivity(activitiesModule.createPlanActivity);
      workflowRuntime.registerActivity(activitiesModule.iteratePlanActivity);
      workflowRuntime.registerActivity(activitiesModule.executePlanItemActivity);
      workflowRuntime.registerActivity(activitiesModule.createPRActivity);
      workflowRuntime.registerActivity(activitiesModule.saveCheckpointActivity);

      // Start the runtime
      await workflowRuntime.start();

      isInitialized = true;
      console.log("[Ralph Workflow] Runtime initialized and started successfully");
    } catch (error) {
      console.error("[Ralph Workflow] Failed to initialize runtime:", error);
      workflowRuntime = null;
      workflowClient = null;
      throw error;
    }
  })();

  await initializationPromise;

  if (!workflowRuntime || !workflowClient) {
    throw new Error("Workflow runtime initialization failed");
  }

  return { workflowRuntime, workflowClient };
}

/**
 * Get the workflow client instance
 * Throws if runtime is not initialized
 */
export function getWorkflowClient(): DaprWorkflowClient {
  if (!workflowClient) {
    throw new Error(
      "Workflow runtime not initialized. Call initializeWorkflowRuntime() first."
    );
  }
  return workflowClient;
}

/**
 * Get the workflow runtime instance
 * Throws if runtime is not initialized
 */
export function getWorkflowRuntime(): WorkflowRuntime {
  if (!workflowRuntime) {
    throw new Error(
      "Workflow runtime not initialized. Call initializeWorkflowRuntime() first."
    );
  }
  return workflowRuntime;
}

/**
 * Check if the workflow runtime is initialized
 */
export function isWorkflowRuntimeInitialized(): boolean {
  return isInitialized && workflowRuntime !== null && workflowClient !== null;
}

/**
 * Shutdown the workflow runtime gracefully
 */
export async function shutdownWorkflowRuntime(): Promise<void> {
  if (workflowRuntime) {
    try {
      // WorkflowRuntime doesn't have a stop method, but we can clean up
      console.log("[Ralph Workflow] Shutting down workflow runtime...");
      workflowRuntime = null;
      workflowClient = null;
      isInitialized = false;
      initializationPromise = null;
      console.log("[Ralph Workflow] Runtime shutdown complete");
    } catch (error) {
      console.error("[Ralph Workflow] Error during shutdown:", error);
    }
  }
}

// ============================================================================
// Workflow State Helpers
// ============================================================================

/**
 * Workflow state from Dapr
 */
export interface WorkflowState {
  instanceId: string;
  workflowName: string;
  createdAt: Date;
  lastUpdatedAt: Date;
  runtimeStatus: WorkflowRuntimeStatus;
  serializedInput?: string;
  serializedOutput?: string;
  serializedCustomStatus?: string;
}

export type WorkflowRuntimeStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "TERMINATED"
  | "SUSPENDED"
  | "UNKNOWN";

/**
 * Map Dapr WorkflowRuntimeStatus enum to our string union type
 */
function mapDaprRuntimeStatus(status: number): WorkflowRuntimeStatus {
  const statusMap: Record<number, WorkflowRuntimeStatus> = {
    0: "RUNNING",
    1: "COMPLETED",
    2: "RUNNING", // CONTINUED_AS_NEW maps to RUNNING
    3: "FAILED",
    5: "TERMINATED",
    6: "PENDING",
    7: "SUSPENDED",
  };
  return statusMap[status] ?? "UNKNOWN";
}

/**
 * Get the current state of a workflow instance
 */
export async function getWorkflowState(
  instanceId: string,
  getInputsAndOutputs = true
): Promise<WorkflowState | null> {
  const client = getWorkflowClient();
  try {
    const state = await client.getWorkflowState(instanceId, getInputsAndOutputs);
    if (!state) return null;
    // Map Dapr WorkflowState to our WorkflowState type
    return {
      instanceId: state.instanceId,
      workflowName: state.name,
      createdAt: state.createdAt,
      lastUpdatedAt: state.lastUpdatedAt,
      runtimeStatus: mapDaprRuntimeStatus(state.runtimeStatus),
      serializedInput: state.serializedInput,
      serializedOutput: state.serializedOutput,
      serializedCustomStatus: state.customStatus,
    };
  } catch (error) {
    console.error(`[Ralph Workflow] Failed to get state for ${instanceId}:`, error);
    return null;
  }
}

/**
 * Schedule a new workflow instance
 */
export async function scheduleWorkflow<TInput>(
  workflowName: string,
  input: TInput,
  instanceId?: string
): Promise<string> {
  const client = getWorkflowClient();
  const id = await client.scheduleNewWorkflow(workflowName, input, instanceId);
  console.log(`[Ralph Workflow] Scheduled workflow ${workflowName} with ID: ${id}`);
  return id;
}

/**
 * Raise an external event to a workflow instance
 */
export async function raiseWorkflowEvent<TData>(
  instanceId: string,
  eventName: string,
  eventData?: TData
): Promise<void> {
  const client = getWorkflowClient();
  await client.raiseEvent(instanceId, eventName, eventData);
  console.log(`[Ralph Workflow] Raised event ${eventName} for workflow ${instanceId}`);
}

/**
 * Terminate a workflow instance
 */
export async function terminateWorkflow(
  instanceId: string,
  output?: unknown
): Promise<void> {
  const client = getWorkflowClient();
  await client.terminateWorkflow(instanceId, output);
  console.log(`[Ralph Workflow] Terminated workflow ${instanceId}`);
}

/**
 * Wait for a workflow to complete
 */
export async function waitForWorkflowCompletion(
  instanceId: string,
  fetchPayloads = true,
  timeoutSeconds = 300
): Promise<WorkflowState | null> {
  const client = getWorkflowClient();
  try {
    const state = await client.waitForWorkflowCompletion(
      instanceId,
      fetchPayloads,
      timeoutSeconds
    );
    if (!state) return null;
    // Map Dapr WorkflowState to our WorkflowState type
    return {
      instanceId: state.instanceId,
      workflowName: state.name,
      createdAt: state.createdAt,
      lastUpdatedAt: state.lastUpdatedAt,
      runtimeStatus: mapDaprRuntimeStatus(state.runtimeStatus),
      serializedInput: state.serializedInput,
      serializedOutput: state.serializedOutput,
      serializedCustomStatus: state.customStatus,
    };
  } catch (error) {
    console.error(
      `[Ralph Workflow] Timeout waiting for workflow ${instanceId}:`,
      error
    );
    return null;
  }
}
