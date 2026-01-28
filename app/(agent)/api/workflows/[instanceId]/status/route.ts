/**
 * Workflow Status API - Planner Agent
 *
 * GET /api/workflows/[instanceId]/status
 * Fetches deterministic workflow status from the planner-agent service using Dapr service invocation.
 *
 * This endpoint provides the custom_status set by the workflow via set_custom_status(),
 * which contains the current phase, progress, and message.
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

interface WorkflowStatusResponse {
  success: boolean;
  instance_id: string;
  runtime_status: string | null;
  custom_status: {
    phase?: string;
    progress?: number;
    message?: string;
    plan_id?: string;
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
 * Fetches workflow status from the planner-agent service.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { instanceId } = await params;

  if (!instanceId) {
    return NextResponse.json(
      { error: "Instance ID is required" },
      { status: 400 }
    );
  }

  try {
    console.log(`[Workflow Status] Invoking ${PLANNER_AGENT_APP_ID} via Dapr service invocation`);

    const response = await invokeService<WorkflowStatusResponse>({
      appId: PLANNER_AGENT_APP_ID,
      method: "GET",
      path: `/api/workflow/${instanceId}/status`,
      timeout: 15000,
    });

    if (!response.ok) {
      // If planner-agent is not available or workflow not found, return null status
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
        });
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
      });
    }

    return NextResponse.json(response.data);
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
    });
  }
}
