import { type NextRequest } from "next/server";
import { getAgentSession } from "@/lib/db/agent-queries";
import {
  getWorkflowBuilderExecutionDetail,
  getWorkflowBuilderExecutionStatus,
} from "@/lib/workflow-builder-client";

export const maxDuration = 1800;

const WORKFLOW_BUILDER_TERMINAL_STATUSES = new Set([
  "COMPLETED",
  "FAILED",
  "TERMINATED",
  "CANCELLED",
  "REJECTED",
]);

type WorkflowBuilderDetail = NonNullable<
  Awaited<ReturnType<typeof getWorkflowBuilderExecutionDetail>>
>;

type WorkflowStreamEvent = {
  id: string;
  type: string;
  workflowId: string;
  taskId?: string;
  data: Record<string, unknown>;
  timestamp: string;
};

interface RouteParams {
  params: Promise<{ instanceId: string }>;
}

function emitSse(
  controller: ReadableStreamDefaultController<Uint8Array>,
  data: unknown,
) {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

async function resolveWorkflowBuilderExecutionId(instanceId: string) {
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

function buildWorkflowBuilderPlanEvents(detail: WorkflowBuilderDetail) {
  const artifact = detail.planArtifact;
  if (!artifact || !artifact.planJson || typeof artifact.planJson !== "object") {
    return [];
  }

  const planJson = artifact.planJson as Record<string, unknown>;
  const tasks = Array.isArray(planJson.tasks) ? planJson.tasks : [];
  const createdAt = artifact.createdAt || detail.execution.startedAt;
  const events: WorkflowStreamEvent[] = [
    {
      id: `plan-created:${artifact.id}`,
      type: "plan_created",
      workflowId: detail.execution.id,
      data: {
        status: "Plan created",
      },
      timestamp: createdAt,
    },
  ];

  for (const task of tasks) {
    if (!task || typeof task !== "object") {
      continue;
    }

    const record = task as Record<string, unknown>;
    const taskId = String(record.id ?? "").trim();
    const subject = String(record.subject ?? record.title ?? "").trim();
    if (!taskId || !subject) {
      continue;
    }

    const taskStatus = String(record.status ?? "pending").toLowerCase();
    events.push({
      id: `task-created:${artifact.id}:${taskId}`,
      type: "task_created",
      workflowId: detail.execution.id,
      taskId,
      data: {
        task: {
          id: taskId,
          subject,
          description: String(record.description ?? "").trim(),
          status:
            taskStatus === "completed"
              ? "completed"
              : taskStatus === "in_progress"
                ? "in_progress"
                : "pending",
          blocks: Array.isArray(record.blocks)
            ? record.blocks.map((value) => String(value))
            : [],
          blockedBy: Array.isArray(record.blockedBy)
            ? record.blockedBy.map((value) => String(value))
            : [],
        },
      },
      timestamp: createdAt,
    });
  }

  return events;
}

function mapWorkflowBuilderTimelineEvent(
  detail: WorkflowBuilderDetail,
  event: WorkflowBuilderDetail["timeline"][number],
): WorkflowStreamEvent | null {
  const workflowId = detail.execution.id;
  switch (event.kind) {
    case "node_started":
    case "child_run_scheduled":
      return {
        id: event.id,
        type: "phase_started",
        workflowId,
        taskId: event.nodeId || undefined,
        data: {
          phase: detail.runtime?.phase || detail.execution.phase || "running",
          status: event.label,
          progress: detail.runtime?.progress ?? detail.execution.progress ?? undefined,
        },
        timestamp: event.ts,
      };
    case "node_completed":
    case "child_run_completed":
      return {
        id: event.id,
        type: "phase_completed",
        workflowId,
        taskId: event.nodeId || undefined,
        data: {
          phase: detail.runtime?.phase || detail.execution.phase || "running",
          status: event.label,
          progress: detail.runtime?.progress ?? detail.execution.progress ?? undefined,
        },
        timestamp: event.ts,
      };
    case "node_failed":
    case "child_run_failed":
    case "workflow_failed":
      return {
        id: event.id,
        type: "phase_failed",
        workflowId,
        taskId: event.nodeId || undefined,
        data: {
          phase: detail.runtime?.phase || detail.execution.phase || "failed",
          status: event.label,
          error:
            event.error ||
            detail.execution.error ||
            detail.runtime?.error ||
            "Workflow failed",
          progress: detail.runtime?.progress ?? detail.execution.progress ?? undefined,
        },
        timestamp: event.ts,
      };
    case "approval_requested":
      return {
        id: event.id,
        type: "status",
        workflowId,
        taskId: event.nodeId || undefined,
        data: {
          status: "Waiting for plan approval",
          phase: "awaiting_approval",
          progress: detail.runtime?.progress ?? detail.execution.progress ?? undefined,
        },
        timestamp: event.ts,
      };
    case "approval_responded":
      return {
        id: event.id,
        type: "status",
        workflowId,
        taskId: event.nodeId || undefined,
        data: {
          status: event.label,
          phase: detail.runtime?.phase || detail.execution.phase || "executing",
          progress: detail.runtime?.progress ?? detail.execution.progress ?? undefined,
        },
        timestamp: event.ts,
      };
    case "workflow_completed":
      return {
        id: event.id,
        type: "execution_completed",
        workflowId,
        data: {
          status: event.label,
          phase: "completed",
          progress: 100,
        },
        timestamp: event.ts,
      };
    default:
      return null;
  }
}

async function streamWorkflowBuilderExecution(
  executionId: string,
): Promise<Response> {
  const stream = new ReadableStream({
    async start(controller) {
      const sentIds = new Set<string>();
      let detail = await getWorkflowBuilderExecutionDetail(executionId);
      let previousStatusSignature = "";
      let pollCount = 0;

      try {
        if (!detail) {
          emitSse(controller, {
            id: `error-${Date.now()}`,
            type: "error",
            workflowId: executionId,
            data: { error: "Workflow execution not found" },
            timestamp: new Date().toISOString(),
          });
          return;
        }

        while (true) {
          const statusSnapshot = await getWorkflowBuilderExecutionStatus(executionId);
          if (!statusSnapshot) {
            emitSse(controller, {
              id: `error-${Date.now()}`,
              type: "error",
              workflowId: executionId,
              data: { error: "Workflow execution not found" },
              timestamp: new Date().toISOString(),
            });
            break;
          }

          const runtimeStatus =
            statusSnapshot.runtime?.runtimeStatus ||
            statusSnapshot.execution.status.toUpperCase();
          const statusSignature = JSON.stringify({
            runtimeStatus,
            phase:
              statusSnapshot.runtime?.phase || statusSnapshot.execution.phase || null,
            progress:
              statusSnapshot.runtime?.progress ??
              statusSnapshot.execution.progress ??
              null,
            message:
              statusSnapshot.runtime?.message ||
              statusSnapshot.execution.error ||
              null,
          });
          const shouldRefreshDetail =
            pollCount === 0 ||
            statusSignature !== previousStatusSignature ||
            pollCount % 10 === 0 ||
            WORKFLOW_BUILDER_TERMINAL_STATUSES.has(runtimeStatus);

          if (shouldRefreshDetail) {
            const latestDetail = await getWorkflowBuilderExecutionDetail(executionId);
            if (latestDetail) {
              detail = latestDetail;
            }
          }

          const initialId = `initial:${detail.execution.id}`;
          if (!sentIds.has(initialId)) {
            sentIds.add(initialId);
            emitSse(controller, {
              id: initialId,
              type: "initial",
              workflowId: detail.execution.id,
              data: {
                status:
                  detail.runtime?.runtimeStatus ||
                  detail.execution.status.toUpperCase(),
                content:
                  detail.runtime?.message ||
                  detail.execution.error ||
                  "Workflow execution started",
              },
              timestamp: detail.execution.startedAt,
            });
          }

          if (pollCount > 0 && statusSignature !== previousStatusSignature) {
            emitSse(controller, {
              id: `status:${detail.execution.id}:${pollCount}`,
              type: "status",
              workflowId: detail.execution.id,
              data: {
                status: runtimeStatus,
                phase:
                  statusSnapshot.runtime?.phase ||
                  statusSnapshot.execution.phase ||
                  "running",
                progress:
                  statusSnapshot.runtime?.progress ??
                  statusSnapshot.execution.progress ??
                  undefined,
                message:
                  statusSnapshot.runtime?.message ||
                  statusSnapshot.execution.error ||
                  undefined,
              },
              timestamp: new Date().toISOString(),
            });
          }

          for (const event of buildWorkflowBuilderPlanEvents(detail)) {
            if (sentIds.has(event.id)) {
              continue;
            }
            sentIds.add(event.id);
            emitSse(controller, event);
          }

          const orderedTimeline = [...detail.timeline].sort((a, b) =>
            a.ts.localeCompare(b.ts),
          );
          for (const event of orderedTimeline) {
            if (sentIds.has(event.id)) {
              continue;
            }
            const mapped = mapWorkflowBuilderTimelineEvent(detail, event);
            if (!mapped) {
              continue;
            }
            sentIds.add(event.id);
            emitSse(controller, mapped);
          }

          if (WORKFLOW_BUILDER_TERMINAL_STATUSES.has(runtimeStatus)) {
            emitSse(controller, {
              id: `done:${detail.execution.id}`,
              type: "stream_done",
              workflowId: detail.execution.id,
              data: {
                status: runtimeStatus,
              },
              timestamp:
                detail.runtime?.completedAt ||
                detail.execution.completedAt ||
                new Date().toISOString(),
            });
            break;
          }

          previousStatusSignature = statusSignature;
          pollCount += 1;
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      } catch (error) {
        emitSse(controller, {
          id: `error-${Date.now()}`,
          type: "error",
          workflowId: executionId,
          data: {
            error: error instanceof Error ? error.message : "Stream failed",
          },
          timestamp: new Date().toISOString(),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { instanceId } = await params;

  if (!instanceId) {
    return new Response(JSON.stringify({ error: "Instance ID is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const workflowBuilderExecutionId = await resolveWorkflowBuilderExecutionId(instanceId);
  if (!workflowBuilderExecutionId) {
    return new Response(
      JSON.stringify({ error: `Workflow with ID "${instanceId}" not found` }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  console.log(
    `[Stream] Streaming workflow-builder execution ${workflowBuilderExecutionId}`,
  );
  return streamWorkflowBuilderExecution(workflowBuilderExecutionId);
}
