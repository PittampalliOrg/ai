/**
 * Dapr Pub/Sub Webhook: Workflow Stream Events
 *
 * POST /api/webhooks/dapr/workflow-stream
 * Receives workflow streaming events from the workflow.stream pub/sub topic.
 *
 * This webhook receives real-time events from agents (claude-code-agent, etc.)
 * and can be used to:
 * - Store events for later retrieval
 * - Forward to additional downstream systems
 * - Merge with SSE streams
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  storeWorkflowEvent,
  getWorkflowEvents,
  clearWorkflowEvents,
} from "@/lib/workflow-event-store";
import { updateAgentSessionWorkflowStatusByWorkflowId } from "@/lib/db/agent-queries";
import {
  getWorkflowBuilderExecutionDetail,
  listWorkflowBuilderExecutions,
} from "@/lib/workflow-builder-client";

// Re-export for other routes to use
export { getWorkflowEvents, clearWorkflowEvents };

// ============================================================================
// Types
// ============================================================================

interface WorkflowStreamEvent {
  id: string;
  type: string;
  workflowId: string;
  taskId?: string;
  agentId?: string;
  data: {
    // LLM chunk fields
    content?: string;
    text?: string;
    // Tool call/result fields
    toolName?: string;
    toolInput?: unknown;
    toolOutput?: string;
    result?: string;
    callId?: string;
    isError?: boolean;
    fullLength?: number;
    // Task/status fields
    status?: string;
    progress?: number;
    error?: string;
    // File change fields
    filePath?: string;
    operation?: string;
    // Metadata
    metadata?: Record<string, unknown>;
    // Allow other fields
    [key: string]: unknown;
  };
  timestamp: string;
}

interface DaprPubSubMessage {
  data?: unknown;
  datacontenttype?: string;
  id?: string;
  pubsubname?: string;
  source?: string;
  specversion?: string;
  topic?: string;
  time?: string;
  traceid?: string;
  traceparent?: string;
  tracestate?: string;
  type?: string;
}

interface DaprSweEventEnvelope {
  type: string;
  source?: string;
  timestamp?: string;
  datacontenttype?: string;
  data?: Record<string, unknown>;
}

type WorkflowBuilderExecutionDetail = NonNullable<
  Awaited<ReturnType<typeof getWorkflowBuilderExecutionDetail>>
>;

const DAPR_SWE_WORKFLOW_NAME =
  process.env.DAPR_SWE_WORKFLOW_NAME ?? "Resolve Issue (Dapr SWE Agents)";
const EXECUTION_CACHE_TTL_MS = 5 * 60 * 1000;
const issueExecutionCache = new Map<
  string,
  { executionId: string; expiresAt: number }
>();

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && value.trim() && !Number.isNaN(Number(value))
      ? Number(value)
      : null;
}

function getIssueReferenceParts(issueRef: string): {
  owner: string;
  repo: string;
  issueNumber: number;
} | null {
  const match = issueRef.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  if (!match) {
    return null;
  }

  return {
    owner: match[1],
    repo: match[2],
    issueNumber: Number(match[3]),
  };
}

function getIssueReferenceFromInput(input: Record<string, unknown>): string | null {
  const owner = asString(input.owner);
  const repo = asString(input.repo);
  const issueNumber = asNumber(input.issue_number);

  if (!owner || !repo || issueNumber === null) {
    return null;
  }

  return `${owner}/${repo}#${issueNumber}`;
}

function getIssueReferenceFromExecutionDetail(
  detail: WorkflowBuilderExecutionDetail,
): string | null {
  const candidates: Record<string, unknown>[] = [];
  const executionInput = asRecord(detail.execution.input);
  if (executionInput) {
    candidates.push(executionInput);
  }

  for (const timelineEvent of detail.timeline as Array<
    Record<string, unknown> & { input?: unknown }
  >) {
    const eventInput = asRecord(timelineEvent.input);
    if (!eventInput) {
      continue;
    }
    candidates.push(eventInput);

    const nestedInput = asRecord(eventInput.with);
    if (nestedInput) {
      candidates.push(nestedInput);
    }
  }

  const workflowRecord = asRecord(
    (detail.execution as unknown as Record<string, unknown>).workflow,
  );
  const workflowSpec = asRecord(workflowRecord?.spec);
  const workflowSteps = Array.isArray(workflowSpec?.do)
    ? workflowSpec.do
    : [];
  for (const step of workflowSteps) {
    const stepRecord = asRecord(step);
    if (!stepRecord) {
      continue;
    }

    for (const value of Object.values(stepRecord)) {
      const actionRecord = asRecord(value);
      const withInput = asRecord(actionRecord?.with);
      if (withInput) {
        candidates.push(withInput);
      }
    }
  }

  for (const candidate of candidates) {
    const issueRef = getIssueReferenceFromInput(candidate);
    if (issueRef) {
      return issueRef;
    }
  }

  return null;
}

async function resolveDaprSweExecutionId(
  issueRef: string,
  options?: { preferFresh?: boolean },
): Promise<string | null> {
  const preferFresh = options?.preferFresh ?? false;
  const cached = issueExecutionCache.get(issueRef);
  if (!preferFresh && cached && cached.expiresAt > Date.now()) {
    return cached.executionId;
  }

  const executions = await listWorkflowBuilderExecutions({
    limit: 20,
    workflowName: DAPR_SWE_WORKFLOW_NAME,
  });

  for (const execution of executions.executions) {
    const detail = await getWorkflowBuilderExecutionDetail(execution.id);
    if (!detail) {
      continue;
    }

    if (getIssueReferenceFromExecutionDetail(detail) !== issueRef) {
      continue;
    }

    issueExecutionCache.set(issueRef, {
      executionId: execution.id,
      expiresAt: Date.now() + EXECUTION_CACHE_TTL_MS,
    });
    return execution.id;
  }

  return null;
}

function extractWorkflowStreamEvent(
  body: DaprPubSubMessage | WorkflowStreamEvent | Record<string, unknown>,
): WorkflowStreamEvent | null {
  if (
    "workflowId" in body &&
    typeof body.workflowId === "string" &&
    "type" in body &&
    typeof body.type === "string"
  ) {
    return body as WorkflowStreamEvent;
  }

  if (!("data" in body) || typeof body.data !== "object" || body.data === null) {
    return null;
  }

  const envelopeData = body.data as Record<string, unknown>;
  if (
    "workflowId" in envelopeData &&
    typeof envelopeData.workflowId === "string" &&
    "type" in envelopeData &&
    typeof envelopeData.type === "string"
  ) {
    return envelopeData as unknown as WorkflowStreamEvent;
  }

  if (!("data" in envelopeData) || typeof envelopeData.data !== "object" || envelopeData.data === null) {
    return null;
  }

  const nestedData = envelopeData.data as Record<string, unknown>;
  if (
    "workflowId" in nestedData &&
    typeof nestedData.workflowId === "string" &&
    "type" in nestedData &&
    typeof nestedData.type === "string"
  ) {
    return nestedData as unknown as WorkflowStreamEvent;
  }

  return null;
}

function extractDaprSweEnvelope(
  body: DaprPubSubMessage | Record<string, unknown>,
): DaprSweEventEnvelope | null {
  const bodyRecord = asRecord(body);
  if (!bodyRecord) {
    return null;
  }

  const nestedData = asRecord(bodyRecord.data);
  const nestedType = asString(nestedData?.type);
  const nestedPayload = asRecord(nestedData?.data);
  if (nestedType && nestedPayload) {
    return {
      type: nestedType,
      source: asString(nestedData?.source) ?? asString(bodyRecord.source) ?? undefined,
      timestamp:
        asString(nestedData?.timestamp) ??
        asString(bodyRecord.time) ??
        undefined,
      datacontenttype:
        asString(nestedData?.datacontenttype) ??
        asString(bodyRecord.datacontenttype) ??
        undefined,
      data: nestedPayload,
    };
  }

  const directType = asString(bodyRecord.type);
  const directData = asRecord(bodyRecord.data);
  if (directType && directData) {
    return {
      type: directType,
      source: asString(bodyRecord.source) ?? undefined,
      timestamp:
        asString(bodyRecord.timestamp) ??
        asString(bodyRecord.time) ??
        undefined,
      datacontenttype: asString(bodyRecord.datacontenttype) ?? undefined,
      data: directData,
    };
  }

  return null;
}

async function mapDaprSweEvent(
  envelope: DaprSweEventEnvelope,
  messageId: string,
  fallbackTimestamp: string,
): Promise<WorkflowStreamEvent[]> {
  const payload = envelope.data ?? {};
  const timestamp = envelope.timestamp ?? fallbackTimestamp;
  const issueRef = asString(payload.issue);
  const rawStatus = asString(payload.status);
  const stepIndex = asNumber(payload.step_index);
  const stepTitle = asString(payload.step_title);

  if (envelope.type === "workflow.phase.changed") {
    const executionId = asString(payload.executionId);
    if (!executionId) {
      return [];
    }

    const phase = asString(payload.phase) ?? "running";
    const progress = asNumber(payload.progress) ?? undefined;
    const status = asString(payload.status) ?? "running";
    const type =
      status === "completed"
        ? "execution_completed"
        : status === "failed"
          ? "execution_failed"
          : "task_progress";

    return [
      {
        id: messageId,
        type,
        workflowId: executionId,
        data: {
          status: phase,
          progress,
          metadata: {
            source: "dapr-swe",
            sourceType: envelope.type,
            raw: payload,
          },
        },
        timestamp,
      },
    ];
  }

  if (!issueRef) {
    return [];
  }

  const executionId = await resolveDaprSweExecutionId(issueRef, {
    preferFresh: envelope.type === "dapr-swe.workflow.started",
  });
  if (!executionId) {
    console.warn(
      `[Webhook] Unable to resolve execution for dapr-swe issue ${issueRef}`,
    );
    return [];
  }

  const baseMetadata: Record<string, unknown> = {
    issue: issueRef,
    source: "dapr-swe",
    sourceType: envelope.type,
    raw: payload,
  };
  const taskId = stepIndex === null ? undefined : `step-${stepIndex}`;

  switch (envelope.type) {
    case "dapr-swe.workflow.started":
      return [
        {
          id: messageId,
          type: "execution_started",
          workflowId: executionId,
          data: {
            status: "Workflow started",
            metadata: baseMetadata,
            title: asString(payload.title) ?? undefined,
            sandbox_id: asString(payload.sandbox_id) ?? undefined,
          },
          timestamp,
        },
      ];
    case "dapr-swe.plan.created":
      return [
        {
          id: messageId,
          type: "task_progress",
          workflowId: executionId,
          taskId: "plan",
          data: {
            status: "planning",
            progress: 25,
            message: asString(payload.summary) ?? "Plan created",
            metadata: {
              ...baseMetadata,
              stepCount: asNumber(payload.steps) ?? undefined,
            },
          },
          timestamp,
        },
      ];
    case "dapr-swe.step.started":
      return [
        {
          id: messageId,
          type: "task_started",
          workflowId: executionId,
          taskId,
          data: {
            status: "in_progress",
            metadata: {
              ...baseMetadata,
              taskTitle: stepTitle,
              stepIndex,
            },
          },
          timestamp,
        },
      ];
    case "dapr-swe.step.completed":
      return [
        {
          id: messageId,
          type: "task_completed",
          workflowId: executionId,
          taskId,
          data: {
            status: rawStatus ?? "completed",
            metadata: {
              ...baseMetadata,
              taskTitle: stepTitle,
              stepIndex,
            },
          },
          timestamp,
        },
      ];
    case "dapr-swe.review.completed":
      return [
        {
          id: messageId,
          type: "phase_completed",
          workflowId: executionId,
          taskId: "review",
          data: {
            status: payload.approved === true ? "review approved" : "review completed",
            metadata: {
              ...baseMetadata,
              approved: payload.approved === true,
            },
          },
          timestamp,
        },
      ];
    case "dapr-swe.pr.created":
      return [
        {
          id: messageId,
          type: "phase_completed",
          workflowId: executionId,
          taskId: "commit-pr",
          data: {
            status: "pull request created",
            metadata: {
              ...baseMetadata,
              prUrl: asString(payload.pr_url) ?? undefined,
            },
          },
          timestamp,
        },
      ];
    case "dapr-swe.workflow.completed":
      return [
        {
          id: messageId,
          type: rawStatus === "success" ? "execution_completed" : "execution_failed",
          workflowId: executionId,
          data: {
            status: rawStatus ?? "completed",
            metadata: {
              ...baseMetadata,
              prUrl: asString(payload.pr_url) ?? undefined,
            },
            error:
              rawStatus && rawStatus !== "success"
                ? rawStatus
                : undefined,
          },
          timestamp,
        },
      ];
    default:
      return [];
  }
}

async function normalizeIncomingEvents(
  body: DaprPubSubMessage | WorkflowStreamEvent | Record<string, unknown>,
): Promise<WorkflowStreamEvent[]> {
  const legacyEvent = extractWorkflowStreamEvent(body);
  if (legacyEvent) {
    return [legacyEvent];
  }

  const envelope = extractDaprSweEnvelope(body as DaprPubSubMessage | Record<string, unknown>);
  if (!envelope) {
    return [];
  }

  const bodyRecord = asRecord(body);
  const messageId =
    asString(bodyRecord?.id) ??
    `${envelope.type}:${Date.now()}`;
  const fallbackTimestamp =
    asString(bodyRecord?.time) ??
    new Date().toISOString();

  return mapDaprSweEvent(envelope, messageId, fallbackTimestamp);
}

// ============================================================================
// Route Handler
// ============================================================================

/**
 * POST /api/webhooks/dapr/workflow-stream
 *
 * Handles incoming workflow stream events from Dapr pub/sub.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as DaprPubSubMessage | WorkflowStreamEvent | Record<string, unknown>;
    const events = await normalizeIncomingEvents(body);

    // Validate event structure
    if (events.length === 0) {
      console.warn("[Webhook] Ignoring unsupported workflow stream payload:", body);
      return NextResponse.json({ ignored: true }, { status: 200 });
    }

    for (const event of events) {
      if (event.type === "tool_call" || event.type === "tool_result") {
        console.log(
          `[Webhook] ${event.type} for workflow ${event.workflowId}:`,
          JSON.stringify(event.data, null, 2),
        );
      } else {
        console.log(
          `[Webhook] Workflow stream event: ${event.type} for workflow ${event.workflowId}`,
          event.taskId ? `(task: ${event.taskId})` : "",
        );
      }

      await storeWorkflowEvent(event as Parameters<typeof storeWorkflowEvent>[0]);
      const storedEvents = await getWorkflowEvents(event.workflowId);
      console.log(
        `[Webhook] Stored event. Total events for ${event.workflowId}: ${storedEvents.length}`,
      );

      try {
        if (event.type === "execution_completed") {
          console.log(
            `[Webhook] Updating AgentSession for completed workflow: ${event.workflowId}`,
          );
          await updateAgentSessionWorkflowStatusByWorkflowId({
            workflowId: event.workflowId,
            workflowStatus: "completed",
            workflowPhase: "completed",
            workflowProgress: 100,
            workflowCurrentTask: null,
            workflowMessage: "Workflow completed successfully",
          });
        } else if (event.type === "execution_failed") {
          console.log(
            `[Webhook] Updating AgentSession for failed workflow: ${event.workflowId}`,
          );
          await updateAgentSessionWorkflowStatusByWorkflowId({
            workflowId: event.workflowId,
            workflowStatus: "failed",
            workflowPhase: "failed",
            workflowCurrentTask: null,
            workflowMessage: event.data.error || "Workflow failed",
          });
        } else if (event.type === "execution_started") {
          console.log(
            `[Webhook] Updating AgentSession for started workflow: ${event.workflowId}`,
          );
          await updateAgentSessionWorkflowStatusByWorkflowId({
            workflowId: event.workflowId,
            workflowStatus: "running",
            workflowPhase: "executing",
            workflowProgress: 0,
            workflowMessage: "Workflow started",
          });
        } else if (event.type === "task_progress") {
          const metadata = event.data.metadata as Record<string, unknown> | undefined;
          const taskTitle = metadata?.taskTitle as string | undefined;
          const phase = event.data.status || "executing";
          const progress = event.data.progress ?? 0;

          console.log(
            `[Webhook] Updating AgentSession progress for ${event.workflowId}: ${phase} (${progress}%)`,
          );
          await updateAgentSessionWorkflowStatusByWorkflowId({
            workflowId: event.workflowId,
            workflowStatus: "running",
            workflowPhase: phase,
            workflowProgress: progress,
            workflowCurrentTask: taskTitle ?? null,
            workflowMessage: event.data.status || `Progress: ${progress}%`,
          });
        } else if (event.type === "task_started") {
          const metadata = event.data.metadata as Record<string, unknown> | undefined;
          const taskTitle = metadata?.taskTitle as string | undefined;

          if (taskTitle) {
            console.log(
              `[Webhook] Task started for ${event.workflowId}: ${taskTitle}`,
            );
            await updateAgentSessionWorkflowStatusByWorkflowId({
              workflowId: event.workflowId,
              workflowStatus: "running",
              workflowCurrentTask: taskTitle,
              workflowMessage: `Executing: ${taskTitle}`,
            });
          }
        } else if (event.type === "task_completed") {
          const metadata = event.data.metadata as Record<string, unknown> | undefined;
          const taskTitle = metadata?.taskTitle as string | undefined;

          console.log(
            `[Webhook] Task completed for ${event.workflowId}: ${taskTitle || event.taskId}`,
          );
          await updateAgentSessionWorkflowStatusByWorkflowId({
            workflowId: event.workflowId,
            workflowStatus: "running",
            workflowMessage: `Completed: ${taskTitle || event.taskId}`,
          });
        }
      } catch (dbError) {
        console.error(
          `[Webhook] Error updating AgentSession for ${event.workflowId}:`,
          dbError,
        );
      }
    }

    // Return success (Dapr expects 200 to acknowledge)
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Webhook] Error processing workflow stream event:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/webhooks/dapr/workflow-stream
 *
 * Dapr uses OPTIONS to check endpoint availability.
 */
export async function OPTIONS() {
  return new Response(null, { status: 200 });
}
