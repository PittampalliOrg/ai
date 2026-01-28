/**
 * Background Workflow Sync Cron Job
 *
 * GET /api/cron/workflow-sync
 *
 * Reconciles stale workflows by querying Dapr runtime API directly.
 * This is a fallback mechanism for workflows that may have missed events.
 *
 * Run via cron (e.g., every 5 minutes) or manually for testing.
 */

import { NextResponse } from "next/server";
import {
  getStaleWorkflows,
  updateAgentSessionWorkflowStatusByWorkflowId,
} from "@/lib/db/agent-queries";

// Dapr sidecar URL (runs locally on the same pod)
const DAPR_HTTP_PORT = process.env.DAPR_HTTP_PORT || "3500";
const DAPR_URL = `http://localhost:${DAPR_HTTP_PORT}`;

interface DaprWorkflowStatus {
  instanceId: string;
  workflowName: string;
  createdAt: string;
  lastUpdatedAt: string;
  runtimeStatus: "RUNNING" | "COMPLETED" | "FAILED" | "TERMINATED" | "PENDING" | "SUSPENDED";
  properties?: {
    dapr_wf_custom_status?: string;
    [key: string]: unknown;
  };
}

/**
 * Map Dapr runtime status to our workflow status
 */
function mapDaprRuntimeStatus(
  runtimeStatus: string
): "running" | "completed" | "failed" | "terminated" | "suspended" | "pending" {
  switch (runtimeStatus?.toUpperCase()) {
    case "RUNNING":
      return "running";
    case "COMPLETED":
      return "completed";
    case "FAILED":
      return "failed";
    case "TERMINATED":
      return "terminated";
    case "SUSPENDED":
      return "suspended";
    case "PENDING":
      return "pending";
    default:
      return "running";
  }
}

/**
 * Query Dapr runtime API for workflow status
 */
async function getDaprWorkflowStatus(
  workflowId: string
): Promise<DaprWorkflowStatus | null> {
  try {
    const response = await fetch(
      `${DAPR_URL}/v1.0/workflows/dapr/${workflowId}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    );

    if (response.ok) {
      return await response.json();
    }

    // 404 means workflow doesn't exist in Dapr (may have been purged)
    if (response.status === 404) {
      console.log(`[Workflow Sync] Workflow ${workflowId} not found in Dapr runtime`);
      return null;
    }

    console.error(
      `[Workflow Sync] Failed to get Dapr status for ${workflowId}: ${response.status}`
    );
    return null;
  } catch (error) {
    console.error(`[Workflow Sync] Error querying Dapr for ${workflowId}:`, error);
    return null;
  }
}

/**
 * GET /api/cron/workflow-sync
 *
 * Reconcile stale workflows by querying Dapr runtime API
 */
export async function GET() {
  const startTime = Date.now();
  let synced = 0;
  let failed = 0;
  let notFound = 0;
  const errors: string[] = [];

  try {
    // Get workflows stuck in running/pending state
    const staleWorkflows = await getStaleWorkflows({ staleThresholdMinutes: 10 });
    console.log(`[Workflow Sync] Found ${staleWorkflows.length} potentially stale workflows`);

    for (const workflow of staleWorkflows) {
      if (!workflow.workflowId) continue;

      try {
        const daprStatus = await getDaprWorkflowStatus(workflow.workflowId);

        if (!daprStatus) {
          // Workflow not found in Dapr - might have been purged
          // Mark as terminated if it's been stuck for too long
          const workflowAge = workflow.workflowUpdatedAt
            ? Date.now() - new Date(workflow.workflowUpdatedAt as Date).getTime()
            : Date.now() - new Date(workflow.createdAt).getTime();

          // If workflow is older than 1 hour and not in Dapr, mark as terminated
          if (workflowAge > 60 * 60 * 1000) {
            console.log(
              `[Workflow Sync] Marking ${workflow.workflowId} as terminated (not found in Dapr, age: ${Math.round(workflowAge / 60000)}m)`
            );
            await updateAgentSessionWorkflowStatusByWorkflowId({
              workflowId: workflow.workflowId,
              workflowStatus: "terminated",
              workflowPhase: "failed",
              workflowMessage: "Workflow not found in runtime (may have been purged)",
            });
            synced++;
          }
          notFound++;
          continue;
        }

        // Update database with actual Dapr status
        const newStatus = mapDaprRuntimeStatus(daprStatus.runtimeStatus);

        // Only update if status has actually changed
        if (newStatus !== workflow.workflowStatus) {
          console.log(
            `[Workflow Sync] Updating ${workflow.workflowId}: ${workflow.workflowStatus} -> ${newStatus}`
          );

          // Parse custom status if available
          let customStatusData: { phase?: string; progress?: number; message?: string } = {};
          if (daprStatus.properties?.dapr_wf_custom_status) {
            try {
              customStatusData = JSON.parse(daprStatus.properties.dapr_wf_custom_status);
            } catch {
              // Ignore parse errors
            }
          }

          await updateAgentSessionWorkflowStatusByWorkflowId({
            workflowId: workflow.workflowId,
            workflowStatus: newStatus,
            workflowPhase: customStatusData.phase ?? (newStatus === "completed" ? "completed" : "executing"),
            workflowProgress: customStatusData.progress ?? (newStatus === "completed" ? 100 : undefined),
            workflowMessage: customStatusData.message ?? `Status: ${newStatus}`,
          });
          synced++;
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[Workflow Sync] Error syncing ${workflow.workflowId}:`, errMsg);
        errors.push(`${workflow.workflowId}: ${errMsg}`);
        failed++;
      }
    }
  } catch (error) {
    console.error("[Workflow Sync] Fatal error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        synced,
        failed,
        notFound,
      },
      { status: 500 }
    );
  }

  const duration = Date.now() - startTime;
  console.log(
    `[Workflow Sync] Completed in ${duration}ms: synced=${synced}, failed=${failed}, notFound=${notFound}`
  );

  return NextResponse.json({
    synced,
    failed,
    notFound,
    duration: `${duration}ms`,
    errors: errors.length > 0 ? errors : undefined,
  });
}
