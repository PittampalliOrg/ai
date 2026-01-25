/**
 * Workflow UI Types
 *
 * Type definitions for the workflow dashboard UI.
 * Used to transform internal WorkflowEntry data to UI-compatible format.
 */

// ============================================================================
// Status Types
// ============================================================================

/**
 * Workflow status for UI display
 */
export type WorkflowUIStatus =
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "SUSPENDED"
  | "TERMINATED";

// ============================================================================
// Execution Event Types
// ============================================================================

/**
 * Event types for workflow execution history
 */
export type DaprExecutionEventType =
  | "ExecutionCompleted"
  | "OrchestratorStarted"
  | "TaskCompleted"
  | "TaskScheduled"
  | "EventRaised";

/**
 * Metadata for execution events
 */
export interface DaprExecutionEventMetadata {
  elapsed?: string;
  executionDuration?: string;
  status?: string;
  taskId?: string;
}

/**
 * Execution event for history table
 */
export interface DaprExecutionEvent {
  eventId: number | null;
  eventType: DaprExecutionEventType;
  name: string | null;
  timestamp: string;
  input?: unknown;
  output?: unknown;
  metadata?: DaprExecutionEventMetadata;
}

// ============================================================================
// Workflow Name Stats Types
// ============================================================================

/**
 * Aggregated statistics for a workflow type (name + appId combination)
 * Used in the "Workflow names" tab to show summary stats
 */
export interface WorkflowNameStats {
  name: string; // workflowType
  appId: string;
  totalExecutions: number;
  runningCount: number;
  successCount: number;
  failedCount: number;
}

// ============================================================================
// Workflow List Types
// ============================================================================

/**
 * List item for table view (summary)
 */
export interface WorkflowListItem {
  instanceId: string;
  workflowType: string; // e.g., "planExecutionWorkflow"
  appId: string; // e.g., "workflow-orchestrator"
  status: WorkflowUIStatus;
  startTime: string;
  endTime: string | null;
}

// ============================================================================
// Workflow Detail Types
// ============================================================================

/**
 * Full detail view for a single workflow
 */
export interface WorkflowDetail extends WorkflowListItem {
  executionDuration: string | null;
  input: unknown;
  output: unknown;
  executionHistory: DaprExecutionEvent[];
}

// ============================================================================
// Filter Types
// ============================================================================

/**
 * Filter options for workflow list
 */
export interface WorkflowFilters {
  search?: string;
  status?: WorkflowUIStatus[];
  appId?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get display color class for status
 */
export function getStatusColor(status: WorkflowUIStatus): string {
  switch (status) {
    case "RUNNING":
      return "bg-blue-500";
    case "COMPLETED":
      return "bg-green-500";
    case "FAILED":
      return "bg-red-500";
    case "CANCELLED":
      return "bg-gray-500";
    case "SUSPENDED":
      return "bg-yellow-500";
    case "TERMINATED":
      return "bg-orange-500";
    default:
      return "bg-gray-400";
  }
}

/**
 * Get badge variant for status
 */
export function getStatusVariant(
  status: WorkflowUIStatus
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "COMPLETED":
      return "default";
    case "RUNNING":
      return "secondary";
    case "FAILED":
    case "TERMINATED":
      return "destructive";
    case "SUSPENDED":
    case "CANCELLED":
      return "outline";
    default:
      return "outline";
  }
}

/**
 * Get event type display color class
 */
export function getEventTypeColor(eventType: DaprExecutionEventType): string {
  switch (eventType) {
    case "ExecutionCompleted":
      return "text-green-600";
    case "OrchestratorStarted":
      return "text-blue-600";
    case "TaskCompleted":
      return "text-emerald-600";
    case "TaskScheduled":
      return "text-purple-600";
    case "EventRaised":
      return "text-orange-600";
    default:
      return "text-gray-600";
  }
}
