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

// Re-export for other routes to use
export { getWorkflowEvents, clearWorkflowEvents };

// ============================================================================
// Types
// ============================================================================

interface WorkflowStreamEvent {
  id?: string;
  type:
    | "initial"
    | "llm_chunk"
    | "thinking"  // Claude's extended thinking (internal reasoning)
    | "tool_call"
    | "tool_result"
    | "task_progress"
    | "task_completed"
    | "task_started"
    | "task_failed"
    | "execution_started"
    | "execution_completed"
    | "execution_failed"
    | "file_changed"
    | "heartbeat"
    | "error";
  workflowId: string;
  taskId?: string;
  agentId?: "claude-planner" | "claude-code-agent";
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
  data: WorkflowStreamEvent;
  datacontenttype?: string;
  id?: string;
  pubsubname?: string;
  source?: string;
  specversion?: string;
  topic?: string;
  traceid?: string;
  traceparent?: string;
  tracestate?: string;
  type?: string;
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
    const body = (await request.json()) as DaprPubSubMessage | WorkflowStreamEvent;

    // Handle both Dapr CloudEvent envelope and raw event
    let event: WorkflowStreamEvent;
    if ("data" in body && body.data && "workflowId" in body.data) {
      event = body.data as WorkflowStreamEvent;
    } else {
      event = body as WorkflowStreamEvent;
    }

    // Validate event structure
    if (!event.workflowId || !event.type) {
      console.warn("[Webhook] Invalid event structure:", body);
      return NextResponse.json({ error: "Invalid event structure" }, { status: 400 });
    }

    // Log the event (for debugging)
    if (event.type === "tool_call" || event.type === "tool_result") {
      // Log full data for tool events to debug matching issues
      console.log(
        `[Webhook] ${event.type} for workflow ${event.workflowId}:`,
        JSON.stringify(event.data, null, 2)
      );
    } else {
      console.log(
        `[Webhook] Workflow stream event: ${event.type} for workflow ${event.workflowId}`,
        event.taskId ? `(task: ${event.taskId})` : ""
      );
    }

    // Store the event in the shared store (Redis-backed, async)
    await storeWorkflowEvent(event as Parameters<typeof storeWorkflowEvent>[0]);

    // Verify storage
    const storedEvents = await getWorkflowEvents(event.workflowId);
    console.log(`[Webhook] Stored event. Total events for ${event.workflowId}: ${storedEvents.length}`);

    // Update database for status-relevant events
    // This syncs workflow status to AgentSession for the workflows list
    try {
      if (event.type === "execution_completed") {
        console.log(`[Webhook] Updating AgentSession for completed workflow: ${event.workflowId}`);
        await updateAgentSessionWorkflowStatusByWorkflowId({
          workflowId: event.workflowId,
          workflowStatus: "completed",
          workflowPhase: "completed",
          workflowProgress: 100,
          workflowCurrentTask: null,
          workflowMessage: "Workflow completed successfully",
        });
      } else if (event.type === "execution_failed") {
        console.log(`[Webhook] Updating AgentSession for failed workflow: ${event.workflowId}`);
        await updateAgentSessionWorkflowStatusByWorkflowId({
          workflowId: event.workflowId,
          workflowStatus: "failed",
          workflowPhase: "failed",
          workflowCurrentTask: null,
          workflowMessage: event.data.error || "Workflow failed",
        });
      } else if (event.type === "execution_started") {
        console.log(`[Webhook] Updating AgentSession for started workflow: ${event.workflowId}`);
        await updateAgentSessionWorkflowStatusByWorkflowId({
          workflowId: event.workflowId,
          workflowStatus: "running",
          workflowPhase: "executing",
          workflowProgress: 0,
          workflowMessage: "Workflow started",
        });
      } else if (event.type === "task_progress") {
        // Extract progress info from event
        const metadata = event.data.metadata as Record<string, unknown> | undefined;
        const taskTitle = metadata?.taskTitle as string | undefined;
        const phase = event.data.status || "executing";
        const progress = event.data.progress ?? 0;

        console.log(`[Webhook] Updating AgentSession progress for ${event.workflowId}: ${phase} (${progress}%)`);
        await updateAgentSessionWorkflowStatusByWorkflowId({
          workflowId: event.workflowId,
          workflowStatus: "running",
          workflowPhase: phase,
          workflowProgress: progress,
          workflowCurrentTask: taskTitle ?? null,
          workflowMessage: event.data.status || `Progress: ${progress}%`,
        });
      } else if (event.type === "task_started") {
        // Update current task
        const metadata = event.data.metadata as Record<string, unknown> | undefined;
        const taskTitle = metadata?.taskTitle as string | undefined;

        if (taskTitle) {
          console.log(`[Webhook] Task started for ${event.workflowId}: ${taskTitle}`);
          await updateAgentSessionWorkflowStatusByWorkflowId({
            workflowId: event.workflowId,
            workflowStatus: "running",
            workflowCurrentTask: taskTitle,
            workflowMessage: `Executing: ${taskTitle}`,
          });
        }
      } else if (event.type === "task_completed") {
        // Task completed, clear current task (next task_started will set new one)
        const metadata = event.data.metadata as Record<string, unknown> | undefined;
        const taskTitle = metadata?.taskTitle as string | undefined;

        console.log(`[Webhook] Task completed for ${event.workflowId}: ${taskTitle || event.taskId}`);
        await updateAgentSessionWorkflowStatusByWorkflowId({
          workflowId: event.workflowId,
          workflowStatus: "running",
          workflowMessage: `Completed: ${taskTitle || event.taskId}`,
        });
      }
    } catch (dbError) {
      // Log but don't fail the webhook - event is already stored in Redis
      console.error(`[Webhook] Error updating AgentSession for ${event.workflowId}:`, dbError);
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
