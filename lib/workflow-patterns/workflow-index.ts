/**
 * Workflow Index Service
 *
 * Maintains a secondary index of workflow-pattern executions in Dapr state store.
 * This enables listing all workflow instances since Dapr doesn't provide a native list API.
 *
 * Index Structure:
 * - Key: "workflow-patterns-index"
 * - Value: Array of WorkflowIndexEntry objects
 *
 * Individual workflow metadata:
 * - Key: "workflow-pattern-{instanceId}"
 * - Value: WorkflowIndexEntry with full details
 */

import { DaprClient } from "@dapr/dapr";

// ============================================================================
// Types
// ============================================================================

export interface WorkflowIndexEntry {
  instanceId: string;
  workflowName: string;
  workflowType: "sequential" | "parallel" | "routing" | "orchestrator" | "evaluator";
  status: "pending" | "running" | "completed" | "failed" | "terminated";
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  customStatus?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
}

export interface WorkflowIndexQuery {
  status?: WorkflowIndexEntry["status"][];
  workflowType?: WorkflowIndexEntry["workflowType"][];
  limit?: number;
  offset?: number;
}

export interface WorkflowIndexListResponse {
  workflows: WorkflowIndexEntry[];
  total: number;
}

// ============================================================================
// Configuration
// ============================================================================

const STATE_STORE_NAME = process.env.DAPR_STATE_STORE || "statestore";
const INDEX_KEY = "workflow-patterns-index";
const WORKFLOW_KEY_PREFIX = "workflow-pattern-";

// ============================================================================
// Dapr Client Singleton
// ============================================================================

let daprClient: DaprClient | null = null;

function getDaprClient(): DaprClient {
  if (!daprClient) {
    daprClient = new DaprClient();
  }
  return daprClient;
}

// ============================================================================
// Index Operations
// ============================================================================

/**
 * Get all workflow IDs from the index
 */
async function getIndexIds(): Promise<string[]> {
  const client = getDaprClient();
  try {
    const result = await client.state.get(STATE_STORE_NAME, INDEX_KEY);
    if (!result) return [];
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error("[WorkflowIndex] Failed to get index:", error);
    return [];
  }
}

/**
 * Save workflow IDs to the index
 */
async function saveIndexIds(ids: string[]): Promise<void> {
  const client = getDaprClient();
  try {
    await client.state.save(STATE_STORE_NAME, [
      { key: INDEX_KEY, value: ids },
    ]);
  } catch (error) {
    console.error("[WorkflowIndex] Failed to save index:", error);
    throw error;
  }
}

/**
 * Get a single workflow entry by ID
 */
async function getWorkflowEntry(instanceId: string): Promise<WorkflowIndexEntry | null> {
  const client = getDaprClient();
  try {
    const result = await client.state.get(STATE_STORE_NAME, `${WORKFLOW_KEY_PREFIX}${instanceId}`);
    return result as WorkflowIndexEntry | null;
  } catch (error) {
    console.error(`[WorkflowIndex] Failed to get workflow ${instanceId}:`, error);
    return null;
  }
}

/**
 * Save a workflow entry
 */
async function saveWorkflowEntry(entry: WorkflowIndexEntry): Promise<void> {
  const client = getDaprClient();
  try {
    await client.state.save(STATE_STORE_NAME, [
      { key: `${WORKFLOW_KEY_PREFIX}${entry.instanceId}`, value: entry },
    ]);
  } catch (error) {
    console.error(`[WorkflowIndex] Failed to save workflow ${entry.instanceId}:`, error);
    throw error;
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Register a new workflow in the index
 * Called when a workflow is started
 */
export async function registerWorkflow(
  instanceId: string,
  workflowName: string,
  workflowType: WorkflowIndexEntry["workflowType"],
  input?: Record<string, unknown>
): Promise<WorkflowIndexEntry> {
  const now = new Date().toISOString();

  const entry: WorkflowIndexEntry = {
    instanceId,
    workflowName,
    workflowType,
    status: "pending",
    input,
    createdAt: now,
    updatedAt: now,
  };

  // Save the workflow entry
  await saveWorkflowEntry(entry);

  // Add to index
  const ids = await getIndexIds();
  if (!ids.includes(instanceId)) {
    ids.unshift(instanceId); // Add to front (newest first)
    // Keep index manageable - limit to 1000 entries
    if (ids.length > 1000) {
      ids.splice(1000);
    }
    await saveIndexIds(ids);
  }

  console.log(`[WorkflowIndex] Registered workflow ${instanceId} (${workflowType})`);
  return entry;
}

/**
 * Update workflow status in the index
 * Called when workflow status changes
 */
export async function updateWorkflowStatus(
  instanceId: string,
  status: WorkflowIndexEntry["status"],
  updates?: {
    customStatus?: string;
    output?: Record<string, unknown>;
    error?: string;
  }
): Promise<WorkflowIndexEntry | null> {
  const entry = await getWorkflowEntry(instanceId);
  if (!entry) {
    console.warn(`[WorkflowIndex] Workflow ${instanceId} not found in index`);
    return null;
  }

  const now = new Date().toISOString();
  const updatedEntry: WorkflowIndexEntry = {
    ...entry,
    status,
    updatedAt: now,
    ...(updates?.customStatus && { customStatus: updates.customStatus }),
    ...(updates?.output && { output: updates.output }),
    ...(updates?.error && { error: updates.error }),
    ...((status === "completed" || status === "failed" || status === "terminated") && {
      completedAt: now,
    }),
  };

  await saveWorkflowEntry(updatedEntry);
  console.log(`[WorkflowIndex] Updated workflow ${instanceId} status to ${status}`);
  return updatedEntry;
}

/**
 * List workflows from the index with optional filtering
 */
export async function listWorkflows(
  query?: WorkflowIndexQuery
): Promise<WorkflowIndexListResponse> {
  const ids = await getIndexIds();

  if (ids.length === 0) {
    return { workflows: [], total: 0 };
  }

  // Fetch all workflow entries
  const entries: WorkflowIndexEntry[] = [];
  for (const id of ids) {
    const entry = await getWorkflowEntry(id);
    if (entry) {
      entries.push(entry);
    }
  }

  // Apply filters
  let filtered = entries;

  if (query?.status && query.status.length > 0) {
    filtered = filtered.filter((e) => query.status!.includes(e.status));
  }

  if (query?.workflowType && query.workflowType.length > 0) {
    filtered = filtered.filter((e) => query.workflowType!.includes(e.workflowType));
  }

  const total = filtered.length;

  // Apply pagination
  const offset = query?.offset ?? 0;
  const limit = query?.limit ?? 50;
  const paginated = filtered.slice(offset, offset + limit);

  return { workflows: paginated, total };
}

/**
 * Get a single workflow by ID
 */
export async function getWorkflow(instanceId: string): Promise<WorkflowIndexEntry | null> {
  return getWorkflowEntry(instanceId);
}

/**
 * Remove a workflow from the index
 * Called when a workflow is purged
 */
export async function removeWorkflow(instanceId: string): Promise<boolean> {
  const client = getDaprClient();

  try {
    // Remove from index
    const ids = await getIndexIds();
    const newIds = ids.filter((id) => id !== instanceId);
    if (newIds.length !== ids.length) {
      await saveIndexIds(newIds);
    }

    // Delete workflow entry
    await client.state.delete(STATE_STORE_NAME, `${WORKFLOW_KEY_PREFIX}${instanceId}`);

    console.log(`[WorkflowIndex] Removed workflow ${instanceId}`);
    return true;
  } catch (error) {
    console.error(`[WorkflowIndex] Failed to remove workflow ${instanceId}:`, error);
    return false;
  }
}

/**
 * Sync workflow status from Dapr
 * Called to refresh status from the actual Dapr workflow state
 */
export async function syncWorkflowFromDapr(
  instanceId: string,
  daprState: {
    runtimeStatus: string;
    customStatus?: string;
    serializedOutput?: string;
  }
): Promise<WorkflowIndexEntry | null> {
  // Map Dapr status to our status
  const statusMap: Record<string, WorkflowIndexEntry["status"]> = {
    PENDING: "pending",
    RUNNING: "running",
    COMPLETED: "completed",
    FAILED: "failed",
    TERMINATED: "terminated",
    SUSPENDED: "running", // Treat suspended as running
  };

  const status = statusMap[daprState.runtimeStatus] || "running";

  let output: Record<string, unknown> | undefined;
  if (daprState.serializedOutput) {
    try {
      output = JSON.parse(daprState.serializedOutput);
    } catch {
      // Ignore parse errors
    }
  }

  return updateWorkflowStatus(instanceId, status, {
    customStatus: daprState.customStatus,
    output,
  });
}
