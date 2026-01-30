/**
 * Workflow Status API - Planner Orchestrator
 *
 * GET /api/workflows/[instanceId]/status
 * Fetches workflow status from the planner-orchestrator service using Dapr service invocation.
 *
 * The new orchestrator returns a flat response with phase, progress, and message
 * at the top level (no nested custom_status).
 *
 * Benefits of Dapr service invocation:
 * - Automatic mTLS encryption between services
 * - Built-in retries and circuit breakers
 * - Distributed tracing for observability
 * - Service discovery via app-id (no hardcoded URLs)
 */

import { NextResponse, type NextRequest } from "next/server";
import { invokeService } from "@/lib/dapr/client";

// Planner orchestrator Dapr app ID
// Use namespace-qualified app ID for cross-namespace Dapr invocation
const PLANNER_ORCHESTRATOR_APP_ID = process.env.PLANNER_AGENT_APP_ID || "planner-orchestrator.planner-agent";

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
 * Fetches workflow status from the planner-orchestrator service
 * and maps the flat response to the UI's expected nested format.
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
    console.log(`[Workflow Status] Invoking ${PLANNER_ORCHESTRATOR_APP_ID} via Dapr service invocation`);

    const response = await invokeService<OrchestratorStatusResponse>({
      appId: PLANNER_ORCHESTRATOR_APP_ID,
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
