import { NextResponse, type NextRequest } from "next/server";
import { getAgentSession } from "@/lib/db/agent-queries";
import { getWorkflowBuilderExecutionDetail } from "@/lib/workflow-builder-client";

interface RouteParams {
  params: Promise<{ instanceId: string }>;
}

interface OrchestratorTask {
  id: string;
  subject: string;
  description: string;
  activeForm?: string;
  status: string;
  blocks?: string[];
  blockedBy?: string[];
}

interface WorkflowTasksResponse {
  workflow_id: string;
  tasks: OrchestratorTask[];
  count: number;
}

async function getWorkflowBuilderDetail(instanceId: string) {
  const directDetail = await getWorkflowBuilderExecutionDetail(instanceId);
  if (directDetail) {
    return directDetail;
  }

  const session = await getAgentSession({ id: instanceId }).catch(() => null);
  const linkedExecutionId = session?.workflowId?.trim();
  if (!linkedExecutionId) {
    return null;
  }

  return getWorkflowBuilderExecutionDetail(linkedExecutionId);
}

/**
 * Returns plan tasks from the workflow-builder plan artifact.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { instanceId } = await params;

  if (!instanceId) {
    return NextResponse.json(
      { error: "Instance ID is required" },
      { status: 400 }
    );
  }

  try {
    const detail = await getWorkflowBuilderDetail(instanceId);
    if (!detail) {
      return NextResponse.json(
        { error: `Workflow with ID "${instanceId}" not found` },
        { status: 404 }
      );
    }

    const tasks = deriveTasksFromPlanArtifact(detail.planArtifact?.planJson);
    return NextResponse.json({
      workflow_id: detail.execution.id,
      tasks,
      count: tasks.length,
    } satisfies WorkflowTasksResponse);
  } catch (error) {
    console.error(`[Workflow Tasks] Error fetching tasks:`, error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}

function deriveTasksFromPlanArtifact(planJson: unknown): OrchestratorTask[] {
  if (!planJson || typeof planJson !== "object") {
    return [];
  }

  const tasks = (planJson as Record<string, unknown>).tasks;
  if (!Array.isArray(tasks)) {
    return [];
  }

  return tasks
    .filter((task) => task && typeof task === "object")
    .map((task) => {
      const record = task as Record<string, unknown>;
      return {
        id: String(record.id ?? ""),
        subject: String(record.subject ?? record.title ?? ""),
        description: String(record.description ?? ""),
        status: String(record.status ?? "pending"),
        blocks: Array.isArray(record.blocks)
          ? record.blocks.map((value) => String(value))
          : undefined,
        blockedBy: Array.isArray(record.blockedBy)
          ? record.blockedBy.map((value) => String(value))
          : undefined,
      };
    })
    .filter((task) => Boolean(task.id && task.subject));
}
