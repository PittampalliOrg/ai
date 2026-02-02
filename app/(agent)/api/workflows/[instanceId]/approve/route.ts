/**
 * Workflow Approve API
 *
 * POST /api/workflows/[instanceId]/approve
 * Proxies approval requests to the planner-dapr-agent service using Dapr service invocation.
 *
 * The planner-dapr-agent workflow uses Dapr's wait_for_external_event pattern.
 * This endpoint raises the approval event to resume the workflow.
 *
 * Benefits of Dapr service invocation:
 * - Automatic mTLS encryption between services
 * - Built-in retries and circuit breakers
 * - Distributed tracing for observability
 * - Service discovery via app-id (no hardcoded URLs)
 */

import { NextResponse, type NextRequest } from "next/server";
import { invokeService } from "@/lib/dapr/client";

// Planner dapr agent Dapr app ID
// Use namespace-qualified app ID for cross-namespace Dapr invocation
const PLANNER_DAPR_AGENT_APP_ID = process.env.PLANNER_DAPR_AGENT_APP_ID || "planner-dapr-agent.planner-agent";

interface RouteParams {
  params: Promise<{ instanceId: string }>;
}

interface ApproveWorkflowRequest {
  approved?: boolean;
  comments?: string;
  approvedBy?: string;
}

interface ApproveWorkflowResponse {
  success: boolean;
  workflowId: string;
  status?: string;
  message?: string;
  error?: string;
}

/**
 * POST /api/workflows/[instanceId]/approve
 *
 * Approves or rejects a workflow by raising the approval event in planner-dapr-agent.
 * The workflow is paused at wait_for_external_event("approval") with a 24h timeout.
 *
 * Request body:
 * - approved: boolean (default: true)
 * - comments: string (optional feedback / reason)
 * - approvedBy: string (optional user identifier)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { instanceId } = await params;

  if (!instanceId) {
    return NextResponse.json(
      {
        success: false,
        workflowId: "",
        error: "Instance ID is required",
      } satisfies ApproveWorkflowResponse,
      { status: 400 }
    );
  }

  let requestBody: ApproveWorkflowRequest = {};

  try {
    const text = await request.text();
    if (text) {
      requestBody = JSON.parse(text);
    }
  } catch {
    return NextResponse.json(
      {
        success: false,
        workflowId: instanceId,
        error: "Invalid JSON body",
      } satisfies ApproveWorkflowResponse,
      { status: 400 }
    );
  }

  // Determine if this is an approval or rejection
  const isApproval = requestBody.approved !== false;

  try {
    // Call planner-dapr-agent's workflow approval endpoint via Dapr service invocation
    console.log(`[Workflow Approve] Invoking ${PLANNER_DAPR_AGENT_APP_ID} via Dapr service invocation`);
    console.log(`[Workflow Approve] ${isApproval ? "Approving" : "Rejecting"} workflow ${instanceId}`);

    const response = await invokeService<{ success: boolean; error?: string }>({
      appId: PLANNER_DAPR_AGENT_APP_ID,
      method: "POST",
      path: `/workflow/${instanceId}/approve`,
      body: {
        approved: isApproval,
        reason: requestBody.comments,
      },
      timeout: 30000,
    });

    if (!response.ok) {
      const errorMsg = response.data?.error || `Workflow service error: ${response.status}`;
      console.error(`[Workflow Approve] Agent returned ${response.status}: ${errorMsg}`);

      return NextResponse.json(
        {
          success: false,
          workflowId: instanceId,
          error: errorMsg,
        } satisfies ApproveWorkflowResponse,
        { status: response.status }
      );
    }

    console.log(`[Workflow Approve] Workflow ${instanceId} ${isApproval ? "approved" : "rejected"} successfully`);

    return NextResponse.json({
      success: true,
      workflowId: instanceId,
      status: isApproval ? "APPROVED" : "REJECTED",
      message: isApproval ? "Plan approved, execution starting" : "Plan rejected",
    } satisfies ApproveWorkflowResponse);
  } catch (error) {
    console.error(`[Workflow Approve] Error:`, error);

    return NextResponse.json(
      {
        success: false,
        workflowId: instanceId,
        error: error instanceof Error ? error.message : "Unknown error",
      } satisfies ApproveWorkflowResponse,
      { status: 500 }
    );
  }
}
