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
// Custom Status Types (for planner-agent workflows)
// ============================================================================

/**
 * Phase of a planner-agent workflow
 */
export type WorkflowPhase =
  | "clone"
  | "exploration"
  | "planning"
  | "awaiting_approval"
  | "executing"
  | "completed"
  | "failed";

/**
 * Custom status from planner-agent workflow
 * Contains phase, progress, and human-readable message
 */
export interface WorkflowCustomStatus {
  phase: WorkflowPhase;
  progress: number; // 0-100
  message: string;
  plan_id?: string;
  currentTask?: string; // Currently executing task title
}

// ============================================================================
// Workflow List Types
// ============================================================================

/**
 * List item for table view (summary)
 */
export interface WorkflowListItem {
  instanceId: string;
  workflowType: string; // e.g., "planExecutionWorkflow", "planningAndExecutionWorkflow"
  appId: string; // e.g., "workflow-orchestrator", "planner-agent"
  status: WorkflowUIStatus;
  startTime: string;
  endTime: string | null;
  /** Custom status from planner-agent (phase, progress, message) */
  customStatus?: WorkflowCustomStatus;
  /** Session title for planner-agent workflows */
  sessionTitle?: string;
  /** Session ID linking back to AgentSession */
  sessionId?: string;
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
  /** Raw DaprAgentOutput preserved from API for structured display */
  daprAgentOutput?: DaprAgentOutput;
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

/**
 * Get display label for workflow phase
 */
export function getPhaseLabel(phase: WorkflowPhase): string {
  switch (phase) {
    case "clone":
      return "Cloning";
    case "exploration":
      return "Exploring";
    case "planning":
      return "Planning";
    case "awaiting_approval":
      return "Awaiting Approval";
    case "executing":
      return "Executing";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return phase;
  }
}

/**
 * Get color class for workflow phase
 */
export function getPhaseColor(phase: WorkflowPhase): string {
  switch (phase) {
    case "clone":
    case "exploration":
      return "text-blue-400";
    case "planning":
      return "text-purple-400";
    case "awaiting_approval":
      return "text-yellow-400";
    case "executing":
      return "text-amber-400";
    case "completed":
      return "text-green-400";
    case "failed":
      return "text-red-400";
    default:
      return "text-gray-400";
  }
}

// ============================================================================
// DaprAgent Output Types (for DaprOpenAIRunner workflows)
// ============================================================================

/**
 * Task status for DaprAgent tasks
 */
export type DaprAgentTaskStatus = "pending" | "in_progress" | "completed" | "failed";

/**
 * Task from DaprOpenAIRunner output
 */
export interface DaprAgentTask {
  id: string;
  subject: string;
  description: string;
  status: DaprAgentTaskStatus;
  blockedBy: string[];
  blocks: string[];
}

/**
 * Token usage metrics from DaprAgent output
 */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

/**
 * Trace metadata from DaprAgent output
 */
export interface TraceMetadata {
  trace_id?: string;
  agent_span_id?: string;
  workflow_name?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Output structure from DaprOpenAIRunner workflows
 */
export interface DaprAgentOutput {
  status?: string;
  output?: string;
  tasks?: DaprAgentTask[];
  usage?: TokenUsage;
  trace?: TraceMetadata;
}

/**
 * Get status icon color for DaprAgentTask status
 */
export function getTaskStatusColor(status: DaprAgentTaskStatus): string {
  switch (status) {
    case "pending":
      return "text-gray-400";
    case "in_progress":
      return "text-blue-400";
    case "completed":
      return "text-green-400";
    case "failed":
      return "text-red-400";
    default:
      return "text-gray-400";
  }
}

/**
 * Get background color for DaprAgentTask status badge
 */
export function getTaskStatusBgColor(status: DaprAgentTaskStatus): string {
  switch (status) {
    case "pending":
      return "bg-gray-500/20";
    case "in_progress":
      return "bg-blue-500/20";
    case "completed":
      return "bg-green-500/20";
    case "failed":
      return "bg-red-500/20";
    default:
      return "bg-gray-500/20";
  }
}
