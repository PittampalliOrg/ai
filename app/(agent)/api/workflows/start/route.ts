/**
 * Workflow Start API
 *
 * POST /api/workflows/start
 * Proxies workflow start requests to the workflow-orchestrator service.
 */

import { NextResponse } from "next/server";

// Workflow orchestrator service configuration
// Use full DNS name for cross-namespace communication
const WORKFLOW_SERVICE_URL =
  process.env.WORKFLOW_SERVICE_URL || "http://workflow-orchestrator.dapr-agents.svc.cluster.local:80";

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

    // Build the workflow service URL
    const workflowUrl = `${WORKFLOW_SERVICE_URL}/api/workflows`;

    console.log(`[Workflow Start] Scheduling workflow at ${workflowUrl}`);
    console.log(`[Workflow Start] Task: ${task.substring(0, 100)}...`);
    if (sessionId) {
      console.log(`[Workflow Start] Session ID: ${sessionId}`);
    }
    if (targetRepository) {
      console.log(`[Workflow Start] Target Repository: ${targetRepository.owner}/${targetRepository.repo}@${targetRepository.branch}`);
    }

    // Call the workflow-orchestrator service
    const response = await fetch(workflowUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: task,
        sessionId,
        options: {
          autoApprove: options?.autoApprove ?? false,
          workingDirectory: options?.workingDirectory,
          targetRepository,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[Workflow Start] Service returned ${response.status}: ${errorText}`
      );
      return NextResponse.json(
        {
          success: false,
          error: `Workflow service error: ${response.status} - ${errorText}`,
        } satisfies StartWorkflowResponse,
        { status: response.status }
      );
    }

    const data = await response.json();

    console.log(
      `[Workflow Start] Workflow scheduled successfully: ${data.workflowId}`
    );

    return NextResponse.json(
      {
        success: true,
        workflowId: data.workflowId,
        status: data.status,
      } satisfies StartWorkflowResponse,
      { status: 201 }
    );
  } catch (error) {
    console.error("[Workflow Start] Error:", error);

    // Check if it's a connection error
    if (error instanceof TypeError && error.message.includes("fetch")) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Cannot connect to workflow service. Make sure workflow-orchestrator is running.",
        } satisfies StartWorkflowResponse,
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } satisfies StartWorkflowResponse,
      { status: 500 }
    );
  }
}
