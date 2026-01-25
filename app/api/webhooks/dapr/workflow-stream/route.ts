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

// ============================================================================
// Types
// ============================================================================

interface WorkflowStreamEvent {
  id: string;
  type:
    | "initial"
    | "llm_chunk"
    | "tool_call"
    | "tool_result"
    | "task_progress"
    | "task_completed"
    | "heartbeat"
    | "error";
  workflowId: string;
  taskId?: string;
  agentId?: "claude-planner" | "claude-code-agent";
  data: {
    content?: string;
    toolName?: string;
    toolInput?: unknown;
    toolOutput?: string;
    status?: string;
    progress?: number;
    error?: string;
    metadata?: Record<string, unknown>;
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
// In-Memory Event Store (for demo/development)
// In production, use Redis, PostgreSQL, or another persistent store
// ============================================================================

interface EventStore {
  events: Map<string, WorkflowStreamEvent[]>;
  maxEventsPerWorkflow: number;
}

const eventStore: EventStore = {
  events: new Map(),
  maxEventsPerWorkflow: 1000, // Keep last 1000 events per workflow
};

/**
 * Store an event for a workflow
 */
function storeEvent(event: WorkflowStreamEvent): void {
  const workflowId = event.workflowId;

  if (!eventStore.events.has(workflowId)) {
    eventStore.events.set(workflowId, []);
  }

  const events = eventStore.events.get(workflowId)!;
  events.push(event);

  // Trim to max size
  if (events.length > eventStore.maxEventsPerWorkflow) {
    events.shift();
  }
}

/**
 * Get events for a workflow
 */
export function getWorkflowEvents(workflowId: string): WorkflowStreamEvent[] {
  return eventStore.events.get(workflowId) ?? [];
}

/**
 * Clear events for a workflow
 */
export function clearWorkflowEvents(workflowId: string): void {
  eventStore.events.delete(workflowId);
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
    console.log(
      `[Webhook] Workflow stream event: ${event.type} for workflow ${event.workflowId}`,
      event.taskId ? `(task: ${event.taskId})` : ""
    );

    // Store the event
    storeEvent(event);

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
