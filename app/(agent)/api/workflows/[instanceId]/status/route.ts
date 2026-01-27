/**
 * Workflow Status API - Planner Agent
 *
 * GET /api/workflows/[instanceId]/status
 * Fetches deterministic workflow status from the planner-agent service.
 *
 * This endpoint provides the custom_status set by the workflow via set_custom_status(),
 * which contains the current phase, progress, and message.
 */

import { NextResponse, type NextRequest } from "next/server";

// Planner agent service configuration (uses WORKFLOW_SERVICE_URL for consistency)
const PLANNER_AGENT_URL =
  process.env.WORKFLOW_SERVICE_URL || "http://planner-agent.planner-agent.svc.cluster.local:8080";

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
    const statusUrl = `${PLANNER_AGENT_URL}/api/workflow/${instanceId}/status`;
    console.log(`[Workflow Status] Fetching from ${statusUrl}`);

    const response = await fetch(statusUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      // Timeout for status checks (increased for slow Dapr state lookups)
      signal: AbortSignal.timeout(15000),
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

      const errorText = await response.text();
      console.error(`[Workflow Status] Service returned ${response.status}: ${errorText}`);
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

    const data = (await response.json()) as WorkflowStatusResponse;
    return NextResponse.json(data);
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
