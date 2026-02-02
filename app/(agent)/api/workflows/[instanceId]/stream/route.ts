/**
 * Workflow Stream API
 *
 * GET /api/workflows/[instanceId]/stream
 * Unified SSE (Server-Sent Events) streaming for both:
 * 1. workflow-orchestrator service (Ralph workflows)
 * 2. workflow-patterns Dapr runtime (sequential, parallel, etc.)
 *
 * The route automatically detects the workflow source and routes accordingly.
 */

import { type NextRequest } from "next/server";

// Allow long-running SSE streams (30 minutes)
export const maxDuration = 1800;
import {
  getWorkflowPatternState,
  isWorkflowPatternsRuntimeInitialized,
  initializeWorkflowPatternsRuntime,
  type WorkflowRuntimeStatus,
} from "@/lib/workflow-patterns/runtime";
import { getWorkflow as getWorkflowFromIndex, syncWorkflowFromDapr } from "@/lib/workflow-patterns/workflow-index";
import { getWorkflowEvents } from "@/lib/workflow-event-store";
import { getAgentSession } from "@/lib/db/agent-queries";

// Workflow orchestrator service configuration
const WORKFLOW_SERVICE_URL =
  process.env.WORKFLOW_SERVICE_URL || "http://workflow-orchestrator.dapr-agents.svc.cluster.local:80";

// Planner dapr agent Dapr app ID (for wf- prefixed workflows)
const PLANNER_DAPR_AGENT_APP_ID = process.env.PLANNER_DAPR_AGENT_APP_ID || "planner-dapr-agent.planner-agent";

// Direct Kubernetes service URL for SSE streaming (bypasses Dapr to avoid buffering)
// Dapr buffers HTTP responses which breaks SSE streaming
const PLANNER_DAPR_AGENT_SERVICE_URL = process.env.PLANNER_DAPR_AGENT_SERVICE_URL ||
  "http://planner-dapr-agent.planner-agent.svc.cluster.local:8000";

// Dapr sidecar URL for service invocation (used for non-streaming requests)
const DAPR_HTTP_PORT = process.env.DAPR_HTTP_PORT || "3500";
const DAPR_SIDECAR_URL = `http://localhost:${DAPR_HTTP_PORT}`;

// Enable workflow patterns
const WORKFLOW_PATTERNS_ENABLED = process.env.WORKFLOW_PATTERNS_ENABLED === "true";

// Terminal states that end the stream
const TERMINAL_STATES: WorkflowRuntimeStatus[] = [
  "COMPLETED",
  "FAILED",
  "TERMINATED",
];

/**
 * Map planner-agent event types to stream event types.
 * The planner-agent uses snake_case event types like "tool_call", "execution_started".
 * We normalize these to our stream event types.
 */
function mapEventType(type: string): string {
  const typeMap: Record<string, string> = {
    // Tool events
    tool_call: "tool_call",
    tool_result: "tool_result",
    // Task events
    task_started: "task_progress",
    task_completed: "task_completed",
    task_failed: "error",
    // Phase events (from Dapr workflow activities)
    phase_started: "task_progress",
    phase_completed: "task_completed",
    phase_failed: "error",
    // Execution events
    execution_started: "task_progress",
    execution_completed: "task_completed",
    execution_failed: "error",
    // File events - keep as separate type, NOT tool_result (to avoid matching confusion)
    file_changed: "file_changed",
    // LLM events
    llm_chunk: "llm_chunk",
  };
  return typeMap[type] || type;
}

interface RouteParams {
  params: Promise<{ instanceId: string }>;
}

/**
 * GET /api/workflows/[instanceId]/stream
 *
 * Unified SSE streaming endpoint. Automatically detects workflow source:
 * 1. Tries workflow-patterns first (if enabled)
 * 2. Falls back to workflow-orchestrator
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { instanceId } = await params;

  if (!instanceId) {
    return new Response(JSON.stringify({ error: "Instance ID is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Check for planner-dapr-agent workflows (wf- prefix)
  if (instanceId.startsWith("wf-")) {
    console.log(`[Stream] Detected planner-dapr-agent workflow: ${instanceId}`);
    return streamPlannerDaprAgent(instanceId);
  }

  // Check if this is a session ID that has a linked Dapr workflow
  // Sessions created via /api/agent/sessions store their workflowId
  try {
    const session = await getAgentSession({ id: instanceId });
    if (session?.workflowId && session.workflowId.startsWith("wf-")) {
      console.log(`[Stream] Session ${instanceId} linked to workflow ${session.workflowId}`);
      return streamPlannerDaprAgent(session.workflowId);
    }
  } catch (error) {
    console.log(`[Stream] Not a valid session ID: ${instanceId}`);
  }

  // Try workflow-patterns first if enabled
  if (WORKFLOW_PATTERNS_ENABLED) {
    try {
      // Check if this is a workflow-patterns workflow by Dapr workflow ID
      const indexEntry = await getWorkflowFromIndex(instanceId);

      if (indexEntry) {
        console.log(`[Stream] Found workflow-patterns workflow: ${instanceId}`);
        return streamWorkflowPatterns(instanceId);
      }
    } catch (error) {
      console.log(`[Stream] Not a workflow-patterns workflow by ID: ${instanceId}`);
    }

    // Also check if there are events stored for this ID (could be a session ID)
    // Events are now published keyed by session ID from planner-agent
    // Poll for events with retry since webhook might deliver them after stream connects
    const maxRetries = 10;
    const retryDelay = 500;

    for (let i = 0; i < maxRetries; i++) {
      const existingEvents = await getWorkflowEvents(instanceId);
      console.log(`[Stream] Event store check for ${instanceId}: ${existingEvents.length} events found (attempt ${i + 1}/${maxRetries})`);

      if (existingEvents.length > 0) {
        console.log(`[Stream] Streaming ${existingEvents.length} events for session/workflow: ${instanceId}`);
        return streamSessionEvents(instanceId, request);
      }

      // Wait before next check
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  console.log(`[Stream] No events found after retries, falling back to workflow-orchestrator for ${instanceId}`);
  // Fall back to workflow-orchestrator
  return streamWorkflowOrchestrator(instanceId);
}

/**
 * Stream from planner-dapr-agent (wf- prefixed workflows)
 *
 * Uses Dapr streaming subscriptions for real-time events.
 * The planner-dapr-agent exposes an SSE endpoint at /workflows/{id}/stream
 * that uses Dapr's pull-based streaming subscription.
 *
 * Architecture (no Redis intermediary needed):
 * 1. On connect: planner-dapr-agent sends historical events from Dapr workflow state
 * 2. Real-time: Dapr streaming subscription pushes events directly to SSE
 *
 * This function proxies the SSE stream from planner-dapr-agent to the client.
 */
async function streamPlannerDaprAgent(instanceId: string): Promise<Response> {
  console.log(`[Stream] Connecting to planner-dapr-agent SSE stream for ${instanceId}`);

  // Try direct Kubernetes service first (bypasses Dapr buffering for SSE)
  try {
    const directStreamUrl = `${PLANNER_DAPR_AGENT_SERVICE_URL}/workflows/${instanceId}/stream`;
    console.log(`[Stream] Trying direct connection: ${directStreamUrl}`);

    const response = await fetch(directStreamUrl, {
      headers: {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });

    if (response.ok) {
      console.log(`[Stream] Connected via direct K8s service for ${instanceId}`);
      return new Response(response.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    console.warn(`[Stream] Direct connection failed: ${response.status}, trying Dapr...`);
  } catch (error) {
    console.warn(`[Stream] Direct connection error, trying Dapr:`, error);
  }

  // Fallback to Dapr service invocation (may have buffering issues with SSE)
  try {
    const streamUrl = `${DAPR_SIDECAR_URL}/v1.0/invoke/${PLANNER_DAPR_AGENT_APP_ID}/method/workflows/${instanceId}/stream`;
    console.log(`[Stream] Trying Dapr service invocation: ${streamUrl}`);

    const response = await fetch(streamUrl, {
      headers: {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });

    if (!response.ok) {
      console.error(`[Stream] Dapr service invocation failed: ${response.status}`);
      return streamPlannerDaprAgentPolling(instanceId);
    }

    console.log(`[Stream] Connected via Dapr for ${instanceId}`);
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error(`[Stream] Error connecting to planner-dapr-agent stream:`, error);
    return streamPlannerDaprAgentPolling(instanceId);
  }
}

/**
 * Fallback: Polling-based streaming for planner-dapr-agent
 * Used when direct SSE proxy fails (e.g., older agent version)
 */
async function streamPlannerDaprAgentPolling(instanceId: string): Promise<Response> {
  console.log(`[Stream] Using polling fallback for ${instanceId}`);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const sendEvent = (event: string, data: unknown) => {
        const eventData = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(eventData));
      };

      const sendError = (error: string) => {
        sendEvent("error", {
          id: `error-${Date.now()}`,
          type: "error",
          workflowId: instanceId,
          data: { error },
          timestamp: new Date().toISOString(),
        });
      };

      try {
        // Poll planner-dapr-agent for workflow status
        const pollInterval = 1000; // 1 second for faster updates
        const maxPollTime = 30 * 60 * 1000; // 30 minutes
        const startTime = Date.now();
        let lastStatus = "";
        let lastPhase = "";
        let lastEventIndex = 0; // Track activity events we've sent

        // Send initial status event
        sendEvent("initial", {
          id: `init-${Date.now()}`,
          type: "initial",
          workflowId: instanceId,
          data: {
            status: "RUNNING",
            content: "Connecting to workflow...",
          },
          timestamp: new Date().toISOString(),
        });

        while (Date.now() - startTime < maxPollTime) {
          try {
            // ============================================================
            // Check for new activity events from pub/sub webhook (fallback)
            // ============================================================
            const activityEvents = await getWorkflowEvents(instanceId);
            if (activityEvents.length > lastEventIndex) {
              const newEvents = activityEvents.slice(lastEventIndex);
              for (const activityEvent of newEvents) {
                const mappedType = mapEventType(activityEvent.type);

                // Debug log for tool events
                if (activityEvent.type === "tool_call" || activityEvent.type === "tool_result") {
                  console.log(
                    `[Stream] Forwarding ${activityEvent.type}: toolName=${activityEvent.data?.toolName || "unknown"} callId=${activityEvent.data?.callId || "NONE"}`
                  );
                }

                sendEvent(mappedType, {
                  id: activityEvent.id || `activity-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  type: mappedType,
                  workflowId: instanceId,
                  taskId: activityEvent.taskId,
                  data: activityEvent.data,
                  timestamp: activityEvent.timestamp,
                });
              }
              lastEventIndex = activityEvents.length;
            }

            // ============================================================
            // Poll workflow status from planner-dapr-agent
            // ============================================================
            const response = await fetch(
              `${DAPR_SIDECAR_URL}/v1.0/invoke/${PLANNER_DAPR_AGENT_APP_ID}/method/workflows/${instanceId}`,
              {
                headers: { "Content-Type": "application/json" },
              }
            );

            if (!response.ok) {
              if (response.status === 404) {
                sendError(`Workflow ${instanceId} not found in planner-dapr-agent`);
                controller.close();
                return;
              }
              throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const currentStatus = data.status || "UNKNOWN";

            // Get phase info from response (already parsed by backend)
            const phase = data.phase || "";
            const progress = data.progress || 0;
            const message = data.message || "";
            const plan = data.plan || null;

            // Send update if status or phase changed
            if (currentStatus !== lastStatus || phase !== lastPhase) {
              lastStatus = currentStatus;
              lastPhase = phase;

              // Map status to UI-friendly format
              const uiStatus = phase === "awaiting_approval" ? "AWAITING_APPROVAL" : currentStatus;

              sendEvent("status", {
                id: `status-${Date.now()}`,
                type: "status",
                workflowId: instanceId,
                data: {
                  status: uiStatus,
                  phase,
                  progress,
                  message,
                  plan,
                  activities: data.activities || [],
                },
                timestamp: new Date().toISOString(),
              });

              // Check for terminal states
              if (["COMPLETED", "FAILED", "TERMINATED"].includes(currentStatus)) {
                console.log(`[Stream] Workflow ${instanceId} reached terminal state: ${currentStatus}`);
                controller.close();
                return;
              }
            }
          } catch (pollError) {
            console.error(`[Stream] Error polling planner-dapr-agent for ${instanceId}:`, pollError);
            // Don't send error for transient failures, just log and continue
          }

          // Wait before next poll
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        // Timeout
        sendError("Stream timed out after 30 minutes");
        controller.close();
      } catch (error) {
        console.error(`[Stream] Error in planner-dapr-agent stream for ${instanceId}:`, error);
        sendError(error instanceof Error ? error.message : "Unknown error");
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * Stream from workflow-patterns (Dapr runtime)
 */
async function streamWorkflowPatterns(instanceId: string): Promise<Response> {
  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const sendEvent = (event: string, data: unknown) => {
        // Format as SSE event compatible with useWorkflowStream
        const eventData = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(eventData));
      };

      const sendError = (error: string) => {
        sendEvent("error", {
          id: `error-${Date.now()}`,
          type: "error",
          workflowId: instanceId,
          data: { error },
          timestamp: new Date().toISOString(),
        });
        controller.close();
      };

      try {
        // Initialize runtime if needed
        if (!isWorkflowPatternsRuntimeInitialized()) {
          try {
            await initializeWorkflowPatternsRuntime();
          } catch (initError) {
            if (initError instanceof Error && initError.message.includes("disabled")) {
              sendError("Workflow Patterns runtime is disabled.");
              return;
            }
            throw initError;
          }
        }

        // Get initial state
        let state = await getWorkflowPatternState(instanceId);

        if (!state) {
          sendError(`Workflow instance ${instanceId} not found`);
          return;
        }

        // Parse custom status
        let customStatus: string | null = null;
        try {
          if (state.serializedCustomStatus) {
            const parsed = JSON.parse(state.serializedCustomStatus);
            customStatus = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
          }
        } catch {
          customStatus = state.serializedCustomStatus || null;
        }

        // Detect if workflow is waiting for plan approval
        const isWaitingForApproval =
          state.runtimeStatus === "RUNNING" &&
          customStatus &&
          customStatus.toLowerCase().includes("waiting for plan approval");

        // Determine status for UI - map to AWAITING_APPROVAL if waiting
        const uiStatus = isWaitingForApproval ? "AWAITING_APPROVAL" : state.runtimeStatus;

        // Send initial state event (type: "initial" is what sidebar checks)
        sendEvent("initial", {
          id: `init-${Date.now()}`,
          type: "initial",
          workflowId: instanceId,
          data: {
            status: uiStatus,
            content: customStatus || `Workflow ${state.runtimeStatus}`,
            metadata: {
              workflowName: state.workflowName,
              runtimeStatus: state.runtimeStatus,
              customStatus,
              createdAt: state.createdAt.toISOString(),
            },
          },
          timestamp: new Date().toISOString(),
        });

        // If waiting for approval, also send a progress event with the approval message
        if (isWaitingForApproval) {
          sendEvent("progress", {
            id: `approval-${Date.now()}`,
            type: "task_progress",
            workflowId: instanceId,
            data: {
              status: "Plan ready for approval",
              content: "Plan ready for approval",
              metadata: {
                workflowStatus: state.runtimeStatus,
                customStatus,
              },
            },
            timestamp: new Date().toISOString(),
          });
        }

        // Check if already in terminal state
        if (TERMINAL_STATES.includes(state.runtimeStatus)) {
          // Parse output if present
          let output: unknown;
          try {
            if (state.serializedOutput) {
              output = JSON.parse(state.serializedOutput);
            }
          } catch {
            output = state.serializedOutput;
          }

          // Sync status to workflow index
          try {
            await syncWorkflowFromDapr(instanceId, {
              runtimeStatus: state.runtimeStatus,
              customStatus: state.serializedCustomStatus,
              serializedOutput: state.serializedOutput,
            });
          } catch (syncError) {
            console.error(`[Stream] Failed to sync status for ${instanceId}:`, syncError);
          }

          // Send completion event
          sendEvent("complete", {
            id: `complete-${Date.now()}`,
            type: "task_completed",
            workflowId: instanceId,
            data: {
              status: state.runtimeStatus,
              metadata: {
                workflowComplete: true,
                output,
              },
            },
            timestamp: new Date().toISOString(),
          });
          controller.close();
          return;
        }

        // Poll for updates
        const pollInterval = 500; // 500ms for faster event streaming
        const maxPolls = 3600; // 30 minutes max (matches maxDuration)
        let pollCount = 0;
        let lastStatus = state.runtimeStatus;
        let lastCustomStatus = state.serializedCustomStatus;
        let lastEventIndex = 0; // Track how many events we've sent

        const pollTimer = setInterval(async () => {
          try {
            pollCount++;

            if (pollCount > maxPolls) {
              clearInterval(pollTimer);
              // Send timeout as a recoverable event - client should reconnect
              sendEvent("timeout", {
                id: `timeout-${Date.now()}`,
                type: "stream_timeout",
                workflowId: instanceId,
                data: {
                  message: "Stream timeout - please reconnect",
                  reconnect: true,
                  lastStatus: lastStatus,
                  lastCustomStatus: lastCustomStatus,
                },
                timestamp: new Date().toISOString(),
              });
              controller.close();
              return;
            }

            // ============================================================
            // Check for new activity events from pub/sub webhook
            // ============================================================
            const activityEvents = await getWorkflowEvents(instanceId);
            if (activityEvents.length > lastEventIndex) {
              // Send new events
              const newEvents = activityEvents.slice(lastEventIndex);
              for (const activityEvent of newEvents) {
                // Map planner-agent event types to our stream event types
                const mappedType = mapEventType(activityEvent.type);

                // Debug: Log tool events with callId
                if (activityEvent.type === "tool_call" || activityEvent.type === "tool_result") {
                  console.log(
                    `[Stream] Forwarding ${activityEvent.type}: toolName=${activityEvent.data?.toolName || "unknown"} callId=${activityEvent.data?.callId || "NONE"}`
                  );
                }

                sendEvent(mappedType, {
                  id: activityEvent.id || `activity-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  type: mappedType,
                  workflowId: instanceId,
                  taskId: activityEvent.taskId,
                  data: activityEvent.data,
                  timestamp: activityEvent.timestamp,
                });
              }
              lastEventIndex = activityEvents.length;
            }

            // ============================================================
            // Check workflow state changes
            // ============================================================
            state = await getWorkflowPatternState(instanceId);

            if (!state) {
              clearInterval(pollTimer);
              sendError(`Workflow instance ${instanceId} no longer exists`);
              return;
            }

            // Send update if status or custom status changed
            if (state.runtimeStatus !== lastStatus || state.serializedCustomStatus !== lastCustomStatus) {
              const prevCustomStatus = lastCustomStatus;
              lastStatus = state.runtimeStatus;
              lastCustomStatus = state.serializedCustomStatus;

              // Parse custom status for step info
              let customStatusStr: string | null = null;
              try {
                if (state.serializedCustomStatus) {
                  const parsed = JSON.parse(state.serializedCustomStatus);
                  customStatusStr = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
                }
              } catch {
                customStatusStr = state.serializedCustomStatus || null;
              }

              // Detect if workflow just started waiting for approval
              const isWaitingForApproval =
                state.runtimeStatus === "RUNNING" &&
                customStatusStr &&
                customStatusStr.toLowerCase().includes("waiting for plan approval");

              // Send "Plan ready for approval" status if we just started waiting
              const statusMessage = isWaitingForApproval
                ? "Plan ready for approval"
                : (customStatusStr || state.runtimeStatus);

              sendEvent("update", {
                id: `update-${Date.now()}`,
                type: "task_progress",
                workflowId: instanceId,
                data: {
                  status: statusMessage,
                  content: statusMessage,
                  metadata: {
                    workflowStatus: state.runtimeStatus,
                    customStatus: customStatusStr,
                    isWaitingForApproval,
                  },
                },
                timestamp: new Date().toISOString(),
              });
            }

            // Check for terminal state
            if (TERMINAL_STATES.includes(state.runtimeStatus)) {
              clearInterval(pollTimer);

              // Parse output
              let output: unknown;
              try {
                if (state.serializedOutput) {
                  output = JSON.parse(state.serializedOutput);
                }
              } catch {
                output = state.serializedOutput;
              }

              // Sync status to workflow index
              try {
                await syncWorkflowFromDapr(instanceId, {
                  runtimeStatus: state.runtimeStatus,
                  customStatus: state.serializedCustomStatus,
                  serializedOutput: state.serializedOutput,
                });
              } catch (syncError) {
                console.error(`[Stream] Failed to sync status for ${instanceId}:`, syncError);
              }

              sendEvent("complete", {
                id: `complete-${Date.now()}`,
                type: "task_completed",
                workflowId: instanceId,
                data: {
                  status: state.runtimeStatus,
                  metadata: {
                    workflowComplete: true,
                    output,
                  },
                },
                timestamp: new Date().toISOString(),
              });
              controller.close();
            }
          } catch (pollError) {
            console.error(`[Stream] Poll error for ${instanceId}:`, pollError);
            // Continue polling on transient errors
          }
        }, pollInterval);
      } catch (error) {
        console.error(`[Stream] Error for ${instanceId}:`, error);
        sendError(error instanceof Error ? error.message : "Unknown error");
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * Stream events for a session ID (without Dapr workflow state)
 *
 * This is used when events are published keyed by session ID from planner-agent.
 * It polls the in-memory event store for new events.
 */
async function streamSessionEvents(sessionId: string, request: NextRequest): Promise<Response> {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const sendEvent = (event: string, data: unknown) => {
        const eventData = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(eventData));
      };

      try {
        // Send initial state event
        sendEvent("initial", {
          id: `init-${Date.now()}`,
          type: "initial",
          workflowId: sessionId,
          data: {
            status: "RUNNING",
            content: "Streaming session events",
          },
          timestamp: new Date().toISOString(),
        });

        // Poll for new events
        const pollInterval = 500;
        const maxPolls = 3600; // 30 minutes
        let pollCount = 0;
        let lastEventIndex = 0;

        const pollTimer = setInterval(async () => {
          try {
            pollCount++;

            if (pollCount > maxPolls) {
              clearInterval(pollTimer);
              sendEvent("timeout", {
                id: `timeout-${Date.now()}`,
                type: "stream_timeout",
                workflowId: sessionId,
                data: {
                  message: "Stream timeout - please reconnect",
                  reconnect: true,
                },
                timestamp: new Date().toISOString(),
              });
              controller.close();
              return;
            }

            // Check for new events
            const events = await getWorkflowEvents(sessionId);
            if (events.length > lastEventIndex) {
              const newEvents = events.slice(lastEventIndex);
              for (const event of newEvents) {
                const mappedType = mapEventType(event.type);
                sendEvent(mappedType, {
                  id: event.id || `event-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  type: mappedType,
                  workflowId: sessionId,
                  taskId: event.taskId,
                  data: event.data,
                  timestamp: event.timestamp,
                });
              }
              lastEventIndex = events.length;
            }
          } catch (pollError) {
            console.error(`[Stream] Poll error for session ${sessionId}:`, pollError);
          }
        }, pollInterval);

        // Clean up on close
        request.signal?.addEventListener("abort", () => {
          clearInterval(pollTimer);
        });
      } catch (error) {
        console.error(`[Stream] Error for session ${sessionId}:`, error);
        sendEvent("error", {
          id: `error-${Date.now()}`,
          type: "error",
          workflowId: sessionId,
          data: { error: error instanceof Error ? error.message : "Unknown error" },
          timestamp: new Date().toISOString(),
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * Stream from workflow-orchestrator service
 */
async function streamWorkflowOrchestrator(instanceId: string): Promise<Response> {
  try {
    // Build the SSE URL for the workflow-orchestrator
    const eventsUrl = `${WORKFLOW_SERVICE_URL}/api/workflows/${encodeURIComponent(instanceId)}/events`;
    console.log(`[Stream Proxy] Connecting to ${eventsUrl}`);

    // Fetch with SSE headers
    const upstreamResponse = await fetch(eventsUrl, {
      headers: {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      },
      // Important: don't cache SSE connections
      cache: "no-store",
    });

    if (!upstreamResponse.ok) {
      if (upstreamResponse.status === 404) {
        return new Response(
          JSON.stringify({ error: `Workflow with ID "${instanceId}" not found` }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      const errorText = await upstreamResponse.text();
      console.error(`[Stream Proxy] Upstream error ${upstreamResponse.status}: ${errorText}`);
      return new Response(
        JSON.stringify({ error: `Workflow service error: ${upstreamResponse.status}` }),
        { status: upstreamResponse.status, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if we got an SSE response
    const contentType = upstreamResponse.headers.get("Content-Type") ?? "";
    if (!contentType.includes("text/event-stream")) {
      console.warn(`[Stream Proxy] Unexpected content type: ${contentType}`);
    }

    // Stream the response body directly to the client
    const body = upstreamResponse.body;

    if (!body) {
      return new Response(
        JSON.stringify({ error: "No stream available from upstream" }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    // Return the proxied SSE stream with appropriate headers
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // Disable nginx buffering
      },
    });
  } catch (error) {
    console.error(`[Stream Proxy] Error connecting to workflow ${instanceId}:`, error);

    // Check if it's a connection error
    if (error instanceof TypeError && error.message.includes("fetch")) {
      return new Response(
        JSON.stringify({
          error: "Cannot connect to workflow service. Make sure workflow-orchestrator is running.",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Failed to connect to stream",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
