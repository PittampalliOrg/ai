import { NextResponse } from "next/server";
import { getAgentSession } from "@/lib/db/agent-queries";
import { getWorkflowBuilderExecutionDetail } from "@/lib/workflow-builder-client";

async function resolveExecutionId(instanceId: string): Promise<string | null> {
  const directDetail = await getWorkflowBuilderExecutionDetail(instanceId).catch(() => null);
  if (directDetail?.execution?.id) {
    return directDetail.execution.id;
  }

  const session = await getAgentSession({ id: instanceId }).catch(() => null);
  const linkedExecutionId = session?.workflowId?.trim();
  if (!linkedExecutionId) {
    return null;
  }

  const linkedDetail = await getWorkflowBuilderExecutionDetail(linkedExecutionId).catch(() => null);
  return linkedDetail?.execution?.id || linkedExecutionId;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<unknown> },
) {
  const { instanceId, path } = (await params) as {
    instanceId: string;
    path: string[];
  };
  const executionId = await resolveExecutionId(instanceId);

  if (!executionId) {
    return NextResponse.json(
      { error: `Workflow with ID "${instanceId}" not found` },
      { status: 404 },
    );
  }

  const filePath = Array.isArray(path)
    ? path.map((segment) => segment.trim()).filter(Boolean).join("/")
    : "";

  if (!filePath) {
    return NextResponse.json({ error: "File path is required" }, { status: 400 });
  }

  return NextResponse.json(
    {
      success: true,
      executionId,
      path: filePath,
      snapshot: null,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
