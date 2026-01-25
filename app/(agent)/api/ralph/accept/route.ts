/**
 * Ralph Workflow Accept/Feedback API
 *
 * POST /api/ralph/accept
 * Sends user acceptance or feedback to a running Ralph workflow.
 */

import { auth } from "@/app/(auth)/auth";
import { ChatSDKError } from "@/lib/errors";
import { verifyUserExists } from "@/lib/db/queries";
import { getAgentSession } from "@/lib/db/agent-queries";
import {
  initializeWorkflowRuntime,
  raiseWorkflowEvent,
  getWorkflowState,
  RALPH_EVENTS,
} from "@/lib/ralph";
import { type UserPlanResponse } from "@/lib/types/ralph-plan";

export const maxDuration = 10; // 10 seconds max for raising an event

interface AcceptRequest {
  sessionId: string;
  accepted: boolean;
  feedback?: string;
}

interface AcceptResponse {
  success: boolean;
  status?: string;
  error?: string;
}

export async function POST(request: Request): Promise<Response> {
  let requestBody: AcceptRequest;

  try {
    requestBody = await request.json();
  } catch (_) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  try {
    const { sessionId, accepted, feedback } = requestBody;

    // Validate required fields
    if (!sessionId) {
      return Response.json(
        {
          success: false,
          error: "Missing required field: sessionId",
        } satisfies AcceptResponse,
        { status: 400 }
      );
    }

    if (typeof accepted !== "boolean") {
      return Response.json(
        {
          success: false,
          error: "Missing required field: accepted (boolean)",
        } satisfies AcceptResponse,
        { status: 400 }
      );
    }

    // If not accepting, feedback is required
    if (!accepted && !feedback?.trim()) {
      return Response.json(
        {
          success: false,
          error: "Feedback is required when not accepting the plan",
        } satisfies AcceptResponse,
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
        } satisfies AcceptResponse,
        { status: 404 }
      );
    }

    if (agentSession.userId !== session.user.id) {
      return new ChatSDKError("forbidden:chat").toResponse();
    }

    // Initialize workflow runtime
    try {
      await initializeWorkflowRuntime();
    } catch (error) {
      console.error("[Ralph Accept] Failed to initialize workflow runtime:", error);
      return Response.json(
        {
          success: false,
          error: "Workflow runtime is not available",
        } satisfies AcceptResponse,
        { status: 503 }
      );
    }

    // Check workflow state
    const workflowState = await getWorkflowState(sessionId);
    if (!workflowState) {
      return Response.json(
        {
          success: false,
          error: "No active workflow found for this session",
        } satisfies AcceptResponse,
        { status: 404 }
      );
    }

    if (workflowState.runtimeStatus !== "RUNNING") {
      return Response.json(
        {
          success: false,
          error: `Workflow is not running (status: ${workflowState.runtimeStatus})`,
        } satisfies AcceptResponse,
        { status: 409 }
      );
    }

    // Prepare the event data
    const userResponse: UserPlanResponse = {
      accepted,
      feedback: feedback?.trim(),
    };

    // Raise the external event
    console.log(
      `[Ralph Accept] Raising event for session ${sessionId}: accepted=${accepted}`
    );
    await raiseWorkflowEvent(
      sessionId,
      RALPH_EVENTS.USER_PLAN_RESPONSE,
      userResponse
    );

    return Response.json(
      {
        success: true,
        status: accepted ? "plan_accepted" : "feedback_submitted",
      } satisfies AcceptResponse,
      { status: 200 }
    );
  } catch (error) {
    console.error("[Ralph Accept] Error processing acceptance:", error);

    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } satisfies AcceptResponse,
      { status: 500 }
    );
  }
}
