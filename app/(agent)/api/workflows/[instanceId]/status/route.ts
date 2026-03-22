import { NextResponse, type NextRequest } from "next/server";
import { getAgentSession } from "@/lib/db/agent-queries";
import {
  getWorkflowBuilderExecutionStatus,
} from "@/lib/workflow-builder-client";

interface RouteParams {
  params: Promise<{ instanceId: string }>;
}

interface WorkflowStatusResponse {
  success: boolean;
  instance_id: string;
  runtime_status: string | null;
  custom_status:
    | {
        phase?: string;
        progress?: number;
        message?: string;
        [key: string]: unknown;
      }
    | null;
  created_at: string | null;
  last_updated_at: string | null;
  error: string | null;
}

async function getWorkflowBuilderStatus(instanceId: string) {
  const directStatus = await getWorkflowBuilderExecutionStatus(instanceId);
  if (directStatus) {
    return directStatus;
  }

  const session = await getAgentSession({ id: instanceId }).catch(() => null);
  const linkedExecutionId = session?.workflowId?.trim();
  if (!linkedExecutionId) {
    return null;
  }

  return getWorkflowBuilderExecutionStatus(linkedExecutionId);
}

/**
 * GET /api/workflows/[instanceId]/status
 *
 * Returns workflow-builder execution status.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { instanceId } = await params;

  if (!instanceId) {
    return NextResponse.json(
      { error: "Instance ID is required" },
      { status: 400 },
    );
  }

  try {
    const workflowBuilderStatus = await getWorkflowBuilderStatus(instanceId);
    if (!workflowBuilderStatus) {
      return NextResponse.json(
        {
          success: false,
          instance_id: instanceId,
          runtime_status: null,
          custom_status: null,
          created_at: null,
          last_updated_at: null,
          error: "Workflow not found",
        } satisfies WorkflowStatusResponse,
      );
    }

    return NextResponse.json({
      success: true,
      instance_id: workflowBuilderStatus.execution.id,
      runtime_status:
        workflowBuilderStatus.runtime?.runtimeStatus ||
        workflowBuilderStatus.execution.status ||
        null,
      custom_status: {
        phase:
          workflowBuilderStatus.runtime?.phase ||
          workflowBuilderStatus.execution.phase ||
          undefined,
        progress:
          workflowBuilderStatus.runtime?.progress ??
          workflowBuilderStatus.execution.progress ??
          undefined,
        message:
          workflowBuilderStatus.runtime?.message ||
          workflowBuilderStatus.execution.error ||
          undefined,
      },
      created_at:
        workflowBuilderStatus.runtime?.startedAt ||
        workflowBuilderStatus.execution.startedAt,
      last_updated_at:
        workflowBuilderStatus.runtime?.completedAt ||
        workflowBuilderStatus.execution.completedAt,
      error:
        workflowBuilderStatus.runtime?.error ||
        workflowBuilderStatus.execution.error ||
        null,
    } satisfies WorkflowStatusResponse);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        instance_id: instanceId,
        runtime_status: null,
        custom_status: null,
        created_at: null,
        last_updated_at: null,
        error:
          error instanceof Error
            ? error.message
            : "Workflow status request failed",
      } satisfies WorkflowStatusResponse,
      { status: 502 },
    );
  }
}
