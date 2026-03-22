/**
 * Workflow Visualization Types
 *
 * Type definitions for the Business Process Workflow Orchestrator.
 * Supports the workflow-orchestrator service with claude-planner and
 * claude-code-agent integration.
 */

// ============================================================================
// Message Types
// ============================================================================

/**
 * A message in the workflow conversation
 */
export interface WorkflowMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
}

// ============================================================================
// Plan Types (New Orchestrator Format)
// ============================================================================

/**
 * Status of a plan task (new orchestrator format)
 */
export type PlanTaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "skipped"
  | "not_started"
  | "planned";

/**
 * A task in the workflow plan (new orchestrator format)
 */
export interface PlanTask {
  id: string;
  title: string;
  /** Task subject from orchestrator (maps to title for display) */
  subject?: string;
  description: string;
  status: PlanTaskStatus;
  /** @deprecated Use blockedBy instead */
  dependsOn?: string[];
  /** Task IDs that cannot start until this task completes */
  blocks?: string[];
  /** Task IDs that must complete before this task can start */
  blockedBy?: string[];
  result?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

/**
 * Plan from the claude-planner service
 */
export interface Plan {
  id: string;
  title: string;
  summary: string;
  tasks: PlanTask[];
  rawResponse?: string;
  markdown?: string;
}

/**
 * Approval information for a workflow
 */
export interface Approval {
  approved: boolean;
  approvedBy?: string;
  approvedAt?: string;
  comments?: string;
}

/**
 * Execution log entry
 */
export interface ExecutionLog {
  timestamp: string;
  taskId: string;
  event: "started" | "completed" | "failed" | "skipped";
  message: string;
  details?: unknown;
}

/**
 * Execution state tracking
 */
export interface ExecutionState {
  currentTaskIndex: number;
  completedTasks: string[];
  failedTasks: string[];
  skippedTasks: string[];
  logs: ExecutionLog[];
}

// ============================================================================
// Legacy Plan Types (for backwards compatibility)
// ============================================================================

/**
 * Status of a plan step (legacy format)
 */
export type PlanStepStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "blocked";

/**
 * A single step in the workflow plan (legacy format)
 */
export interface PlanStep {
  id: string;
  description: string;
  status: PlanStepStatus;
  details?: string;
  assignedAgent?: string;
  completedAt?: string;
}

// ============================================================================
// Task Types
// ============================================================================

/**
 * Result of a task execution
 */
export interface TaskResult {
  taskId: string;
  agent: string;
  status: "success" | "failure" | "pending";
  result?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Workflow State Types
// ============================================================================

/**
 * Status of the overall workflow (new orchestrator format)
 */
export type WorkflowStatus =
  | "IDLE"
  | "PLANNING"
  | "AWAITING_APPROVAL"
  | "EXECUTING"
  | "COMPLETED"
  | "REJECTED"
  | "FAILED"
  // Legacy statuses (for backwards compatibility)
  | "not_started"
  | "in_progress"
  | "completed"
  | "blocked"
  | "failed";

/**
 * Workflow request information
 */
export interface WorkflowRequest {
  prompt: string;
  submittedAt: string;
  submittedBy?: string;
  options?: {
    autoApprove?: boolean;
    notifyEmail?: string;
    workingDirectory?: string;
  };
}

/**
 * Individual workflow entry/instance (new orchestrator format)
 */
export interface WorkflowEntry {
  id: string;
  status: WorkflowStatus;
  request?: WorkflowRequest;
  plan?: Plan;
  approval?: Approval;
  execution?: ExecutionState;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Individual workflow entry/instance (legacy format for backwards compatibility)
 */
export interface LLMWorkflowEntry {
  instanceId: string;
  status: WorkflowStatus;
  topic: string;
  plan: PlanStep[];
  taskHistory: TaskResult[];
  messages: WorkflowMessage[];
  currentStep?: number;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Top-level workflow state container from Redis (legacy)
 * The key is typically the instance ID
 */
export interface LLMWorkflowState {
  [instanceId: string]: LLMWorkflowEntry;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Workflow list item (summary for list view)
 */
export interface WorkflowListItem {
  instanceId: string;
  status: WorkflowStatus;
  topic: string;
  planStepsCount?: number;
  planStepsCompleted?: number;
  taskCount?: number;
  submittedAt?: string;  // Actual workflow start time from request
  createdAt: string;
  updatedAt: string;
  /** Source of the workflow: workflow-builder or workflow patterns */
  source?: "orchestrator" | "workflow-builder" | "patterns";
  /** Workflow type for patterns (e.g., "sequential", "parallel") */
  workflowType?: string;
}

/**
 * Response for workflow list API
 */
export interface WorkflowListResponse {
  workflows: WorkflowListItem[];
  total: number;
}

/**
 * Response for workflow detail API
 */
export interface WorkflowDetailResponse {
  workflow: LLMWorkflowEntry;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get display label for workflow status
 */
export function getWorkflowStatusLabel(status: WorkflowStatus): string {
  switch (status) {
    // New orchestrator statuses
    case "IDLE":
      return "Idle";
    case "PLANNING":
      return "Planning";
    case "AWAITING_APPROVAL":
      return "Awaiting Approval";
    case "EXECUTING":
      return "Executing";
    case "COMPLETED":
      return "Completed";
    case "REJECTED":
      return "Rejected";
    case "FAILED":
      return "Failed";
    // Legacy statuses
    case "not_started":
      return "Not Started";
    case "in_progress":
      return "In Progress";
    case "completed":
      return "Completed";
    case "blocked":
      return "Blocked";
    case "failed":
      return "Failed";
    default:
      return "Unknown";
  }
}

/**
 * Get display label for plan step status
 */
export function getPlanStepStatusLabel(status: PlanStepStatus): string {
  switch (status) {
    case "not_started":
      return "Not Started";
    case "in_progress":
      return "In Progress";
    case "completed":
      return "Completed";
    case "blocked":
      return "Blocked";
    default:
      return "Unknown";
  }
}

/**
 * Get display label for plan task status (new format)
 */
export function getPlanTaskStatusLabel(status: PlanTaskStatus): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "in_progress":
      return "In Progress";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
    case "not_started":
      return "Not Started";
    case "planned":
      return "Planned";
    default:
      return "Unknown";
  }
}

/**
 * Calculate workflow progress percentage (new format)
 */
export function getWorkflowEntryProgress(workflow: WorkflowEntry): number {
  if (!workflow.plan?.tasks || workflow.plan.tasks.length === 0) {
    return 0;
  }
  const completed = workflow.plan.tasks.filter(
    (task) => task.status === "completed"
  ).length;
  return Math.round((completed / workflow.plan.tasks.length) * 100);
}

/**
 * Calculate workflow progress percentage (legacy format)
 */
export function getWorkflowProgress(workflow: LLMWorkflowEntry): number {
  if (!workflow.plan || workflow.plan.length === 0) {
    return 0;
  }
  const completed = workflow.plan.filter(
    (step) => step.status === "completed"
  ).length;
  return Math.round((completed / workflow.plan.length) * 100);
}

/**
 * Check if workflow needs approval
 */
export function workflowNeedsApproval(workflow: WorkflowEntry): boolean {
  return workflow.status === "AWAITING_APPROVAL";
}

/**
 * Check if workflow is in a terminal state
 */
export function isWorkflowTerminal(workflow: WorkflowEntry): boolean {
  return ["COMPLETED", "REJECTED", "FAILED"].includes(workflow.status);
}

/**
 * Transform WorkflowEntry to WorkflowListItem
 */
export function workflowEntryToListItem(entry: WorkflowEntry): WorkflowListItem {
  const tasksCompleted = entry.plan?.tasks?.filter(
    (task) => task.status === "completed"
  ).length ?? 0;

  return {
    instanceId: entry.id,
    status: entry.status,
    topic: entry.request?.prompt ?? "",
    planStepsCount: entry.plan?.tasks?.length ?? 0,
    planStepsCompleted: tasksCompleted,
    taskCount: entry.execution?.logs?.length ?? 0,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

/**
 * Transform raw workflow state entry to list item (legacy)
 */
export function toWorkflowListItem(
  entry: LLMWorkflowEntry
): WorkflowListItem {
  const planStepsCompleted = entry.plan?.filter(
    (step) => step.status === "completed"
  ).length ?? 0;

  const now = new Date().toISOString();
  return {
    instanceId: entry.instanceId,
    status: entry.status,
    topic: entry.topic,
    planStepsCount: entry.plan?.length ?? 0,
    planStepsCompleted,
    taskCount: entry.taskHistory?.length ?? 0,
    createdAt: entry.createdAt ?? now,
    updatedAt: entry.updatedAt ?? now,
  };
}

// ============================================================================
// Streaming Event Types
// ============================================================================

/**
 * Types of streaming events from workflow agents
 */
export type WorkflowStreamEventType =
  | "initial"
  | "llm_chunk"
  | "thinking"  // Claude's extended thinking (internal reasoning)
  | "tool_call"
  | "tool_result"
  | "task_progress"
  | "task_completed"
  | "heartbeat"
  | "error";

/**
 * Agent identifiers for multi-agent streaming
 */
export type AgentId = "claude-planner" | "claude-code-agent";

/**
 * Data payload for different streaming event types
 */
export interface WorkflowStreamEventData {
  /** Text content for llm_chunk events */
  content?: string;
  /** Tool name for tool_call/tool_result events */
  toolName?: string;
  /** Tool input for tool_call events */
  toolInput?: unknown;
  /** Tool output for tool_result events */
  toolOutput?: string;
  /** Status message for task_progress events */
  status?: string;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Error message for error events */
  error?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Real-time streaming event from workflow agents
 */
export interface WorkflowStreamEvent {
  /** Unique event identifier */
  id: string;
  /** Type of streaming event */
  type: WorkflowStreamEventType;
  /** Associated workflow instance ID */
  workflowId: string;
  /** Associated task ID (if applicable) */
  taskId?: string;
  /** Source agent identifier */
  agentId?: AgentId;
  /** Event payload data */
  data: WorkflowStreamEventData;
  /** ISO 8601 timestamp */
  timestamp: string;
}
