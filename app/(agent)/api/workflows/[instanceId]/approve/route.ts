/**
 * Workflow Approve API
 *
 * POST /api/workflows/[instanceId]/approve
 * Unified approval for both:
 * 1. workflow-orchestrator service (Ralph workflows)
 * 2. workflow-patterns Dapr runtime (raises plan_approval event)
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  initializeWorkflowPatternsRuntime,
  getWorkflowPatternsClient,
  getWorkflowPatternState,
  isWorkflowPatternsRuntimeInitialized,
} from "@/lib/workflow-patterns/runtime";
import { getWorkflow as getWorkflowFromIndex } from "@/lib/workflow-patterns/workflow-index";

// Workflow orchestrator service configuration
const WORKFLOW_SERVICE_URL =
  process.env.WORKFLOW_SERVICE_URL || "http://workflow-orchestrator.dapr-agents.svc.cluster.local:80";

// Enable workflow patterns
const WORKFLOW_PATTERNS_ENABLED = process.env.WORKFLOW_PATTERNS_ENABLED === "true";

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
 * Approves or rejects a workflow. The request body can specify:
 * - approved: boolean (default: true)
 * - comments: string (optional feedback)
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

  // Try workflow-patterns first if enabled
  if (WORKFLOW_PATTERNS_ENABLED) {
    try {
      // Check if this is a workflow-patterns workflow
      const indexEntry = await getWorkflowFromIndex(instanceId);

      if (indexEntry) {
        console.log(`[Workflow Approve] Found workflow-patterns workflow: ${instanceId}`);

        // Initialize runtime if needed
        if (!isWorkflowPatternsRuntimeInitialized()) {
          await initializeWorkflowPatternsRuntime();
        }

        // Get current state to verify it's waiting for approval
        const state = await getWorkflowPatternState(instanceId);

        if (!state) {
          return NextResponse.json(
            {
              success: false,
              workflowId: instanceId,
              error: "Workflow instance not found",
            } satisfies ApproveWorkflowResponse,
            { status: 404 }
          );
        }

        // Check if workflow is running (waiting for approval)
        if (state.runtimeStatus !== "RUNNING") {
          return NextResponse.json(
            {
              success: false,
              workflowId: instanceId,
              error: `Workflow is not waiting for approval (status: ${state.runtimeStatus})`,
            } satisfies ApproveWorkflowResponse,
            { status: 400 }
          );
        }

        // Raise the plan_approval event
        const client = getWorkflowPatternsClient();
        await client.raiseEvent(instanceId, "plan_approval", {
          approved: isApproval,
          comments: requestBody.comments,
        });

        console.log(`[Workflow Approve] Raised plan_approval event for ${instanceId}: ${isApproval ? "approved" : "rejected"}`);

        return NextResponse.json({
          success: true,
          workflowId: instanceId,
          status: isApproval ? "APPROVED" : "REJECTED",
          message: isApproval ? "Workflow approved" : "Workflow rejected",
        } satisfies ApproveWorkflowResponse);
      }
    } catch (patternsError) {
      console.log(`[Workflow Approve] Not a workflow-patterns workflow: ${instanceId}`, patternsError);
      // Fall through to orchestrator
    }
  }

  // Fall back to workflow-orchestrator
  try {
    // Build the appropriate endpoint URL
    const endpoint = isApproval ? "approve" : "reject";
    const workflowUrl = `${WORKFLOW_SERVICE_URL}/api/workflows/${instanceId}/${endpoint}`;

    console.log(`[Workflow Approve] ${isApproval ? "Approving" : "Rejecting"} workflow at ${workflowUrl}`);

    // Call the workflow-orchestrator service
    const response = await fetch(workflowUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        approved: isApproval,
        comments: requestBody.comments,
        approvedBy: requestBody.approvedBy,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
      console.error(`[Workflow Approve] Service returned ${response.status}:`, errorData);

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

    console.log(`[Workflow Approve] Workflow ${instanceId} ${isApproval ? "approved" : "rejected"}`);

    return NextResponse.json({
      success: true,
      workflowId: data.workflowId || instanceId,
      status: data.status,
      message: data.message || (isApproval ? "Workflow approved" : "Workflow rejected"),
    } satisfies ApproveWorkflowResponse);
  } catch (error) {
    console.error(`[Workflow Approve] Error:`, error);

    // Check if it's a connection error
    if (error instanceof TypeError && error.message.includes("fetch")) {
      return NextResponse.json(
        {
          success: false,
          workflowId: instanceId,
          error: "Cannot connect to workflow service. Make sure workflow-orchestrator is running.",
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
