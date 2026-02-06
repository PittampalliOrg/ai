/**
 * Workflow Status API - Multi-Backend Support
 *
 * GET /api/workflows/[instanceId]/status
 * Fetches workflow status from the appropriate backend based on workflow ID prefix:
 * - wf-* → planner-dapr-agent (via HTTP)
 * - Other → workflow-orchestrator (via Dapr cross-namespace invocation)
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
const getWorkflowOrchestratorAppId = () =>
  getConfig("WORKFLOW_ORCHESTRATOR_APP_ID", "workflow-orchestrator.workflow-builder");

const getPlannerDaprAgentAppId = () =>
  getConfig("PLANNER_DAPR_AGENT_APP_ID", "planner-dapr-agent.workflow-builder");

/**
 * Response from workflow-orchestrator GET /api/v2/workflows/{id}/status
 */
interface OrchestratorStatusResponse {
  instanceId: string;
  workflowId: string;
  runtimeStatus: string;
  phase?: string | null;
  progress?: number;
  message?: string | null;
  currentNodeId?: string | null;
  currentNodeName?: string | null;
  outputs?: unknown;
  error?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
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

  // Handle wf-* workflow IDs via planner-dapr-agent (Dapr service invocation)
  if (instanceId.startsWith("wf-")) {
    try {
      console.log(`[Workflow Status] Fetching wf-* workflow from ${getPlannerDaprAgentAppId()} via Dapr`);

      const response = await invokeService<{
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
      }>({
        appId: getPlannerDaprAgentAppId(),
        method: "GET",
        path: `/workflows/${instanceId}`,
        timeout: 15000,
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

        console.error(`[Workflow Status] Planner Dapr Agent returned ${response.status}: ${response.statusText}`);
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

      const data = response.data as {
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

  // Handle other workflow IDs via Dapr service invocation to workflow-orchestrator
  try {
    console.log(`[Workflow Status] Invoking ${getWorkflowOrchestratorAppId()} via Dapr service invocation`);

    const response = await invokeService<OrchestratorStatusResponse>({
      appId: getWorkflowOrchestratorAppId(),
      method: "GET",
      path: `/api/v2/workflows/${instanceId}/status`,
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

    // Map orchestrator response → nested UI format
    const data = response.data;
    return NextResponse.json({
      success: true,
      instance_id: data?.instanceId || instanceId,
      runtime_status: data?.runtimeStatus || null,
      custom_status: {
        phase: data?.phase ?? undefined,
        progress: data?.progress,
        message: data?.message ?? undefined,
        currentNodeId: data?.currentNodeId ?? undefined,
        currentNodeName: data?.currentNodeName ?? undefined,
      },
      created_at: data?.startedAt || null,
      last_updated_at: data?.completedAt || null,
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
