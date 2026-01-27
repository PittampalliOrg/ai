/**
 * Workflow Approve API
 *
 * POST /api/workflows/[instanceId]/approve
 * Proxies approval requests to the planner-agent service.
 *
 * The planner-agent workflow uses Dapr's wait_for_external_event pattern.
 * This endpoint raises the approval event to resume the workflow.
 */

import { NextResponse, type NextRequest } from "next/server";

// Planner agent service configuration (the SINGLE workflow orchestrator)
const PLANNER_AGENT_URL =
  process.env.WORKFLOW_SERVICE_URL || "http://planner-agent.planner-agent.svc.cluster.local:8080";

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
    // Call planner-agent's workflow approval endpoint
    const approvalUrl = `${PLANNER_AGENT_URL}/api/workflow/${instanceId}/approve`;

    console.log(`[Workflow Approve] Sending ${isApproval ? "approval" : "rejection"} to ${approvalUrl}`);
    console.log(`[Workflow Approve] Plan ID: ${planId}`);

    const response = await fetch(approvalUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        plan_id: planId,
        approved: isApproval,
        reviewer: requestBody.approvedBy,
        reason: requestBody.comments,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
      console.error(`[Workflow Approve] Planner-agent returned ${response.status}:`, errorData);

      return NextResponse.json(
        {
          success: false,
          workflowId: instanceId,
          error: errorData.error || `Workflow service error: ${response.status}`,
        } satisfies ApproveWorkflowResponse,
        { status: response.status }
      );
    }

    const data = await response.json();

    console.log(`[Workflow Approve] Workflow ${instanceId} ${isApproval ? "approved" : "rejected"} successfully`);

    return NextResponse.json({
      success: true,
      workflowId: instanceId,
      status: isApproval ? "APPROVED" : "REJECTED",
      message: isApproval ? "Plan approved, execution starting" : "Plan rejected",
    } satisfies ApproveWorkflowResponse);
  } catch (error) {
    console.error(`[Workflow Approve] Error:`, error);

    // Check if it's a connection error
    if (error instanceof TypeError && error.message.includes("fetch")) {
      return NextResponse.json(
        {
          success: false,
          workflowId: instanceId,
          error: "Cannot connect to planner-agent service. Make sure planner-agent is running.",
        } satisfies ApproveWorkflowResponse,
        { status: 503 }
      );
    }

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
