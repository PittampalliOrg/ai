/**
 * Ralph Workflow Start API
 *
 * POST /api/ralph/start
 * Starts a new Ralph Loop workflow for planning and execution.
 */

import { auth } from "@/app/(auth)/auth";
import { ChatSDKError } from "@/lib/errors";
import { verifyUserExists } from "@/lib/db/queries";
import {
  getAgentSession,
  updateAgentSessionStatus,
} from "@/lib/db/agent-queries";
import {
  initializeWorkflowRuntime,
  scheduleWorkflow,
  RALPH_EVENTS,
} from "@/lib/ralph";
import { type RalphWorkflowInput } from "@/lib/types/ralph-plan";

export const maxDuration = 30; // 30 seconds max for starting the workflow

interface StartWorkflowRequest {
  sessionId: string;
  prompt: string;
  targetRepository?: {
    owner: string;
    repo: string;
    branch: string;
    installationId?: string;
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
  } catch (_) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  try {
    const { sessionId, prompt, targetRepository } = requestBody;

    // Validate required fields
    if (!sessionId || !prompt) {
      return Response.json(
        {
          success: false,
          error: "Missing required fields: sessionId and prompt are required",
        } satisfies StartWorkflowResponse,
        { status: 400 }
      );
    }

    if (!targetRepository) {
      return Response.json(
        {
          success: false,
          error: "Missing required field: targetRepository is required for Ralph workflows",
        } satisfies StartWorkflowResponse,
        { status: 400 }
      );
    }

    // Authenticate user
    const session = await auth();
    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    // Verify user exists
    const userExists = await verifyUserExists(session.user.id);
    if (!userExists) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    // Verify the agent session exists and belongs to the user
    const agentSession = await getAgentSession({ id: sessionId });
    if (!agentSession) {
      return Response.json(
        {
          success: false,
          error: "Agent session not found",
        } satisfies StartWorkflowResponse,
        { status: 404 }
      );
    }

    if (agentSession.userId !== session.user.id) {
      return new ChatSDKError("forbidden:chat").toResponse();
    }

    // Check if a workflow is already running for this session
    if (agentSession.status === "running") {
      return Response.json(
        {
          success: false,
          error: "A workflow is already running for this session",
        } satisfies StartWorkflowResponse,
        { status: 409 }
      );
    }

    // Initialize workflow runtime
    try {
      await initializeWorkflowRuntime();
    } catch (error) {
      console.error("[Ralph Start] Failed to initialize workflow runtime:", error);
      return Response.json(
        {
          success: false,
          error: "Workflow runtime is not available. Check Dapr configuration.",
        } satisfies StartWorkflowResponse,
        { status: 503 }
      );
    }

    // Prepare workflow input
    const workflowInput: RalphWorkflowInput = {
      sessionId,
      userPrompt: prompt,
      targetRepo: {
        owner: targetRepository.owner,
        repo: targetRepository.repo,
        branch: targetRepository.branch,
        installationId: targetRepository.installationId,
      },
    };

    // Schedule the workflow
    console.log(`[Ralph Start] Scheduling workflow for session ${sessionId}`);
    const workflowId = await scheduleWorkflow(
      "ralphLoopWorkflow",
      workflowInput,
      sessionId // Use sessionId as workflowId for correlation
    );

    // Update session status
    await updateAgentSessionStatus({
      id: sessionId,
      status: "running",
    });

    console.log(`[Ralph Start] Workflow started with ID: ${workflowId}`);

    return Response.json(
      {
        success: true,
        workflowId,
        status: "started",
      } satisfies StartWorkflowResponse,
      { status: 200 }
    );
  } catch (error) {
    console.error("[Ralph Start] Error starting workflow:", error);

    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } satisfies StartWorkflowResponse,
      { status: 500 }
    );
  }
}
