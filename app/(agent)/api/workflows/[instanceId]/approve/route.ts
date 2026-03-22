import { NextResponse, type NextRequest } from "next/server";
import { getAgentSession } from "@/lib/db/agent-queries";
import {
  approveWorkflowBuilderExecution,
  getWorkflowBuilderExecutionStatus,
} from "@/lib/workflow-builder-client";

interface RouteParams {
  params: Promise<{ instanceId: string }>;
}

interface ApproveWorkflowRequest {
  approved?: boolean;
  comments?: string;
  approvedBy?: string;
}

interface ApproveWorkflowResponse {
  success: boolean;
  workflowId: string;
  status?: string;
  message?: string;
  error?: string;
}

async function getWorkflowBuilderExecutionId(instanceId: string) {
  const directStatus = await getWorkflowBuilderExecutionStatus(instanceId);
  if (directStatus) {
    return directStatus.execution.id;
  }

  const session = await getAgentSession({ id: instanceId }).catch(() => null);
  const linkedExecutionId = session?.workflowId?.trim();
  if (!linkedExecutionId) {
    return null;
  }

  const linkedStatus = await getWorkflowBuilderExecutionStatus(linkedExecutionId);
  return linkedStatus?.execution.id ?? null;
}

/**
 * POST /api/workflows/[instanceId]/approve
 *
 * Approves or rejects a workflow-builder execution.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { instanceId } = await params;

  if (!instanceId) {
    return NextResponse.json(
      {
        success: false,
        workflowId: "",
        error: "Instance ID is required",
      } satisfies ApproveWorkflowResponse,
      { status: 400 },
    );
  }

  let requestBody: ApproveWorkflowRequest = {};

  try {
    const text = await request.text();
    if (text) {
      requestBody = JSON.parse(text);
    }
  } catch {
    return NextResponse.json(
      {
        success: false,
        workflowId: instanceId,
        error: "Invalid JSON body",
      } satisfies ApproveWorkflowResponse,
      { status: 400 },
    );
  }

  const isApproval = requestBody.approved !== false;

  try {
    const workflowBuilderExecutionId = await getWorkflowBuilderExecutionId(instanceId);
    if (!workflowBuilderExecutionId) {
      return NextResponse.json(
        {
          success: false,
          workflowId: instanceId,
          error: `Workflow with ID "${instanceId}" not found`,
        } satisfies ApproveWorkflowResponse,
        { status: 404 },
      );
    }

    const approvedBy =
      requestBody.approvedBy ||
      request.headers.get("x-user-email") ||
      request.headers.get("x-user-id") ||
      undefined;

    await approveWorkflowBuilderExecution({
      executionId: workflowBuilderExecutionId,
      approved: isApproval,
      reason: requestBody.comments,
      approvedBy: approvedBy || undefined,
    });

    return NextResponse.json({
      success: true,
      workflowId: workflowBuilderExecutionId,
      status: isApproval ? "APPROVED" : "REJECTED",
      message: isApproval ? "Plan approved, execution starting" : "Plan rejected",
    } satisfies ApproveWorkflowResponse);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        workflowId: instanceId,
        error:
          error instanceof Error ? error.message : "Workflow approval request failed",
      } satisfies ApproveWorkflowResponse,
      { status: 502 },
    );
  }
}
