import { NextResponse } from "next/server";
import { getAgentSession } from "@/lib/db/agent-queries";
import { parseExecutionFileChangeData } from "@/lib/workflow-change-artifacts";
import { getWorkflowBuilderExecutionDetail } from "@/lib/workflow-builder-client";

async function resolveExecutionDetail(instanceId: string) {
  const directDetail = await getWorkflowBuilderExecutionDetail(instanceId).catch(() => null);
  if (directDetail) {
    return directDetail;
  }

  const session = await getAgentSession({ id: instanceId }).catch(() => null);
  const linkedExecutionId = session?.workflowId?.trim();
  if (!linkedExecutionId) {
    return null;
  }

  return getWorkflowBuilderExecutionDetail(linkedExecutionId).catch(() => null);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<unknown> },
) {
  const { instanceId } = (await params) as { instanceId: string };
  const detail = await resolveExecutionDetail(instanceId);

  if (!detail) {
    return NextResponse.json(
      { error: `Workflow with ID "${instanceId}" not found` },
      { status: 404 },
    );
  }

  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  const changeData = parseExecutionFileChangeData(detail.execution.output);
  const patch = changeData?.patch ?? "";

  if (format === "raw") {
    return new Response(patch, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json(
    {
      success: true,
      executionId: detail.execution.id,
      durableInstanceId: changeData?.durableInstanceId,
      patch,
      changeSets: changeData
        ? [
            {
              changeSetId: `derived:${detail.execution.id}:${changeData.sourceNodeKey ?? "execution"}`,
              files: changeData.files,
            },
          ]
        : [],
      pending: detail.execution.status === "running" || detail.execution.status === "pending",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
