/**
 * Workflow Tasks API
 *
 * GET /api/workflows/[instanceId]/tasks
 * Proxies task retrieval to the planner-orchestrator service using Dapr service invocation.
 *
 * The orchestrator stores tasks in Dapr statestore after the planning phase.
 * This endpoint retrieves them for human review before approval.
 *
 * Benefits of Dapr service invocation:
 * - Automatic mTLS encryption between services
 * - Built-in retries and circuit breakers
 * - Distributed tracing for observability
 * - Service discovery via app-id (no hardcoded URLs)
 */

import { NextResponse, type NextRequest } from "next/server";
import { invokeService } from "@/lib/dapr/client";

// Planner orchestrator Dapr app ID
// Use namespace-qualified app ID for cross-namespace Dapr invocation
const PLANNER_ORCHESTRATOR_APP_ID = process.env.PLANNER_AGENT_APP_ID || "planner-orchestrator.planner-agent";

interface RouteParams {
  params: Promise<{ instanceId: string }>;
}

interface OrchestratorTask {
  id: string;
  subject: string;
  description: string;
  activeForm?: string;
  status: string;
  blocks?: string[];
  blockedBy?: string[];
}

interface OrchestratorTasksResponse {
  workflow_id: string;
  tasks: OrchestratorTask[];
  count: number;
}

/**
 * GET /api/workflows/[instanceId]/tasks
 *
 * Fetches tasks from the planner-orchestrator's Dapr statestore.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { instanceId } = await params;

  if (!instanceId) {
    return NextResponse.json(
      { error: "Instance ID is required" },
      { status: 400 }
    );
  }

  try {
    console.log(`[Workflow Tasks] Invoking ${PLANNER_ORCHESTRATOR_APP_ID} via Dapr service invocation`);

    const response = await invokeService<OrchestratorTasksResponse>({
      appId: PLANNER_ORCHESTRATOR_APP_ID,
      method: "GET",
      path: `/api/workflows/${instanceId}/tasks`,
      timeout: 15000,
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({
          workflow_id: instanceId,
          tasks: [],
          count: 0,
        });
      }

      console.error(`[Workflow Tasks] Service returned ${response.status}: ${response.statusText}`);
      return NextResponse.json(
        { error: `Service error: ${response.status}` },
        { status: response.status }
      );
    }

    return NextResponse.json(response.data);
  } catch (error) {
    console.error(`[Workflow Tasks] Error fetching tasks:`, error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}
