/**
 * Workflow Detail API
 *
 * GET /api/workflows/[instanceId]
 * Fetches workflow details from AgentSession table and planner-agent service
 */

import { NextResponse, type NextRequest } from "next/server";
import type { WorkflowEntry, ExecutionLog } from "@/lib/types/workflow";
import { getAgentSessionByWorkflowId, getAgentSession } from "@/lib/db/agent-queries";
import type { PlannerAgentStatusResponse } from "@/lib/transforms/workflow-ui";
import { getWorkflowEvents } from "@/lib/workflow-event-store";

// Planner-agent service configuration
const PLANNER_AGENT_URL =
  process.env.PLANNER_AGENT_URL || "http://planner-agent.dapr-agents.svc.cluster.local:80";

interface RouteParams {
  params: Promise<{ instanceId: string }>;
}

/**
 * Fetch workflow status from planner-agent service
 */
async function fetchPlannerAgentStatus(
  workflowId: string
): Promise<PlannerAgentStatusResponse | null> {
  try {
    const response = await fetch(
      `${PLANNER_AGENT_URL}/api/workflow/${workflowId}/status`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        next: { revalidate: 0 },
      }
    );

    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch (error) {
    console.error(`[Workflow Detail] Failed to fetch status for ${workflowId}:`, error);
    return null;
  }
}

/**
 * Map workflow status to internal format
 */
function mapStatus(
  dbStatus: string | null,
  runtimeStatus?: string
): WorkflowEntry["status"] {
  const status = runtimeStatus || dbStatus || "RUNNING";
  const normalized = status.toUpperCase();

  switch (normalized) {
    case "RUNNING":
    case "PENDING":
      return "EXECUTING";
    case "COMPLETED":
      return "COMPLETED";
    case "FAILED":
      return "FAILED";
    case "SUSPENDED":
      return "AWAITING_APPROVAL";
    case "TERMINATED":
      return "REJECTED";
    default:
      return "EXECUTING";
  }
}

import type { PlanTask } from "@/lib/types/workflow";

// Phase display names for human-readable titles
const PHASE_TITLES: Record<string, string> = {
  clone: "Repository Clone",
  exploration: "Codebase Exploration",
  planning: "Task Planning",
  awaiting_approval: "Awaiting Approval",
  executing: "Task Execution",
  completed: "Workflow Completed",
  failed: "Workflow Failed",
};

/**
 * Transform Redis workflow events to execution logs and synthetic tasks
 * Maps planner-agent event types to the format expected by the UI
 * Returns both logs (for execution history) and tasks (for input data lookup)
 */
function transformEventsToExecutionData(
  events: Array<{
    id: string;
    type: string;
    workflowId: string;
    taskId?: string;
    data: Record<string, unknown>;
    timestamp: string;
  }>
): { logs: ExecutionLog[]; tasks: PlanTask[] } {
  const logs: ExecutionLog[] = [];
  const tasks: PlanTask[] = [];

  // Sort by timestamp chronologically
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Track seen phases to avoid duplicates
  const seenPhases = new Set<string>();

  for (const event of sortedEvents) {
    // Map phase_changed events to execution logs
    if (event.type === "phase_changed") {
      const phase = event.data.phase as string;
      const status = event.data.status as string;
      const progress = event.data.progress as number | undefined;
      const planId = event.data.planId as string | undefined;

      // Skip duplicate phases
      if (seenPhases.has(phase)) continue;
      seenPhases.add(phase);

      // Create synthetic task for input data lookup
      tasks.push({
        id: phase,
        title: PHASE_TITLES[phase] || `Phase: ${phase}`,
        description: status || `Executing ${phase} phase`,
        status: "completed",
        // Store full event data in result for reference
        result: JSON.stringify({
          phase,
          progress,
          planId,
          message: status,
        }),
      });

      logs.push({
        taskId: phase,
        event: "completed",
        timestamp: event.timestamp,
        message: PHASE_TITLES[phase] || `Phase: ${phase}`,
        details: status || `Phase: ${phase}`,
      });
    }

    // Map execution_started to a started log
    if (event.type === "execution_started") {
      const workflowId = event.data.workflowId as string | undefined;
      const prompt = event.data.prompt as string | undefined;

      // Create synthetic task for workflow start
      tasks.push({
        id: "workflow",
        title: "Workflow Execution",
        description: prompt || "Planning and execution workflow",
        status: "in_progress",
        result: JSON.stringify({
          workflowId: workflowId || event.workflowId,
          startedAt: event.timestamp,
        }),
      });

      logs.push({
        taskId: "workflow",
        event: "started",
        timestamp: event.timestamp,
        message: "Workflow Execution",
        details: "Workflow execution started",
      });
    }

    // Map execution_completed to a completed log
    if (event.type === "execution_completed") {
      // Update the workflow task to completed status
      const workflowTask = tasks.find(t => t.id === "workflow");
      if (workflowTask) {
        workflowTask.status = "completed";
        workflowTask.completedAt = event.timestamp;
      }

      logs.push({
        taskId: "workflow",
        event: "completed",
        timestamp: event.timestamp,
        message: "Workflow Completed",
        details: "Workflow execution completed",
      });
    }

    // Map execution_failed to a failed log
    if (event.type === "execution_failed") {
      const error = event.data.error as string;

      // Update the workflow task to failed status
      const workflowTask = tasks.find(t => t.id === "workflow");
      if (workflowTask) {
        workflowTask.status = "failed";
        workflowTask.error = error;
      }

      logs.push({
        taskId: "workflow",
        event: "failed",
        timestamp: event.timestamp,
        message: "Workflow Failed",
        details: error || "Workflow execution failed",
      });
    }
  }

  return { logs, tasks };
}

/**
 * GET /api/workflows/[instanceId]
 *
 * Fetches workflow details from AgentSession table
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { instanceId } = await params;

  if (!instanceId) {
    return NextResponse.json(
      { error: "Instance ID is required" },
      { status: 400 }
    );
  }

  console.log(`[Workflow Detail] Looking up workflow with instanceId: ${instanceId}`);

  try {
    // First try to find by workflowId
    let session = await getAgentSessionByWorkflowId({ workflowId: instanceId });
    console.log(`[Workflow Detail] Lookup by workflowId: ${session ? "found" : "not found"}`);

    // If not found, try to find by session ID (instanceId might be the session ID)
    if (!session) {
      session = await getAgentSession({ id: instanceId });
      console.log(`[Workflow Detail] Lookup by session id: ${session ? "found" : "not found"}`);
    }

    if (!session) {
      console.log(`[Workflow Detail] Workflow not found for instanceId: ${instanceId}`);
      return NextResponse.json(
        {
          error: `Workflow "${instanceId}" not found`,
          details: "The workflow may have expired, been deleted, or the ID format may be incorrect. Try returning to the workflow list and selecting the workflow again.",
        },
        { status: 404 }
      );
    }

    console.log(`[Workflow Detail] Found session: id=${session.id}, workflowId=${session.workflowId}, status=${session.workflowStatus}`);

    // Fetch real-time status from planner-agent if we have a workflow ID
    let runtimeStatus: PlannerAgentStatusResponse | null = null;
    if (session.workflowId) {
      runtimeStatus = await fetchPlannerAgentStatus(session.workflowId);
    }

    // Fetch workflow events from Redis and transform to execution logs + synthetic tasks
    const workflowId = session.workflowId || session.id;
    const redisEvents = await getWorkflowEvents(workflowId);
    const { logs: executionLogs, tasks: syntheticTasks } = transformEventsToExecutionData(redisEvents);

    // Merge session task plan with synthetic tasks from events
    // Synthetic tasks provide input data for phases like "clone", "exploration", etc.
    const sessionTasks = session.taskPlan && Array.isArray(session.taskPlan)
      ? (session.taskPlan as Array<{ id: string; title: string; description: string; status: string }>).map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          status: t.status as "pending" | "in_progress" | "completed" | "failed" | "skipped",
        }))
      : [];

    // Combine both: synthetic tasks first (for phase events), then session tasks (for actual plan tasks)
    const allTasks = [...syntheticTasks, ...sessionTasks];

    // Build workflow entry
    const workflow: WorkflowEntry & {
      workflowType?: string;
      source?: string;
      customStatus?: {
        phase?: string;
        progress?: number;
        message?: string;
        plan_id?: string;
      };
      sessionTitle?: string;
      sessionId?: string;
    } = {
      id: session.workflowId || session.id,
      status: mapStatus(session.workflowStatus, runtimeStatus?.runtime_status),
      createdAt: session.createdAt?.toISOString?.() ||
        (typeof session.createdAt === "string" ? session.createdAt : new Date().toISOString()),
      updatedAt: session.updatedAt?.toISOString?.() ||
        (typeof session.updatedAt === "string" ? session.updatedAt : new Date().toISOString()),
      request: {
        prompt: session.title,
        submittedAt: session.createdAt?.toISOString?.() ||
          (typeof session.createdAt === "string" ? session.createdAt : new Date().toISOString()),
      },
      // Include merged task plan (synthetic tasks + session tasks)
      plan: allTasks.length > 0 ? {
        id: session.id,
        title: session.title,
        summary: "Planning and execution workflow",
        tasks: allTasks,
      } : undefined,
      // Include execution logs from Redis events
      execution: executionLogs.length > 0 ? {
        currentTaskIndex: executionLogs.length - 1,
        logs: executionLogs,
        completedTasks: executionLogs.filter(l => l.event === "completed").map(l => l.taskId),
        failedTasks: executionLogs.filter(l => l.event === "failed").map(l => l.taskId),
        skippedTasks: [],
      } : undefined,
      // Pattern-specific fields
      workflowType: "planningAndExecutionWorkflow",
      source: "planner-agent",
      sessionTitle: session.title,
      sessionId: session.id,
    };

    // Add custom status if available from planner-agent
    if (runtimeStatus?.custom_status) {
      workflow.customStatus = runtimeStatus.custom_status;
    }

    return NextResponse.json({ workflow });
  } catch (error) {
    console.error(`[Workflow Detail] Error fetching workflow:`, error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch workflow",
      },
      { status: 500 }
    );
  }
}
