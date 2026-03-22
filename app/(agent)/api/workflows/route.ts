import { NextRequest, NextResponse } from "next/server";
import type { WorkflowListItem, WorkflowStatus } from "@/lib/types/workflow";
import { getConfig } from "@/lib/dapr/config-provider";
import { listWorkflowBuilderExecutions } from "@/lib/workflow-builder-client";

function getConfiguredAgentWorkflowIdentity(): {
  workflowId?: string;
  workflowName?: string;
} {
  const workflowId = getConfig(
    "WORKFLOW_BUILDER_AGENT_WORKFLOW_ID",
    "aicodingagent001",
  ).trim();
  const workflowName = getConfig(
    "WORKFLOW_BUILDER_AGENT_WORKFLOW_NAME",
    "AI Coding Agent",
  ).trim();

  return {
    ...(workflowId ? { workflowId } : {}),
    ...(!workflowId && workflowName ? { workflowName } : {}),
  };
}

function mapExecutionToWorkflowStatus(execution: {
  status: string;
  phase: string | null;
}): WorkflowStatus {
  const phase = execution.phase?.toLowerCase() ?? "";
  const status = execution.status.toLowerCase();

  if (phase === "awaiting_approval") {
    return "AWAITING_APPROVAL";
  }
  if (phase === "planning") {
    return "PLANNING";
  }
  if (status === "success" || phase === "completed") {
    return "COMPLETED";
  }
  if (status === "error" || phase === "failed") {
    return "FAILED";
  }
  if (status === "cancelled" || phase === "cancelled" || phase === "rejected") {
    return "REJECTED";
  }
  return "EXECUTING";
}

function matchesRequestedStatus(
  workflow: WorkflowListItem,
  requestedStatus: string | null,
): boolean {
  if (!requestedStatus) {
    return true;
  }

  const requested = requestedStatus
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

  return requested.length === 0 || requested.includes(workflow.status);
}

/**
 * GET /api/workflows
 *
 * Lists workflow-builder coding-agent executions.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);
  const requestedStatus = searchParams.get("status");
  const source = searchParams.get("source");

  if (source && !["all", "workflow-builder", "orchestrator"].includes(source)) {
    return NextResponse.json({
      workflows: [],
      total: 0,
      limit,
      offset,
    });
  }

  try {
    const workflowIdentity = getConfiguredAgentWorkflowIdentity();
    const fetchWindow = Math.max(limit + offset, 100);
    const result = await listWorkflowBuilderExecutions({
      ...workflowIdentity,
      limit: fetchWindow,
      offset: 0,
    });

    const workflows = result.executions
      .map<WorkflowListItem>((execution) => {
        const status = mapExecutionToWorkflowStatus(execution);
        return {
          instanceId: execution.id,
          topic: execution.workflow.name || "AI Coding Agent",
          status,
          createdAt: execution.startedAt,
          updatedAt: execution.completedAt || execution.startedAt,
          planStepsCount: 0,
          planStepsCompleted: 0,
          taskCount: 0,
          source: "workflow-builder" as const,
        };
      })
      .filter((workflow) => matchesRequestedStatus(workflow, requestedStatus))
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

    return NextResponse.json({
      workflows: workflows.slice(offset, offset + limit),
      total: workflows.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error("[Workflows List] Error:", error);
    return NextResponse.json(
      {
        workflows: [],
        total: 0,
        limit,
        offset,
        error:
          error instanceof Error
            ? error.message
            : "Cannot fetch workflow executions",
      },
      { status: 502 },
    );
  }
}
