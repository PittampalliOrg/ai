/**
 * Workflow Status API - Multi-Backend Support
 *
 * GET /api/workflows/[instanceId]/status
 * Fetches workflow status from the appropriate backend based on workflow ID prefix:
 * - wf-* → planner-dapr-agent (via HTTP)
 * - planner-* → planner-orchestrator (via Dapr service invocation)
 * - Other → planner-orchestrator (via Dapr service invocation)
 *
 * Benefits of Dapr service invocation:
 * - Automatic mTLS encryption between services
 * - Built-in retries and circuit breakers
 * - Distributed tracing for observability
 * - Service discovery via app-id (no hardcoded URLs)
 */

import { NextResponse, type NextRequest } from "next/server";
import { invokeService } from "@/lib/dapr/client";
import { getConfig } from "@/lib/dapr/config-provider";

// Service configuration from Dapr Configuration (Azure App Config)
const getPlannerOrchestratorAppId = () =>
  getConfig("PLANNER_AGENT_APP_ID", "planner-orchestrator.planner-agent");

const getPlannerDaprAgentUrl = () =>
  getConfig("PLANNER_DAPR_AGENT_URL", "http://planner-dapr-agent.ai-chatbot.svc.cluster.local:8000");

/**
 * Response from the new planner-orchestrator (flat format)
 */
interface OrchestratorStatusResponse {
  workflow_id: string;
  runtime_status: string;
  phase?: string;
  progress?: number;
  message?: string;
  output?: unknown;
  error?: string;
}

/**
 * Response returned to the UI (preserves existing contract with nested custom_status)
 */
interface WorkflowStatusResponse {
  success: boolean;
  instance_id: string;
  runtime_status: string | null;
  custom_status: {
    phase?: string;
    progress?: number;
    message?: string;
    [key: string]: unknown;
  } | null;
  created_at: string | null;
  last_updated_at: string | null;
  error: string | null;
}

interface RouteParams {
  params: Promise<{ instanceId: string }>;
}

/**
 * GET /api/workflows/[instanceId]/status
 *
 * Fetches workflow status from the appropriate backend:
 * - wf-* → planner-dapr-agent via HTTP
 * - Other → planner-orchestrator via Dapr service invocation
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { instanceId } = await params;

  if (!instanceId) {
    return NextResponse.json(
      { error: "Instance ID is required" },
      { status: 400 }
    );
  }

  // Handle wf-* workflow IDs via planner-dapr-agent
  if (instanceId.startsWith("wf-")) {
    try {
      // Use /workflows/{id} endpoint which has phase, progress, plan data
      const daprAgentUrl = `${getPlannerDaprAgentUrl()}/workflows/${instanceId}`;
      console.log(`[Workflow Status] Fetching wf-* workflow from ${daprAgentUrl}`);

      const response = await fetch(daprAgentUrl, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return NextResponse.json({
            success: false,
            instance_id: instanceId,
            runtime_status: null,
            custom_status: null,
            created_at: null,
            last_updated_at: null,
            error: "Workflow not found",
          } satisfies WorkflowStatusResponse);
        }

        const errorText = await response.text();
        console.error(`[Workflow Status] Planner Dapr Agent returned ${response.status}: ${errorText}`);
        return NextResponse.json({
          success: false,
          instance_id: instanceId,
          runtime_status: null,
          custom_status: null,
          created_at: null,
          last_updated_at: null,
          error: `Service error: ${response.status}`,
        } satisfies WorkflowStatusResponse);
      }

      const data = await response.json() as {
        instanceId: string;
        status: string;
        phase?: string;
        progress?: number;
        message?: string;
        plan?: {
          summary?: string;
          tasks?: Array<{ id: string; subject: string; description: string; status: string }>;
          tests?: Array<{ id: string; description: string }>;
          reasoning?: string;
        };
        createdAt?: string;
        updatedAt?: string;
        error?: string;
      };

      // Map response to UI format with nested custom_status
      return NextResponse.json({
        success: true,
        instance_id: data.instanceId || instanceId,
        runtime_status: data.status?.toUpperCase() || null,
        custom_status: {
          phase: data.phase,
          progress: data.progress,
          message: data.message,
          plan: data.plan,
        },
        created_at: data.createdAt || null,
        last_updated_at: data.updatedAt || null,
        error: data.error || null,
      } satisfies WorkflowStatusResponse);
    } catch (error) {
      console.error(`[Workflow Status] Error fetching from planner-dapr-agent:`, error);
      return NextResponse.json({
        success: false,
        instance_id: instanceId,
        runtime_status: null,
        custom_status: null,
        created_at: null,
        last_updated_at: null,
        error: error instanceof Error ? error.message : "Failed to fetch status",
      } satisfies WorkflowStatusResponse);
    }
  }

  // Handle other workflow IDs via Dapr service invocation to planner-orchestrator
  try {
    console.log(`[Workflow Status] Invoking ${getPlannerOrchestratorAppId()} via Dapr service invocation`);

    const response = await invokeService<OrchestratorStatusResponse>({
      appId: getPlannerOrchestratorAppId(),
      method: "GET",
      path: `/api/workflows/${instanceId}/status`,
      timeout: 15000,
    });

    if (!response.ok) {
      // If orchestrator is not available or workflow not found, return null status
      // rather than erroring (allows UI to fall back to event-based inference)
      if (response.status === 404) {
        return NextResponse.json({
          success: false,
          instance_id: instanceId,
          runtime_status: null,
          custom_status: null,
          created_at: null,
          last_updated_at: null,
          error: "Workflow not found",
        } satisfies WorkflowStatusResponse);
      }

      console.error(`[Workflow Status] Service returned ${response.status}: ${response.statusText}`);
      return NextResponse.json({
        success: false,
        instance_id: instanceId,
        runtime_status: null,
        custom_status: null,
        created_at: null,
        last_updated_at: null,
        error: `Service error: ${response.status}`,
      } satisfies WorkflowStatusResponse);
    }

    // Map flat orchestrator response → nested UI format
    const data = response.data;
    return NextResponse.json({
      success: true,
      instance_id: data?.workflow_id || instanceId,
      runtime_status: data?.runtime_status || null,
      custom_status: {
        phase: data?.phase,
        progress: data?.progress,
        message: data?.message,
      },
      created_at: null,
      last_updated_at: null,
      error: data?.error || null,
    } satisfies WorkflowStatusResponse);
  } catch (error) {
    // Connection errors - service may be unavailable
    console.error(`[Workflow Status] Error fetching status:`, error);

    return NextResponse.json({
      success: false,
      instance_id: instanceId,
      runtime_status: null,
      custom_status: null,
      created_at: null,
      last_updated_at: null,
      error: error instanceof Error ? error.message : "Failed to fetch status",
    } satisfies WorkflowStatusResponse);
  }
}
