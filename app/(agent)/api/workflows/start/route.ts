/**
 * Workflow Start API
 *
 * POST /api/workflows/start
 * Proxies workflow start requests to the planner-orchestrator service using Dapr service invocation.
 *
 * This endpoint acts as a thin proxy to planner-orchestrator's /api/workflows endpoint.
 * The orchestrator coordinates planning and execution across separate agent containers:
 * - Planning phase (planner-agent-plan)
 * - Task persistence (Dapr statestore)
 * - Human approval gate (wait_for_external_event)
 * - Execution phase (planner-agent-exec)
 *
 * Benefits of Dapr service invocation:
 * - Automatic mTLS encryption between services
 * - Built-in retries and circuit breakers
 * - Distributed tracing for observability
 * - Service discovery via app-id (no hardcoded URLs)
 */

import { NextResponse } from "next/server";
import { invokeService } from "@/lib/dapr/client";

// Planner orchestrator Dapr app ID
// Use namespace-qualified app ID for cross-namespace Dapr invocation
const PLANNER_ORCHESTRATOR_APP_ID = process.env.PLANNER_AGENT_APP_ID || "planner-orchestrator.planner-agent";

export const maxDuration = 60; // Allow up to 60 seconds for workflow scheduling

interface StartWorkflowRequest {
  task: string;
  sessionId?: string;
  targetRepository?: {
    owner: string;
    repo: string;
    branch: string;
  };
  options?: {
    autoApprove?: boolean;
    workingDirectory?: string;
  };
}

interface StartWorkflowResponse {
  success: boolean;
  workflowId?: string;
  status?: string;
  error?: string;
}

export async function POST(request: Request): Promise<Response> {
  let requestBody: StartWorkflowRequest;

  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid JSON body",
      } satisfies StartWorkflowResponse,
      { status: 400 }
    );
  }

  try {
    const { task, sessionId, targetRepository, options } = requestBody;

    // Validate required fields
    if (!task || task.trim() === "") {
      return NextResponse.json(
        {
          success: false,
          error: "Task description is required",
        } satisfies StartWorkflowResponse,
        { status: 400 }
      );
    }

    console.log(`[Workflow Start] Invoking ${PLANNER_ORCHESTRATOR_APP_ID} via Dapr service invocation`);
    console.log(`[Workflow Start] Task: ${task.substring(0, 100)}...`);
    if (sessionId) {
      console.log(`[Workflow Start] Session ID: ${sessionId}`);
    }
    if (targetRepository) {
      console.log(`[Workflow Start] Target Repository: ${targetRepository.owner}/${targetRepository.repo}@${targetRepository.branch}`);
    }

    // Call planner-orchestrator's workflow API via Dapr service invocation
    // Map: UI sends {task}, orchestrator expects {feature_request, cwd}
    const response = await invokeService<{ workflow_id: string; status: string; error?: string }>({
      appId: PLANNER_ORCHESTRATOR_APP_ID,
      method: "POST",
      path: "/api/workflows",
      body: {
        feature_request: task,
        cwd: options?.workingDirectory || "/app/workspace",
      },
      timeout: 60000, // Allow up to 60 seconds for workflow scheduling
    });

    if (!response.ok) {
      const errorMsg = response.data?.error || `Workflow service error: ${response.status}`;
      console.error(`[Workflow Start] Orchestrator returned ${response.status}: ${errorMsg}`);
      return NextResponse.json(
        {
          success: false,
          error: errorMsg,
        } satisfies StartWorkflowResponse,
        { status: response.status }
      );
    }

    // Map: orchestrator returns {workflow_id}, UI expects {workflowId}
    const workflowId = response.data?.workflow_id;

    console.log(
      `[Workflow Start] Workflow started successfully: ${workflowId}`
    );

    return NextResponse.json(
      {
        success: true,
        workflowId,
        status: response.data?.status,
      } satisfies StartWorkflowResponse,
      { status: 201 }
    );
  } catch (error) {
    console.error("[Workflow Start] Error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } satisfies StartWorkflowResponse,
      { status: 500 }
    );
  }
}
