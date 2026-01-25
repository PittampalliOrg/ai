/**
 * Workflow Pattern Stream API
 *
 * GET /api/workflow-patterns/[instanceId]/stream
 * Server-Sent Events stream for real-time workflow updates.
 */

import {
  getWorkflowPatternState,
  isWorkflowPatternsRuntimeInitialized,
  initializeWorkflowPatternsRuntime,
  type WorkflowRuntimeStatus,
} from "@/lib/workflow-patterns/runtime";
import { syncWorkflowFromDapr } from "@/lib/workflow-patterns/workflow-index";

export const maxDuration = 300; // 5 minutes max for SSE

// Terminal states that end the stream
const TERMINAL_STATES: WorkflowRuntimeStatus[] = [
  "COMPLETED",
  "FAILED",
  "TERMINATED",
];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ instanceId: string }> }
): Promise<Response> {
  const { instanceId } = await params;

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const sendEvent = (event: string, data: unknown) => {
        const eventData = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(eventData));
      };

      const sendError = (error: string) => {
        sendEvent("error", { error });
        controller.close();
      };

      try {
        // Initialize runtime if needed
        if (!isWorkflowPatternsRuntimeInitialized()) {
          try {
            await initializeWorkflowPatternsRuntime();
          } catch (initError) {
            if (initError instanceof Error && initError.message.includes("disabled")) {
              sendError("Workflow Patterns runtime is disabled. Set WORKFLOW_PATTERNS_ENABLED=true to enable.");
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

        // Send initial state
        sendEvent("state", {
          instanceId: state.instanceId,
          workflowName: state.workflowName,
          status: state.runtimeStatus,
          createdAt: state.createdAt.toISOString(),
          lastUpdatedAt: state.lastUpdatedAt.toISOString(),
        });

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
            console.error(`[Workflow Stream] Failed to sync status for ${instanceId}:`, syncError);
          }

          sendEvent("complete", {
            instanceId: state.instanceId,
            status: state.runtimeStatus,
            output,
          });
          controller.close();
          return;
        }

        // Poll for updates
        const pollInterval = 1000; // 1 second
        const maxPolls = 300; // 5 minutes max
        let pollCount = 0;
        let lastStatus = state.runtimeStatus;
        let lastUpdated = state.lastUpdatedAt.toISOString();

        const pollTimer = setInterval(async () => {
          try {
            pollCount++;

            if (pollCount > maxPolls) {
              clearInterval(pollTimer);
              sendEvent("timeout", { message: "Stream timeout" });
              controller.close();
              return;
            }

            state = await getWorkflowPatternState(instanceId);

            if (!state) {
              clearInterval(pollTimer);
              sendError(`Workflow instance ${instanceId} no longer exists`);
              return;
            }

            const currentUpdated = state.lastUpdatedAt.toISOString();

            // Send update if status or timestamp changed
            if (state.runtimeStatus !== lastStatus || currentUpdated !== lastUpdated) {
              lastStatus = state.runtimeStatus;
              lastUpdated = currentUpdated;

              // Parse custom status for step info
              let customStatus: unknown;
              try {
                if (state.serializedCustomStatus) {
                  customStatus = JSON.parse(state.serializedCustomStatus);
                }
              } catch {
                customStatus = state.serializedCustomStatus;
              }

              sendEvent("update", {
                instanceId: state.instanceId,
                status: state.runtimeStatus,
                customStatus,
                lastUpdatedAt: currentUpdated,
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
                console.error(`[Workflow Stream] Failed to sync status for ${instanceId}:`, syncError);
              }

              sendEvent("complete", {
                instanceId: state.instanceId,
                status: state.runtimeStatus,
                output,
              });
              controller.close();
            }
          } catch (pollError) {
            console.error(`[Workflow Stream] Poll error for ${instanceId}:`, pollError);
            // Continue polling on transient errors
          }
        }, pollInterval);

        // Handle stream cancellation
        // Note: The AbortController pattern would be better here
        // but we're keeping it simple for now
      } catch (error) {
        console.error(`[Workflow Stream] Error for ${instanceId}:`, error);
        sendError(error instanceof Error ? error.message : "Unknown error");
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
