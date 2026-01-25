/**
 * Ralph Workflow Status API
 *
 * GET /api/ralph/status?sessionId=xxx
 * Returns the current status and plan of a Ralph workflow.
 */

import { auth } from "@/app/(auth)/auth";
import { ChatSDKError } from "@/lib/errors";
import { verifyUserExists } from "@/lib/db/queries";
import { getAgentSession } from "@/lib/db/agent-queries";
import {
  initializeWorkflowRuntime,
  getWorkflowState,
  type WorkflowRuntimeStatus,
} from "@/lib/ralph";
import {
  type TaskPlan,
  type TaskPlanStatus,
  getPlanStats,
} from "@/lib/types/ralph-plan";

export const maxDuration = 10; // 10 seconds max

interface StatusResponse {
  success: boolean;
  workflowStatus?: WorkflowRuntimeStatus;
  planStatus?: TaskPlanStatus;
  plan?: TaskPlan;
  stats?: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
    inProgress: number;
    skipped: number;
    percentComplete: number;
  };
  error?: string;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");

    // Validate required fields
    if (!sessionId) {
      return Response.json(
        {
          success: false,
          error: "Missing required query parameter: sessionId",
        } satisfies StatusResponse,
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
        } satisfies StatusResponse,
        { status: 404 }
      );
    }

    if (agentSession.userId !== session.user.id) {
      return new ChatSDKError("forbidden:chat").toResponse();
    }

    // Try to get workflow state from Dapr
    let workflowStatus: WorkflowRuntimeStatus = "UNKNOWN";
    let workflowOutput: TaskPlan | null = null;

    try {
      await initializeWorkflowRuntime();
      const workflowState = await getWorkflowState(sessionId);

      if (workflowState) {
        workflowStatus = workflowState.runtimeStatus;

        // Parse the output if workflow is completed
        if (workflowState.serializedOutput) {
          try {
            workflowOutput = JSON.parse(workflowState.serializedOutput);
          } catch {
            // Output may not be valid JSON
          }
        }
      }
    } catch {
      // Workflow runtime may not be available - fall back to database
      console.log("[Ralph Status] Workflow runtime not available, using database");
    }

    // Get plan from database as fallback/primary source
    const plan = (agentSession.taskPlan as TaskPlan) || workflowOutput;

    // Build response
    const response: StatusResponse = {
      success: true,
      workflowStatus,
    };

    if (plan) {
      response.planStatus = plan.status;
      response.plan = plan;
      response.stats = getPlanStats(plan);
    }

    return Response.json(response, { status: 200 });
  } catch (error) {
    console.error("[Ralph Status] Error getting status:", error);

    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } satisfies StatusResponse,
      { status: 500 }
    );
  }
}
