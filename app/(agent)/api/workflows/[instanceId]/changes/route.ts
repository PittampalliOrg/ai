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
  _request: Request,
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

  const changeData = parseExecutionFileChangeData(detail.execution.output);
  if (!changeData) {
    return NextResponse.json(
      {
        success: true,
        executionId: detail.execution.id,
        count: 0,
        changes: [],
        pending: detail.execution.status === "running" || detail.execution.status === "pending",
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  return NextResponse.json(
    {
      success: true,
      executionId: detail.execution.id,
      count: 1,
      changes: [
        {
          changeSetId: `derived:${detail.execution.id}:${changeData.sourceNodeKey ?? "execution"}`,
          executionId: detail.execution.id,
          workspaceRef: detail.execution.output?.sandboxName || "workspace",
          durableInstanceId: changeData.durableInstanceId,
          operation: changeData.patch ? "execution-output" : "derived-output",
          sequence: 1,
          format: "git-unified-v1",
          sha256: changeData.patchRef || `derived:${detail.execution.id}`,
          filesChanged: changeData.stats?.files ?? changeData.files.length,
          additions: changeData.stats?.additions ?? 0,
          deletions: changeData.stats?.deletions ?? 0,
          bytes: changeData.patch ? Buffer.byteLength(changeData.patch, "utf8") : 0,
          compressed: false,
          storageRef: changeData.patchRef || `derived:${detail.execution.id}`,
          createdAt: detail.execution.startedAt,
          includeInExecutionPatch: Boolean(changeData.patch || changeData.patchRef),
          truncated: false,
          originalBytes: changeData.patch ? Buffer.byteLength(changeData.patch, "utf8") : 0,
          files: changeData.files,
          baseRevision: undefined,
          headRevision: changeData.durableInstanceId,
        },
      ],
      pending: detail.execution.status === "running" || detail.execution.status === "pending",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
