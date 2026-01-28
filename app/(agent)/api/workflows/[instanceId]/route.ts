/**
 * Workflow Detail API
 *
 * GET /api/workflows/[instanceId]
 * Fetches workflow details from:
 * 1. AgentSession table (DB) for session metadata
 * 2. Planner-orchestrator status endpoint (Dapr) for live phase/progress
 * 3. Planner-orchestrator tasks endpoint (Dapr) for task list with dependencies
 *
 * Benefits of Dapr service invocation:
 * - Automatic mTLS encryption between services
 * - Built-in retries and circuit breakers
 * - Distributed tracing for observability
 * - Service discovery via app-id (no hardcoded URLs)
 */

import { NextResponse, type NextRequest } from "next/server";
import type { WorkflowEntry, PlanTask } from "@/lib/types/workflow";
import { getAgentSessionByWorkflowId, getAgentSession } from "@/lib/db/agent-queries";
import { invokeService } from "@/lib/dapr/client";

// Planner orchestrator Dapr app ID
// Use namespace-qualified app ID for cross-namespace Dapr invocation
const PLANNER_ORCHESTRATOR_APP_ID = process.env.PLANNER_AGENT_APP_ID || "planner-orchestrator.planner-agent";

interface RouteParams {
  params: Promise<{ instanceId: string }>;
}

/**
 * Orchestrator status response (flat format)
 */
interface OrchestratorStatusResponse {
  workflow_id: string;
  runtime_status: string;
  phase?: string;
  progress?: number;
  message?: string;
  output?: unknown;
  error?: string;
}

/**
 * Orchestrator task from the tasks endpoint
 */
interface OrchestratorTask {
  id: string;
  subject: string;
  description: string;
  activeForm?: string;
  status: string;
  blocks?: string[];
  blockedBy?: string[];
}

/**
 * Orchestrator tasks response
 */
interface OrchestratorTasksResponse {
  workflow_id: string;
  tasks: OrchestratorTask[];
  count: number;
}

/**
 * Fetch workflow status from planner-orchestrator via Dapr service invocation
 */
async function fetchOrchestratorStatus(
  workflowId: string
): Promise<OrchestratorStatusResponse | null> {
  try {
    const response = await invokeService<OrchestratorStatusResponse>({
      appId: PLANNER_ORCHESTRATOR_APP_ID,
      method: "GET",
      path: `/api/workflows/${workflowId}/status`,
      timeout: 10000,
    });

    if (response.ok && response.data) {
      return response.data;
    }
    return null;
  } catch (error) {
    console.error(`[Workflow Detail] Failed to fetch status for ${workflowId}:`, error);
    return null;
  }
}

/**
 * Fetch workflow tasks from planner-orchestrator via Dapr service invocation
 */
async function fetchOrchestratorTasks(
  workflowId: string
): Promise<OrchestratorTasksResponse | null> {
  try {
    const response = await invokeService<OrchestratorTasksResponse>({
      appId: PLANNER_ORCHESTRATOR_APP_ID,
      method: "GET",
      path: `/api/workflows/${workflowId}/tasks`,
      timeout: 10000,
    });

    if (response.ok && response.data) {
      return response.data;
    }
    return null;
  } catch (error) {
    console.error(`[Workflow Detail] Failed to fetch tasks for ${workflowId}:`, error);
    return null;
  }
}

/**
 * Map orchestrator runtime_status to internal WorkflowEntry status
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

/**
 * Map orchestrator phase to a more specific WorkflowEntry status
 */
function mapPhaseToStatus(
  phase: string | undefined,
  runtimeStatus: string | undefined,
  dbStatus: string | null
): WorkflowEntry["status"] {
  // If phase is available, use it for more granular status
  if (phase) {
    switch (phase) {
      case "planning":
        return "PLANNING";
      case "awaiting_approval":
        return "AWAITING_APPROVAL";
      case "executing":
        return "EXECUTING";
      case "completed":
        return "COMPLETED";
      case "failed":
        return "FAILED";
    }
  }
  // Fall back to runtime status mapping
  return mapStatus(dbStatus, runtimeStatus);
}

/**
 * Transform orchestrator tasks to PlanTask format
 */
function transformOrchestratorTasks(tasks: OrchestratorTask[]): PlanTask[] {
  return tasks.map((t) => ({
    id: t.id,
    title: t.subject,
    subject: t.subject,
    description: t.description,
    status: (t.status as PlanTask["status"]) || "pending",
    blocks: t.blocks,
    blockedBy: t.blockedBy,
  }));
}

/**
 * GET /api/workflows/[instanceId]
 *
 * Fetches workflow details from DB + orchestrator (parallel Dapr calls)
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
    // Try DB lookup (may fail for non-UUID orchestrator IDs)
    let session = null;
    try {
      session = await getAgentSessionByWorkflowId({ workflowId: instanceId });
      console.log(`[Workflow Detail] Lookup by workflowId: ${session ? "found" : "not found"}`);

      if (!session) {
        session = await getAgentSession({ id: instanceId });
        console.log(`[Workflow Detail] Lookup by session id: ${session ? "found" : "not found"}`);
      }
    } catch (dbError) {
      // DB lookup may fail for non-UUID workflow IDs (e.g., "planner-xxxx" from orchestrator)
      console.log(`[Workflow Detail] DB lookup failed (non-UUID ID?): ${dbError instanceof Error ? dbError.message : dbError}`);
    }

    if (session) {
      console.log(`[Workflow Detail] Found session: id=${session.id}, workflowId=${session.workflowId}, status=${session.workflowStatus}`);
    }

    // Fetch orchestrator status and tasks in parallel via Dapr service invocation
    const workflowId = session?.workflowId || instanceId;
    const [orchestratorStatus, orchestratorTasks] = await Promise.all([
      fetchOrchestratorStatus(workflowId),
      fetchOrchestratorTasks(workflowId),
    ]);

    // If neither DB session nor orchestrator has data, return 404
    if (!session && !orchestratorStatus) {
      console.log(`[Workflow Detail] Workflow not found for instanceId: ${instanceId}`);
      return NextResponse.json(
        {
          error: `Workflow "${instanceId}" not found`,
          details: "The workflow may have expired, been deleted, or the ID format may be incorrect. Try returning to the workflow list and selecting the workflow again.",
        },
        { status: 404 }
      );
    }

    // Transform orchestrator tasks to PlanTask format
    const planTasks: PlanTask[] = orchestratorTasks?.tasks
      ? transformOrchestratorTasks(orchestratorTasks.tasks)
      : [];

    // Fall back to session task plan if orchestrator has no tasks
    if (planTasks.length === 0 && session?.taskPlan && Array.isArray(session.taskPlan)) {
      const sessionTasks = (session.taskPlan as Array<{ id: string; title: string; subject?: string; description: string; status: string; blocks?: string[]; blockedBy?: string[] }>);
      for (const t of sessionTasks) {
        planTasks.push({
          id: t.id,
          title: t.subject || t.title,
          subject: t.subject || t.title,
          description: t.description,
          status: t.status as PlanTask["status"],
          blocks: t.blocks,
          blockedBy: t.blockedBy,
        });
      }
    }

    // Map status using orchestrator phase for granularity
    const status = mapPhaseToStatus(
      orchestratorStatus?.phase,
      orchestratorStatus?.runtime_status,
      session?.workflowStatus ?? null
    );

    const now = new Date().toISOString();

    // Build workflow entry (works with or without DB session)
    const workflow: WorkflowEntry & {
      workflowType?: string;
      source?: string;
      customStatus?: {
        phase?: string;
        progress?: number;
        message?: string;
      };
      sessionTitle?: string;
      sessionId?: string;
    } = {
      id: workflowId,
      status,
      createdAt: session?.createdAt?.toISOString?.() ||
        (typeof session?.createdAt === "string" ? session.createdAt : now),
      updatedAt: session?.updatedAt?.toISOString?.() ||
        (typeof session?.updatedAt === "string" ? session.updatedAt : now),
      request: {
        prompt: session?.title || orchestratorStatus?.message || workflowId,
        submittedAt: session?.createdAt?.toISOString?.() ||
          (typeof session?.createdAt === "string" ? session.createdAt : now),
      },
      // Include task plan from orchestrator
      plan: planTasks.length > 0 ? {
        id: session?.id || workflowId,
        title: session?.title || orchestratorStatus?.message || "Workflow Plan",
        summary: orchestratorStatus?.message || "Planning and execution workflow",
        tasks: planTasks,
      } : undefined,
      // Pattern-specific fields
      workflowType: "planningAndExecutionWorkflow",
      source: "planner-orchestrator",
      sessionTitle: session?.title,
      sessionId: session?.id,
    };

    // Add custom status if available from orchestrator
    if (orchestratorStatus) {
      workflow.customStatus = {
        phase: orchestratorStatus.phase,
        progress: orchestratorStatus.progress,
        message: orchestratorStatus.message,
      };
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
