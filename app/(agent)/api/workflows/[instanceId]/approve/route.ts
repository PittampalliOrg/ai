/**
 * Workflow Approve API
 *
 * POST /api/workflows/[instanceId]/approve
 * Proxies approval requests to the appropriate backend:
 * - wf-* → planner-dapr-agent (via Dapr service invocation)
 * - Other → workflow-orchestrator (via Dapr cross-namespace invocation)
 *
 * The workflow uses Dapr's wait_for_external_event pattern.
 * This endpoint raises the approval event to resume the workflow.
 */

import { NextResponse, type NextRequest } from "next/server";
import { invokeService } from "@/lib/dapr/client";
import { getConfig } from "@/lib/dapr/config-provider";

// Planner dapr agent Dapr app ID from Dapr Configuration (Azure App Config)
const getPlannerDaprAgentAppId = () =>
  getConfig("PLANNER_DAPR_AGENT_APP_ID", "planner-dapr-agent.workflow-builder");

// Workflow orchestrator Dapr app ID (cross-namespace invocation to workflow-builder)
const getWorkflowOrchestratorAppId = () =>
  getConfig("WORKFLOW_ORCHESTRATOR_APP_ID", "workflow-orchestrator.workflow-builder");

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
 * Approves or rejects a workflow by raising the approval event.
 * Routes to planner-dapr-agent (wf-*) or workflow-orchestrator (others).
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
    console.log(`[Workflow Approve] ${isApproval ? "Approving" : "Rejecting"} workflow ${instanceId}`);

    let response: { ok: boolean; status: number; data: { success?: boolean; error?: string } | null };

    if (instanceId.startsWith("wf-")) {
      // Route to planner-dapr-agent for wf-* workflows
      console.log(`[Workflow Approve] Invoking ${getPlannerDaprAgentAppId()} via Dapr service invocation`);

      response = await invokeService<{ success: boolean; error?: string }>({
        appId: getPlannerDaprAgentAppId(),
        method: "POST",
        path: `/workflow/${instanceId}/approve`,
        body: {
          approved: isApproval,
          reason: requestBody.comments,
        },
        timeout: 30000,
      });
    } else {
      // Route to workflow-orchestrator for all other workflows
      // First get the current node ID so we can construct the correct approval event name
      // The orchestrator uses eventName from node config, or "approval_{nodeId}" as fallback
      console.log(`[Workflow Approve] Invoking ${getWorkflowOrchestratorAppId()} via Dapr service invocation`);

      let approvalEventName = "plan-approval"; // fallback
      try {
        const statusResponse = await invokeService<{
          currentNodeId?: string | null;
          currentNodeName?: string | null;
          phase?: string | null;
          approvalEventName?: string | null;
        }>({
          appId: getWorkflowOrchestratorAppId(),
          method: "GET",
          path: `/api/v2/workflows/${instanceId}/status`,
          timeout: 10000,
        });
        if (statusResponse.ok && statusResponse.data) {
          // Prefer the actual event name from the workflow's custom status
          // This matches what the workflow is waiting for (config.eventName or approval_{nodeId})
          if (statusResponse.data.approvalEventName) {
            approvalEventName = statusResponse.data.approvalEventName;
            console.log(`[Workflow Approve] Using event name from workflow: ${approvalEventName}`);
          } else if (statusResponse.data.currentNodeId) {
            approvalEventName = `approval_${statusResponse.data.currentNodeId}`;
            console.log(`[Workflow Approve] Using fallback event name: ${approvalEventName} (from node ${statusResponse.data.currentNodeId})`);
          }
        }
      } catch (statusError) {
        console.warn(`[Workflow Approve] Could not get workflow status, using fallback event name`);
      }

      response = await invokeService<{ success: boolean; instanceId?: string; eventName?: string; error?: string }>({
        appId: getWorkflowOrchestratorAppId(),
        method: "POST",
        path: `/api/v2/workflows/${instanceId}/events`,
        body: {
          eventName: approvalEventName,
          eventData: {
            approved: isApproval,
            reason: requestBody.comments,
          },
        },
        timeout: 30000,
      });
    }

    if (!response.ok) {
      const errorMsg = response.data?.error || `Workflow service error: ${response.status}`;
      console.error(`[Workflow Approve] Service returned ${response.status}: ${errorMsg}`);

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
