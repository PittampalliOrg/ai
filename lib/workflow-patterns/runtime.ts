/**
 * Workflow Patterns Runtime
 *
 * Initializes and manages the Dapr Workflow runtime for workflow patterns.
 * Provides singleton access to workflow client and runtime.
 */

import {
  DaprWorkflowClient,
  WorkflowRuntime,
  type TWorkflow,
  type WorkflowActivityContext,
} from "@dapr/dapr";
import { getConfig, isFeatureEnabled } from "../dapr/config-provider";

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

// Note: DAPR_HOST and DAPR_GRPC_PORT are bootstrap values that cannot come from Dapr
// because they are needed to connect TO Dapr in the first place
const DAPR_HOST = process.env.DAPR_HOST || "localhost";
const DAPR_GRPC_PORT = process.env.DAPR_GRPC_PORT || "50001";

/**
 * Check if workflow patterns are enabled
 * Uses config-provider which supports both Dapr Configuration and env vars
 */
function isWorkflowPatternsEnabled(): boolean {
  return isFeatureEnabled("WORKFLOW_PATTERNS_ENABLED");
}

// ============================================================================
// Type Exports
// ============================================================================

export type { TWorkflow };
export type WorkflowContextType = Parameters<TWorkflow>[0];
export type ActivityContextType = WorkflowActivityContext;

// ============================================================================
// Workflow Registration
// ============================================================================

/**
 * Initialize the Dapr Workflow runtime for workflow patterns
 * This should be called during application startup
 */
export async function initializeWorkflowPatternsRuntime(): Promise<{
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

  // Check if workflow patterns are enabled (via Dapr Configuration or env var)
  if (!isWorkflowPatternsEnabled()) {
    console.log("[Workflow Patterns] Runtime is disabled (WORKFLOW_PATTERNS_ENABLED != true)");
    throw new Error("Workflow Patterns runtime is disabled");
  }

  // Start initialization
  initializationPromise = (async () => {
    console.log(`[Workflow Patterns] Initializing Dapr Workflow runtime...`);
    console.log(`[Workflow Patterns] Dapr host: ${DAPR_HOST}:${DAPR_GRPC_PORT}`);

    try {
      // Create workflow runtime and client
      workflowRuntime = new WorkflowRuntime();
      workflowClient = new DaprWorkflowClient();

      // Dynamically import workflows and activities to avoid circular dependencies
      const [
        { sequentialWorkflow },
        { parallelWorkflow },
        { routingWorkflow },
        { orchestratorWorkflow, fileImplementationWorkflow },
        { evaluatorWorkflow },
        activities,
      ] = await Promise.all([
        import("./workflows/sequential-workflow"),
        import("./workflows/parallel-workflow"),
        import("./workflows/routing-workflow"),
        import("./workflows/orchestrator-workflow"),
        import("./workflows/evaluator-workflow"),
        import("./activities"),
      ]);

      // Register all workflows
      workflowRuntime.registerWorkflow(sequentialWorkflow);
      workflowRuntime.registerWorkflow(parallelWorkflow);
      workflowRuntime.registerWorkflow(routingWorkflow);
      workflowRuntime.registerWorkflow(orchestratorWorkflow);
      workflowRuntime.registerWorkflow(fileImplementationWorkflow); // Child workflow for orchestrator
      workflowRuntime.registerWorkflow(evaluatorWorkflow);

      // Register all activities
      workflowRuntime.registerActivity(activities.generateTextActivity);
      workflowRuntime.registerActivity(activities.generateObjectActivity);
      workflowRuntime.registerActivity(activities.generateCopyActivity);
      workflowRuntime.registerActivity(activities.evaluateQualityActivity);
      workflowRuntime.registerActivity(activities.improveCopyActivity);
      workflowRuntime.registerActivity(activities.securityReviewActivity);
      workflowRuntime.registerActivity(activities.performanceReviewActivity);
      workflowRuntime.registerActivity(activities.maintainabilityReviewActivity);
      workflowRuntime.registerActivity(activities.summarizeReviewsActivity);
      workflowRuntime.registerActivity(activities.classifyQueryActivity);
      workflowRuntime.registerActivity(activities.generateResponseActivity);
      workflowRuntime.registerActivity(activities.planImplementationActivity);
      workflowRuntime.registerActivity(activities.implementFileActivity);
      workflowRuntime.registerActivity(activities.translateActivity);
      workflowRuntime.registerActivity(activities.evaluateTranslationActivity);
      workflowRuntime.registerActivity(activities.improveTranslationActivity);
      // Repository activities (for Planner Agent workflow)
      workflowRuntime.registerActivity(activities.validateRepositoryActivity);
      workflowRuntime.registerActivity(activities.cloneRepositoryActivity);
      workflowRuntime.registerActivity(activities.createPlanActivity);
      workflowRuntime.registerActivity(activities.executePlanActivity);

      // Start the runtime
      await workflowRuntime.start();

      isInitialized = true;
      console.log("[Workflow Patterns] Runtime initialized and started successfully");
    } catch (error) {
      console.error("[Workflow Patterns] Failed to initialize runtime:", error);
      workflowRuntime = null;
      workflowClient = null;
      throw error;
    }
  })();

  await initializationPromise;

  if (!workflowRuntime || !workflowClient) {
    throw new Error("Workflow Patterns runtime initialization failed");
  }

  return { workflowRuntime, workflowClient };
}

/**
 * Get the workflow client instance
 * Throws if runtime is not initialized
 */
export function getWorkflowPatternsClient(): DaprWorkflowClient {
  if (!workflowClient) {
    throw new Error(
      "Workflow Patterns runtime not initialized. Call initializeWorkflowPatternsRuntime() first."
    );
  }
  return workflowClient;
}

/**
 * Get the workflow runtime instance
 * Throws if runtime is not initialized
 */
export function getWorkflowPatternsRuntime(): WorkflowRuntime {
  if (!workflowRuntime) {
    throw new Error(
      "Workflow Patterns runtime not initialized. Call initializeWorkflowPatternsRuntime() first."
    );
  }
  return workflowRuntime;
}

/**
 * Check if the workflow runtime is initialized
 */
export function isWorkflowPatternsRuntimeInitialized(): boolean {
  return isInitialized && workflowRuntime !== null && workflowClient !== null;
}

/**
 * Shutdown the workflow runtime gracefully
 */
export async function shutdownWorkflowPatternsRuntime(): Promise<void> {
  if (workflowRuntime) {
    try {
      console.log("[Workflow Patterns] Shutting down workflow runtime...");
      workflowRuntime = null;
      workflowClient = null;
      isInitialized = false;
      initializationPromise = null;
      console.log("[Workflow Patterns] Runtime shutdown complete");
    } catch (error) {
      console.error("[Workflow Patterns] Error during shutdown:", error);
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
export async function getWorkflowPatternState(
  instanceId: string,
  getInputsAndOutputs = true
): Promise<WorkflowState | null> {
  const client = getWorkflowPatternsClient();
  try {
    const state = await client.getWorkflowState(instanceId, getInputsAndOutputs);
    if (!state) return null;
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
    console.error(`[Workflow Patterns] Failed to get state for ${instanceId}:`, error);
    return null;
  }
}

/**
 * Schedule a new workflow pattern instance
 */
export async function scheduleWorkflowPattern<TInput>(
  workflowName: string,
  input: TInput,
  instanceId?: string
): Promise<string> {
  const client = getWorkflowPatternsClient();
  const id = await client.scheduleNewWorkflow(workflowName, input, instanceId);
  console.log(`[Workflow Patterns] Scheduled workflow ${workflowName} with ID: ${id}`);
  return id;
}

/**
 * Wait for a workflow pattern to complete
 */
export async function waitForWorkflowPatternCompletion(
  instanceId: string,
  fetchPayloads = true,
  timeoutSeconds = 300
): Promise<WorkflowState | null> {
  const client = getWorkflowPatternsClient();
  try {
    const state = await client.waitForWorkflowCompletion(
      instanceId,
      fetchPayloads,
      timeoutSeconds
    );
    if (!state) return null;
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
      `[Workflow Patterns] Timeout waiting for workflow ${instanceId}:`,
      error
    );
    return null;
  }
}
