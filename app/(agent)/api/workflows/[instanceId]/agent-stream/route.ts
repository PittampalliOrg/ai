/**
 * GET /api/workflows/[instanceId]/agent-stream
 *
 * SSE proxy for real-time agent activity streaming.
 * Forwards the agent-stream from workflow-builder's BFF to the ai-chatbot client.
 */

import { getConfig, getSecretValue } from "@/lib/dapr/config-provider";
import { getAgentSession } from "@/lib/db/agent-queries";

export const maxDuration = 1800;

function getWorkflowBuilderBaseUrl(): string {
  return getConfig(
    "WORKFLOW_BUILDER_BASE_URL",
    "http://workflow-builder.workflow-builder.svc.cluster.local:3000",
  ).replace(/\/+$/, "");
}

function getInternalToken(): string {
  return (
    getSecretValue("WORKFLOW_BUILDER_INTERNAL_API_TOKEN") ||
    getSecretValue("INTERNAL_API_TOKEN") ||
    process.env.WORKFLOW_BUILDER_INTERNAL_API_TOKEN ||
    process.env.INTERNAL_API_TOKEN ||
    ""
  ).trim();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ instanceId: string }> },
) {
  const { instanceId } = await params;
  const session = await getAgentSession({ id: instanceId }).catch(() => null);
  const targetExecutionId = session?.workflowId?.trim() || instanceId;

  const token = getInternalToken();
  const upstreamHeaders: Record<string, string> = {
    Accept: "text/event-stream",
  };
  if (token) {
    upstreamHeaders["X-Internal-Token"] = token;
  }

  const lastEventId =
    request.headers.get("Last-Event-ID") ??
    new URL(request.url).searchParams.get("lastEventId");
  if (lastEventId) {
    upstreamHeaders["Last-Event-ID"] = lastEventId;
  }

  const streamUrl = `${getWorkflowBuilderBaseUrl()}/api/workflows/executions/${encodeURIComponent(targetExecutionId)}/agent-stream`;

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(streamUrl, {
      headers: upstreamHeaders,
      signal: request.signal,
    });
  } catch {
    return new Response("Agent stream unavailable", { status: 502 });
  }

  if (!upstreamResponse.ok) {
    const text = await upstreamResponse.text().catch(() => "");
    return new Response(text || "Upstream error", {
      status: upstreamResponse.status,
    });
  }

  if (!upstreamResponse.body) {
    return new Response("No stream body", { status: 502 });
  }

  const reader = upstreamResponse.body.getReader();
  let closed = false;

  const stream = new ReadableStream({
    async pull(controller) {
      if (closed) {
        controller.close();
        return;
      }
      try {
        const { done, value } = await reader.read();
        if (done) {
          closed = true;
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch {
        closed = true;
        controller.close();
      }
    },
    cancel() {
      closed = true;
      reader.cancel().catch(() => {});
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
