import { NextResponse, type NextRequest } from "next/server";
import { getAgentSession } from "@/lib/db/agent-queries";
import {
  getWorkflowBuilderExecutionDetail,
  toWorkflowEntry as toWorkflowBuilderEntry,
} from "@/lib/workflow-builder-client";

interface RouteParams {
  params: Promise<{ instanceId: string }>;
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
 * GET /api/workflows/[instanceId]
 *
 * Returns workflow-builder execution detail.
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
    const workflowBuilderDetail = await getWorkflowBuilderDetail(instanceId);
    if (!workflowBuilderDetail) {
      return NextResponse.json(
        { error: `Workflow with ID "${instanceId}" not found` },
        { status: 404 },
      );
    }

    return NextResponse.json({
      workflow: toWorkflowBuilderEntry(workflowBuilderDetail),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Workflow request failed",
      },
      { status: 502 },
    );
  }
}
