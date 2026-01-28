/**
 * Workflow UI Transform Functions
 *
 * Functions to transform internal WorkflowEntry data to UI-compatible format.
 */

import type {
  WorkflowEntry,
  WorkflowStatus,
  ExecutionLog,
  WorkflowListItem as InternalWorkflowListItem,
  PlanTask,
} from "@/lib/types/workflow";
import type {
  WorkflowUIStatus,
  WorkflowListItem,
  WorkflowDetail,
  DaprExecutionEvent,
  DaprExecutionEventType,
  WorkflowCustomStatus,
  WorkflowPhase,
} from "@/lib/types/workflow-ui";
import type { AgentSession } from "@/lib/db/schema";

// ============================================================================
// Timestamp Parsing
// ============================================================================

/**
 * Parse a timestamp that may be in protobuf format or ISO format.
 * Protobuf format: "seconds: 1769245038\nnanos: 869516570\n"
 * ISO format: "2026-01-24T12:00:00.000Z"
 */
export function parseTimestamp(timestamp: string | undefined | null): string {
  if (!timestamp || timestamp.trim() === "") {
    return "";
  }

  // Check if it's protobuf format (contains "seconds:")
  if (timestamp.includes("seconds:")) {
    const secondsMatch = timestamp.match(/seconds:\s*(\d+)/);
    const nanosMatch = timestamp.match(/nanos:\s*(\d+)/);

    if (secondsMatch) {
      const seconds = parseInt(secondsMatch[1], 10);
      const nanos = nanosMatch ? parseInt(nanosMatch[1], 10) : 0;
      const ms = seconds * 1000 + Math.floor(nanos / 1000000);
      return new Date(ms).toISOString();
    }
  }

  // Already ISO format or other parseable format
  const date = new Date(timestamp);
  if (!isNaN(date.getTime())) {
    return date.toISOString();
  }

  return "";
}

// ============================================================================
// Status Mapping
// ============================================================================

/**
 * Map internal WorkflowStatus to UI-compatible status
 */
export function mapWorkflowStatus(status: WorkflowStatus | string): WorkflowUIStatus {
  // Normalize to uppercase for comparison
  const normalizedStatus = status?.toUpperCase?.() || status;

  switch (normalizedStatus) {
    case "IDLE":
    case "PLANNING":
    case "EXECUTING":
    case "IN_PROGRESS":
    case "RUNNING":
      return "RUNNING";
    case "AWAITING_APPROVAL":
    case "SUSPENDED":
      return "SUSPENDED";
    case "COMPLETED":
      return "COMPLETED";
    case "REJECTED":
    case "CANCELLED":
    case "TERMINATED":
      return "CANCELLED";
    case "FAILED":
      return "FAILED";
    case "BLOCKED":
      return "SUSPENDED";
    case "NOT_STARTED":
    case "PENDING":
      return "RUNNING";
    default:
      return "RUNNING";
  }
}

// ============================================================================
// Event Type Mapping
// ============================================================================

/**
 * Map internal execution log event to Dapr event type
 */
export function mapExecutionLogEvent(
  event: ExecutionLog["event"]
): DaprExecutionEventType {
  switch (event) {
    case "started":
      return "TaskScheduled";
    case "completed":
      return "TaskCompleted";
    case "failed":
      return "TaskCompleted";
    case "skipped":
      return "TaskCompleted";
    default:
      return "TaskCompleted";
  }
}

// ============================================================================
// Duration Calculation
// ============================================================================

/**
 * Calculate duration between two timestamps
 * Returns human-readable string like "1.37m" or "45.2s"
 */
export function calculateDuration(
  startTime: string,
  endTime?: string | null
): string | null {
  if (!startTime) return null;

  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();

  if (isNaN(start) || isNaN(end)) return null;

  const durationMs = end - start;

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  if (durationMs < 60000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }
  if (durationMs < 3600000) {
    return `${(durationMs / 60000).toFixed(2)}m`;
  }
  return `${(durationMs / 3600000).toFixed(2)}h`;
}

/**
 * Calculate elapsed time for an event
 */
export function calculateElapsed(
  eventTimestamp: string,
  referenceTimestamp: string
): string {
  const event = new Date(eventTimestamp).getTime();
  const reference = new Date(referenceTimestamp).getTime();

  if (isNaN(event) || isNaN(reference)) return "-";

  const elapsedMs = event - reference;
  if (elapsedMs < 1000) {
    return `${elapsedMs.toFixed(1)}ms`;
  }
  return `${(elapsedMs / 1000).toFixed(1)}s`;
}

// ============================================================================
// Time Formatting
// ============================================================================

/**
 * Format timestamp for display (includes date)
 * Format: "23 Jan 2026 1:06:20 PM"
 */
export function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return "-";

  // Format date part: "23 Jan 2026"
  const dateStr = date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  // Format time part: "1:06:20 PM"
  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  return `${dateStr} ${timeStr}`;
}

/**
 * Format time only (for compact display)
 * Format: "1:07:42 PM"
 */
export function formatTimeOnly(timestamp: string): string {
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return "-";

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

/**
 * Format full date and time for detail header
 * Format: "01:06:20 PM - 23 Jan 2026"
 */
export function formatDateTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return "-";

  const time = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const dateStr = date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return `${time} - ${dateStr}`;
}

// ============================================================================
// Execution Events Transformation
// ============================================================================

/**
 * Transform execution logs to Dapr execution events
 */
export function mapExecutionLogsToEvents(
  logs: ExecutionLog[],
  workflowStart: string,
  workflowEnd?: string | null,
  workflowStatus?: WorkflowStatus,
  tasks?: PlanTask[],
  workflowInput?: unknown
): DaprExecutionEvent[] {
  const events: DaprExecutionEvent[] = [];
  let eventId = 1;

  // Create a map of taskId to task for quick lookup
  const taskMap = new Map<string, PlanTask>();
  if (tasks) {
    for (const task of tasks) {
      taskMap.set(task.id, task);
    }
  }

  // Add OrchestratorStarted event with workflow input
  events.push({
    eventId: null,
    eventType: "OrchestratorStarted",
    name: null,
    timestamp: workflowStart,
    input: workflowInput,
    metadata: {},
  });

  // Process execution logs
  for (const log of logs) {
    const eventType = mapExecutionLogEvent(log.event);
    const task = log.taskId ? taskMap.get(log.taskId) : undefined;

    // Build input from task information
    const input = task
      ? {
          taskId: task.id,
          title: task.title,
          description: task.description,
          dependsOn: task.dependsOn,
        }
      : undefined;

    events.push({
      eventId: eventType === "TaskScheduled" ? null : eventId++,
      eventType,
      name: log.taskId || null,
      timestamp: log.timestamp,
      input,
      output: log.details,
      metadata: {
        status: log.event,
        taskId: log.taskId,
      },
    });
  }

  // Add ExecutionCompleted event if workflow is complete
  if (
    workflowEnd &&
    (workflowStatus === "COMPLETED" ||
      workflowStatus === "FAILED" ||
      workflowStatus === "REJECTED" ||
      workflowStatus === "completed" ||
      workflowStatus === "failed")
  ) {
    events.push({
      eventId: eventId,
      eventType: "ExecutionCompleted",
      name: null,
      timestamp: workflowEnd,
      metadata: {
        executionDuration: calculateDuration(workflowStart, workflowEnd) || undefined,
        status: mapWorkflowStatus(workflowStatus),
      },
    });
  }

  // Sort by timestamp descending (most recent first)
  return events.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

// ============================================================================
// Workflow Transformations
// ============================================================================

/** Default app ID for the workflow orchestrator */
const DEFAULT_APP_ID = "workflow-orchestrator";

/** Default workflow type */
const DEFAULT_WORKFLOW_TYPE = "planExecutionWorkflow";

/**
 * Transform WorkflowEntry to WorkflowListItem
 */
export function toWorkflowListItem(
  workflow: WorkflowEntry & {
    workflowType?: string;
    source?: string;
    customStatus?: WorkflowCustomStatus;
    sessionTitle?: string;
    sessionId?: string;
  }
): WorkflowListItem {
  // Parse timestamps (may be protobuf or ISO format)
  const parsedSubmittedAt = parseTimestamp(workflow.request?.submittedAt);
  const parsedCreatedAt = parseTimestamp(workflow.createdAt);
  const parsedUpdatedAt = parseTimestamp(workflow.updatedAt);

  // Use request.submittedAt as start time if available, otherwise createdAt
  const startTime = parsedSubmittedAt || parsedCreatedAt || new Date().toISOString();

  // Determine end time from execution logs or updatedAt
  let endTime: string | null = null;
  if (
    workflow.status === "COMPLETED" ||
    workflow.status === "FAILED" ||
    workflow.status === "REJECTED"
  ) {
    endTime = parsedUpdatedAt || null;
  }

  // Determine workflowType and appId based on source
  let workflowType: string;
  let appId: string;

  if (workflow.source === "planner-agent") {
    workflowType = workflow.workflowType || "planningAndExecutionWorkflow";
    appId = "planner-agent";
  } else if (workflow.source === "patterns" && workflow.workflowType) {
    workflowType = `${workflow.workflowType}Workflow`;
    appId = "workflow-patterns";
  } else {
    workflowType = workflow.workflowType || DEFAULT_WORKFLOW_TYPE;
    appId = DEFAULT_APP_ID;
  }

  return {
    instanceId: workflow.id,
    workflowType,
    appId,
    status: mapWorkflowStatus(workflow.status),
    startTime,
    endTime,
    customStatus: workflow.customStatus,
    sessionTitle: workflow.sessionTitle,
    sessionId: workflow.sessionId,
  };
}

/**
 * Transform internal WorkflowListItem to UI WorkflowListItem
 */
export function transformWorkflowListItem(
  item: InternalWorkflowListItem
): WorkflowListItem {
  // Parse timestamps (may be protobuf or ISO format)
  const parsedSubmittedAt = parseTimestamp(item.submittedAt);
  const parsedCreatedAt = parseTimestamp(item.createdAt);
  const parsedUpdatedAt = parseTimestamp(item.updatedAt);

  let endTime: string | null = null;
  if (
    item.status === "COMPLETED" ||
    item.status === "FAILED" ||
    item.status === "REJECTED" ||
    item.status === "completed" ||
    item.status === "failed"
  ) {
    endTime = parsedUpdatedAt || null;
  }

  // Use submittedAt as start time if available (actual workflow start),
  // otherwise fall back to createdAt
  const startTime = parsedSubmittedAt || parsedCreatedAt || new Date().toISOString();

  // Determine workflowType and appId based on source
  // For pattern workflows, use the actual workflowType (e.g., "sequentialWorkflow")
  // For orchestrator workflows, use defaults
  const workflowType = item.source === "patterns" && item.workflowType
    ? `${item.workflowType}Workflow`
    : DEFAULT_WORKFLOW_TYPE;
  const appId = item.source === "patterns"
    ? "workflow-patterns"
    : DEFAULT_APP_ID;

  return {
    instanceId: item.instanceId,
    workflowType,
    appId,
    status: mapWorkflowStatus(item.status),
    startTime,
    endTime,
  };
}

/**
 * Transform WorkflowEntry to WorkflowDetail
 */
export function toWorkflowDetail(
  workflow: WorkflowEntry & {
    workflowType?: string;
    source?: string;
    customStatus?: WorkflowCustomStatus;
    sessionTitle?: string;
    sessionId?: string;
  }
): WorkflowDetail {
  const listItem = toWorkflowListItem(workflow);

  // Build input object from request - show full request data
  const input = workflow.request
    ? {
        instanceId: workflow.id,
        input: {
          prompt: workflow.request.prompt,
          submittedAt: workflow.request.submittedAt,
          submittedBy: workflow.request.submittedBy || undefined,
          options: workflow.request.options || undefined,
        },
      }
    : { instanceId: workflow.id };

  // Build output object from plan and execution
  const output = {
    id: workflow.id,
    status: workflow.status,
    request: workflow.request
      ? {
          prompt: workflow.request.prompt,
          submittedAt: workflow.request.submittedAt,
        }
      : null,
    plan: workflow.plan
      ? {
          id: workflow.plan.id,
          title: workflow.plan.title,
          summary: workflow.plan.summary,
          taskCount: workflow.plan.tasks?.length || 0,
        }
      : null,
    approval: workflow.approval || null,
    execution: workflow.execution
      ? {
          completedTasks: workflow.execution.completedTasks?.length || 0,
          failedTasks: workflow.execution.failedTasks?.length || 0,
          skippedTasks: workflow.execution.skippedTasks?.length || 0,
        }
      : null,
    error: workflow.error || null,
  };

  // Build execution history using the correct start time
  // Pass plan tasks and workflow request for input data
  const executionHistory = mapExecutionLogsToEvents(
    workflow.execution?.logs || [],
    listItem.startTime,
    listItem.endTime,
    workflow.status,
    workflow.plan?.tasks,
    workflow.request ? { prompt: workflow.request.prompt } : undefined
  );

  return {
    ...listItem,
    executionDuration: calculateDuration(
      listItem.startTime,
      listItem.endTime
    ),
    input,
    output,
    executionHistory,
  };
}

// ============================================================================
// Planner-Agent Workflow Transformations
// ============================================================================

/**
 * Planner-agent workflow status response
 */
export interface PlannerAgentStatusResponse {
  runtime_status: string;
  custom_status?: {
    phase?: string;
    progress?: number;
    message?: string;
    plan_id?: string;
  };
  created_at?: string;
  updated_at?: string;
}

/**
 * Map planner-agent runtime_status to UI status
 */
export function mapPlannerAgentStatus(runtimeStatus: string): WorkflowUIStatus {
  const normalizedStatus = runtimeStatus?.toUpperCase?.() || runtimeStatus;

  switch (normalizedStatus) {
    case "RUNNING":
    case "PENDING":
      return "RUNNING";
    case "COMPLETED":
      return "COMPLETED";
    case "FAILED":
      return "FAILED";
    case "SUSPENDED":
      return "SUSPENDED";
    case "TERMINATED":
      return "CANCELLED";
    default:
      return "RUNNING";
  }
}

/**
 * Map AgentSession workflowStatus to UI status
 */
export function mapAgentSessionWorkflowStatus(
  status: string | null | undefined
): WorkflowUIStatus {
  if (!status || status === "none") {
    return "RUNNING";
  }

  switch (status.toLowerCase()) {
    case "running":
    case "pending":
      return "RUNNING";
    case "completed":
      return "COMPLETED";
    case "failed":
      return "FAILED";
    case "suspended":
      return "SUSPENDED";
    case "terminated":
      return "CANCELLED";
    default:
      return "RUNNING";
  }
}

/**
 * Transform AgentSession to WorkflowListItem
 * Used when we don't have real-time status from planner-agent
 */
export function transformAgentSessionToWorkflowListItem(
  session: AgentSession
): WorkflowListItem {
  const startTime = session.createdAt?.toISOString?.()
    ?? (typeof session.createdAt === "string" ? session.createdAt : new Date().toISOString());

  const status = mapAgentSessionWorkflowStatus(session.workflowStatus);

  // Determine end time based on status
  let endTime: string | null = null;
  if (status === "COMPLETED" || status === "FAILED" || status === "CANCELLED") {
    endTime = session.updatedAt?.toISOString?.()
      ?? (typeof session.updatedAt === "string" ? session.updatedAt : null);
  }

  return {
    instanceId: session.workflowId || session.id,
    workflowType: "planningAndExecutionWorkflow",
    appId: "planner-agent",
    status,
    startTime,
    endTime,
    sessionTitle: session.title,
    sessionId: session.id,
  };
}

/**
 * Transform AgentSession to WorkflowListItem using cached status fields
 * This is the primary transform function - reads status from database cache
 * (populated via Dapr pub/sub events in the webhook handler)
 */
export function transformAgentSessionToWorkflowListItemWithCache(
  session: AgentSession & {
    workflowPhase?: string | null;
    workflowProgress?: number | null;
    workflowCurrentTask?: string | null;
    workflowMessage?: string | null;
    workflowUpdatedAt?: Date | string | null;
  }
): WorkflowListItem {
  const startTime = session.createdAt?.toISOString?.()
    ?? (typeof session.createdAt === "string" ? session.createdAt : new Date().toISOString());

  const status = mapAgentSessionWorkflowStatus(session.workflowStatus);

  // Determine end time based on status
  let endTime: string | null = null;
  if (status === "COMPLETED" || status === "FAILED" || status === "CANCELLED") {
    // Use workflowUpdatedAt if available (more accurate), otherwise fall back to updatedAt
    const workflowEndTime = session.workflowUpdatedAt;
    if (workflowEndTime) {
      endTime = typeof workflowEndTime === "string"
        ? workflowEndTime
        : workflowEndTime.toISOString?.() ?? null;
    } else {
      endTime = session.updatedAt?.toISOString?.()
        ?? (typeof session.updatedAt === "string" ? session.updatedAt : null);
    }
  }

  // Build custom status from cached fields
  let customStatus: WorkflowCustomStatus | undefined;
  if (session.workflowPhase || session.workflowProgress != null || session.workflowCurrentTask) {
    customStatus = {
      phase: (session.workflowPhase || "executing") as WorkflowPhase,
      progress: session.workflowProgress ?? 0,
      message: session.workflowMessage || "",
      currentTask: session.workflowCurrentTask ?? undefined,
    };
  }

  return {
    instanceId: session.workflowId || session.id,
    workflowType: "planningAndExecutionWorkflow",
    appId: "planner-agent",
    status,
    startTime,
    endTime,
    customStatus,
    sessionTitle: session.title,
    sessionId: session.id,
  };
}

/**
 * Transform AgentSession with planner-agent status response to WorkflowListItem
 * Enriches the basic AgentSession data with real-time status from planner-agent
 */
export function transformAgentSessionWithStatus(
  session: AgentSession,
  statusResponse: PlannerAgentStatusResponse | null
): WorkflowListItem {
  const baseItem = transformAgentSessionToWorkflowListItem(session);

  // If we have a status response, enrich with real-time data
  if (statusResponse) {
    baseItem.status = mapPlannerAgentStatus(statusResponse.runtime_status);

    // Add custom status if available
    if (statusResponse.custom_status) {
      const cs = statusResponse.custom_status;
      baseItem.customStatus = {
        phase: (cs.phase || "executing") as WorkflowPhase,
        progress: cs.progress ?? 0,
        message: cs.message || "",
        plan_id: cs.plan_id,
      };
    }

    // Update end time based on actual runtime status
    if (
      statusResponse.runtime_status === "COMPLETED" ||
      statusResponse.runtime_status === "FAILED" ||
      statusResponse.runtime_status === "TERMINATED"
    ) {
      baseItem.endTime = statusResponse.updated_at
        || session.updatedAt?.toISOString?.()
        || (typeof session.updatedAt === "string" ? session.updatedAt : null);
    } else {
      baseItem.endTime = null;
    }
  }

  return baseItem;
}

// ============================================================================
// Filtering
// ============================================================================

/**
 * Filter workflow list items by search query
 */
export function filterWorkflowsBySearch(
  workflows: WorkflowListItem[],
  search?: string
): WorkflowListItem[] {
  if (!search?.trim()) return workflows;

  const query = search.toLowerCase().trim();
  return workflows.filter(
    (w) =>
      w.instanceId.toLowerCase().includes(query) ||
      w.workflowType.toLowerCase().includes(query) ||
      w.appId.toLowerCase().includes(query)
  );
}

/**
 * Filter workflow list items by status
 */
export function filterWorkflowsByStatus(
  workflows: WorkflowListItem[],
  statuses?: WorkflowUIStatus[]
): WorkflowListItem[] {
  if (!statuses?.length) return workflows;
  return workflows.filter((w) => statuses.includes(w.status));
}

/**
 * Filter workflow list items by app ID
 */
export function filterWorkflowsByAppId(
  workflows: WorkflowListItem[],
  appId?: string
): WorkflowListItem[] {
  if (!appId?.trim()) return workflows;
  return workflows.filter((w) => w.appId === appId);
}

/**
 * Apply all filters to workflow list
 */
export function applyWorkflowFilters(
  workflows: WorkflowListItem[],
  filters: {
    search?: string;
    status?: WorkflowUIStatus[];
    appId?: string;
  }
): WorkflowListItem[] {
  let filtered = workflows;
  filtered = filterWorkflowsBySearch(filtered, filters.search);
  filtered = filterWorkflowsByStatus(filtered, filters.status);
  filtered = filterWorkflowsByAppId(filtered, filters.appId);
  return filtered;
}
