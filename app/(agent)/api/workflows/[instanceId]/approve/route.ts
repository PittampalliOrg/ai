/**
 * Workflow Approve API
 *
 * POST /api/workflows/[instanceId]/approve
 * Proxies approval requests to the planner-agent service using Dapr service invocation.
 *
 * The planner-agent workflow uses Dapr's wait_for_external_event pattern.
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

// Planner agent Dapr app ID
// Use namespace-qualified app ID for cross-namespace Dapr invocation
const PLANNER_AGENT_APP_ID = process.env.PLANNER_AGENT_APP_ID || "planner-agent.planner-agent";

interface RouteParams {
  params: Promise<{ instanceId: string }>;
}

interface ApproveWorkflowRequest {
  approved?: boolean;
  comments?: string;
  approvedBy?: string;
  planId?: string;
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
 * Approves or rejects a workflow by raising the approval event in planner-agent.
 * The planner-agent workflow is paused at wait_for_external_event("plan_approval_{planId}").
 *
 * Request body:
 * - approved: boolean (default: true)
 * - comments: string (optional feedback)
 * - approvedBy: string (optional user identifier)
 * - planId: string (optional, defaults to "plan_1")
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

  // Plan ID for the event name (default to plan_1 if not provided)
  const planId = requestBody.planId || "plan_1";

  try {
    // Call planner-agent's workflow approval endpoint via Dapr service invocation
    console.log(`[Workflow Approve] Invoking ${PLANNER_AGENT_APP_ID} via Dapr service invocation`);
    console.log(`[Workflow Approve] ${isApproval ? "Approving" : "Rejecting"} workflow ${instanceId}`);
    console.log(`[Workflow Approve] Plan ID: ${planId}`);

    const response = await invokeService<{ success: boolean; plan_id: string; error?: string }>({
      appId: PLANNER_AGENT_APP_ID,
      method: "POST",
      path: `/api/workflow/${instanceId}/approve`,
      body: {
        plan_id: planId,
        approved: isApproval,
        reviewer: requestBody.approvedBy,
        reason: requestBody.comments,
      },
      timeout: 30000,
    });

    if (!response.ok) {
      const errorMsg = response.data?.error || `Workflow service error: ${response.status}`;
      console.error(`[Workflow Approve] Planner-agent returned ${response.status}: ${errorMsg}`);

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
