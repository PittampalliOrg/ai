import "server-only";

import type {
  ExecutionLog,
  Plan,
  PlanTask,
  WorkflowEntry,
  WorkflowListItem,
  WorkflowStatus,
} from "@/lib/types/workflow";
import { invokeService } from "@/lib/dapr/client";
import { getConfig } from "@/lib/dapr/config-provider";

// ============================================================================
// Config
// ============================================================================

const getOrchestratorAppId = () =>
  getConfig("WORKFLOW_ORCHESTRATOR_APP_ID", "workflow-orchestrator.workflow-builder");

// ============================================================================
// Orchestrator response types (Pydantic models from workflow-orchestrator)
// ============================================================================

interface WorkflowListItemResponse {
  instanceId: string;
  workflowId: string;
  workflowName: string;
  workflowVersion?: string;
  runtimeStatus: string;
  phase: string | null;
  progress: number | null;
  message: string | null;
  currentNodeId: string | null;
  currentNodeName: string | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface WorkflowListResponse {
  workflows: WorkflowListItemResponse[];
  total: number;
  limit: number;
  offset: number;
}

interface WorkflowStatusResponse {
  instanceId: string;
  workflowId: string;
  workflowName: string;
  workflowVersion?: string;
  runtimeStatus: string;
  phase: string | null;
  progress: number | null;
  message: string | null;
  currentNodeId: string | null;
  currentNodeName: string | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  traceId: string | null;
  approvalEventName: string | null;
  outputs: Record<string, unknown> | null;
  stackTrace: string | null;
  parentInstanceId: string | null;
}

interface WorkflowHistoryEvent {
  eventId: number;
  eventType: string;
  timestamp: string;
  name: string | null;
  input: unknown;
  output: unknown;
  metadata: Record<string, unknown> | null;
}

interface WorkflowHistoryResponse {
  instanceId: string;
  events: WorkflowHistoryEvent[];
}

interface WorkflowDetailResponse {
  instanceId: string;
  workflowId: string;
  workflowName: string;
  runtimeStatus: string;
  phase: string | null;
  progress: number | null;
  message: string | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  approvalEventName: string | null;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
}

interface ExecuteByIdRequest {
  workflowId: string;
  triggerData: Record<string, unknown>;
}

interface ExecuteByIdResponse {
  success: boolean;
  executionId: string;
  instanceId: string;
  workflowId: string;
  workflowName: string;
  status: string;
}

interface RaiseEventRequest {
  eventName: string;
  eventData: Record<string, unknown>;
}

// ============================================================================
// Client functions
// ============================================================================

export async function listWorkflows(opts?: {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ workflows: WorkflowListItem[]; total: number; limit: number; offset: number }> {
  const query: Record<string, string> = {};
  if (opts?.status) query.status = opts.status;
  if (opts?.search) query.search = opts.search;
  if (opts?.limit != null) query.limit = String(opts.limit);
  if (opts?.offset != null) query.offset = String(opts.offset);

  const response = await invokeService<WorkflowListResponse>({
    appId: getOrchestratorAppId(),
    method: "GET",
    path: "/api/v2/workflows",
    query,
    timeout: 15000,
  });

  if (!response.ok || !response.data) {
    throw new Error(
      `Failed to list workflows: ${response.status} ${response.statusText}`,
    );
  }

  const { workflows: items, total, limit, offset } = response.data;

  return {
    workflows: items.map(mapListItemResponse),
    total,
    limit,
    offset,
  };
}

export async function getWorkflowStatus(
  instanceId: string,
): Promise<WorkflowStatusResponse | null> {
  const response = await invokeService<WorkflowStatusResponse>({
    appId: getOrchestratorAppId(),
    method: "GET",
    path: `/api/v2/workflows/${encodeURIComponent(instanceId)}/status`,
    timeout: 10000,
  });

  if (response.status === 404) return null;

  if (!response.ok || !response.data) {
    throw new Error(
      `Failed to get workflow status: ${response.status} ${response.statusText}`,
    );
  }

  return response.data;
}

export async function getWorkflowHistory(
  instanceId: string,
): Promise<WorkflowHistoryResponse | null> {
  const response = await invokeService<WorkflowHistoryResponse>({
    appId: getOrchestratorAppId(),
    method: "GET",
    path: `/api/v2/workflows/${encodeURIComponent(instanceId)}/history`,
    timeout: 15000,
  });

  if (response.status === 404) return null;

  if (!response.ok || !response.data) {
    throw new Error(
      `Failed to get workflow history: ${response.status} ${response.statusText}`,
    );
  }

  return response.data;
}

export async function getWorkflowDetail(
  instanceId: string,
): Promise<WorkflowDetailResponse | null> {
  const response = await invokeService<WorkflowDetailResponse>({
    appId: getOrchestratorAppId(),
    method: "GET",
    path: `/api/workflows/${encodeURIComponent(instanceId)}`,
    timeout: 10000,
  });

  if (response.status === 404) return null;

  if (!response.ok || !response.data) {
    throw new Error(
      `Failed to get workflow detail: ${response.status} ${response.statusText}`,
    );
  }

  return response.data;
}

export async function executeWorkflowById(input: {
  workflowId: string;
  triggerData: Record<string, unknown>;
}): Promise<ExecuteByIdResponse> {
  const body: ExecuteByIdRequest = {
    workflowId: input.workflowId,
    triggerData: input.triggerData,
  };

  const response = await invokeService<ExecuteByIdResponse>({
    appId: getOrchestratorAppId(),
    method: "POST",
    path: "/api/v2/workflows/execute-by-id",
    body,
    timeout: 60000,
  });

  if (!response.ok || !response.data) {
    throw new Error(
      `Failed to execute workflow: ${response.status} ${response.statusText}`,
    );
  }

  return response.data;
}

export async function raiseEvent(
  instanceId: string,
  event: { eventName: string; eventData: Record<string, unknown> },
): Promise<void> {
  const body: RaiseEventRequest = {
    eventName: event.eventName,
    eventData: event.eventData,
  };

  const response = await invokeService({
    appId: getOrchestratorAppId(),
    method: "POST",
    path: `/api/v2/workflows/${encodeURIComponent(instanceId)}/events`,
    body,
    timeout: 15000,
  });

  if (!response.ok) {
    throw new Error(
      `Failed to raise event: ${response.status} ${response.statusText}`,
    );
  }
}

export async function terminateWorkflow(
  instanceId: string,
  reason?: string,
): Promise<void> {
  const response = await invokeService({
    appId: getOrchestratorAppId(),
    method: "POST",
    path: `/api/v2/workflows/${encodeURIComponent(instanceId)}/terminate`,
    body: reason ? { reason } : undefined,
    timeout: 15000,
  });

  if (!response.ok) {
    throw new Error(
      `Failed to terminate workflow: ${response.status} ${response.statusText}`,
    );
  }
}

// ============================================================================
// Mapping helpers: orchestrator responses → frontend types
// ============================================================================

function mapRuntimeStatus(runtimeStatus: string, phase: string | null): WorkflowStatus {
  const p = (phase || "").toLowerCase();
  const rs = runtimeStatus.toUpperCase();

  if (p === "awaiting_approval") return "AWAITING_APPROVAL";
  if (p === "planning" || p === "planned") return "PLANNING";
  if (p === "executing" || p === "execution") return "EXECUTING";
  if (rs === "COMPLETED") return "COMPLETED";
  if (rs === "FAILED" || rs === "TERMINATED") return "FAILED";
  if (rs === "SUSPENDED") return "AWAITING_APPROVAL";
  if (rs === "RUNNING") return "EXECUTING";
  if (rs === "CANCELED" || rs === "CANCELLED") return "REJECTED";
  return "EXECUTING";
}

function mapListItemResponse(item: WorkflowListItemResponse): WorkflowListItem {
  return {
    instanceId: item.instanceId,
    topic: item.workflowName || "Workflow",
    status: mapRuntimeStatus(item.runtimeStatus, item.phase),
    createdAt: item.startedAt,
    updatedAt: item.completedAt || item.startedAt,
    planStepsCount: 0,
    planStepsCompleted: 0,
    taskCount: 0,
    source: "orchestrator" as const,
  };
}

export function toWorkflowEntry(
  status: WorkflowStatusResponse,
  history?: WorkflowHistoryResponse | null,
): WorkflowEntry & {
  customStatus?: { phase: string; progress: number; message: string };
  source?: string;
  appId?: string;
} {
  const workflowStatus = mapRuntimeStatus(status.runtimeStatus, status.phase);
  const plan = buildPlanFromHistory(history);
  const executionLogs = buildExecutionLogsFromHistory(history, status.instanceId);
  const progress = status.progress ?? 0;
  const phase = status.phase;
  const message = status.message || status.error || (plan ? "Plan available for review" : null);

  return {
    id: status.instanceId,
    status: workflowStatus,
    plan,
    execution: {
      currentTaskIndex: executionLogs.filter((log) => log.event === "completed").length,
      completedTasks: executionLogs.filter((log) => log.event === "completed").map((log) => log.taskId),
      failedTasks: executionLogs.filter((log) => log.event === "failed").map((log) => log.taskId),
      skippedTasks: [],
      logs: executionLogs,
    },
    error: status.error ?? undefined,
    createdAt: status.startedAt,
    updatedAt: status.completedAt || status.startedAt,
    customStatus: phase
      ? { phase, progress, message: message || "" }
      : undefined,
    source: "orchestrator",
    appId: "workflow-orchestrator",
  };
}

function buildPlanFromHistory(
  history?: WorkflowHistoryResponse | null,
): Plan | undefined {
  if (!history?.events) return undefined;

  // Look for plan-related events in history
  const planEvent = history.events.find(
    (e) =>
      e.eventType === "TaskCompleted" &&
      e.name &&
      (e.name.toLowerCase().includes("plan") ||
        e.name.toLowerCase().includes("create_plan")),
  );

  if (!planEvent?.output || typeof planEvent.output !== "object") return undefined;

  const output = planEvent.output as Record<string, unknown>;
  const planData =
    output.plan || output.planJson || output;

  if (!planData || typeof planData !== "object") return undefined;

  const planObj = planData as Record<string, unknown>;
  const tasks = parsePlanTasks(planObj);
  if (tasks.length === 0) return undefined;

  return {
    id: String(planEvent.eventId),
    title:
      typeof planObj.title === "string"
        ? planObj.title
        : "Implementation Plan",
    summary:
      typeof planObj.summary === "string"
        ? planObj.summary
        : typeof planObj.goal === "string"
          ? planObj.goal
          : "",
    tasks,
    markdown:
      typeof planObj.planMarkdown === "string"
        ? planObj.planMarkdown
        : undefined,
    rawResponse:
      typeof planObj.planMarkdown === "string"
        ? planObj.planMarkdown
        : undefined,
  };
}

function parsePlanTasks(planJson: unknown): PlanTask[] {
  if (!planJson || typeof planJson !== "object") return [];
  const tasks = (planJson as Record<string, unknown>).tasks;
  if (!Array.isArray(tasks)) return [];

  const result: PlanTask[] = [];
  for (const task of tasks) {
    if (!task || typeof task !== "object") continue;
    const record = task as Record<string, unknown>;
    const id = String(record.id ?? "").trim();
    const title = String(record.title ?? record.subject ?? record.name ?? "").trim();
    if (!id || !title) continue;

    const statusRaw = String(record.status ?? "pending").toLowerCase();
    const status: PlanTask["status"] =
      statusRaw === "completed"
        ? "completed"
        : statusRaw === "in_progress"
          ? "in_progress"
          : statusRaw === "failed"
            ? "failed"
            : statusRaw === "skipped"
              ? "skipped"
              : statusRaw === "planned"
                ? "planned"
                : "pending";

    result.push({
      id,
      title,
      subject: title,
      description: String(record.description ?? "").trim(),
      status,
      blockedBy: Array.isArray(record.blockedBy)
        ? record.blockedBy.map((v) => String(v))
        : undefined,
      blocks: Array.isArray(record.blocks)
        ? record.blocks.map((v) => String(v))
        : undefined,
    });
  }

  return result;
}

function buildExecutionLogsFromHistory(
  history?: WorkflowHistoryResponse | null,
  workflowId?: string,
): ExecutionLog[] {
  if (!history?.events) return [];

  return history.events
    .filter((e) =>
      [
        "TaskCompleted",
        "TaskFailed",
        "TaskScheduled",
        "SubOrchestrationCompleted",
        "SubOrchestrationFailed",
      ].includes(e.eventType),
    )
    .map((e) => ({
      timestamp: e.timestamp,
      taskId: e.name || String(e.eventId),
      event: e.eventType.includes("Failed")
        ? ("failed" as const)
        : e.eventType.includes("Completed")
          ? ("completed" as const)
          : ("started" as const),
      message: e.name || e.eventType,
      details: e.output,
    }));
}
