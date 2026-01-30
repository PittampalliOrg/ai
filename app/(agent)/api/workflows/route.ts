/**
 * Workflow List API
 *
 * GET /api/workflows
 * Returns list of all workflows from both:
 * 1. The workflow-orchestrator service (Ralph workflows, agents)
 * 2. The workflow-patterns index (sequential, parallel, routing, etc.)
 *
 * Query parameters:
 * - limit: Maximum number of workflows to return (default: 50)
 * - offset: Number of workflows to skip (default: 0)
 * - status: Filter by workflow status (optional)
 * - source: Filter by source ("orchestrator", "patterns", or "all") (default: "all")
 */

import { NextRequest, NextResponse } from "next/server";
import type { WorkflowStatus } from "@/lib/types/workflow";
import type { WorkflowListItem as UIWorkflowListItem } from "@/lib/types/workflow-ui";
import { mapWorkflowStatus } from "@/lib/transforms/workflow-ui";
import { listWorkflows as listPatternWorkflows } from "@/lib/workflow-patterns/workflow-index";

// Workflow orchestrator service configuration
const WORKFLOW_SERVICE_URL =
  process.env.WORKFLOW_SERVICE_URL || "http://workflow-orchestrator.dapr-agents.svc.cluster.local:80";

// Planner orchestrator service configuration
const PLANNER_SERVICE_URL =
  process.env.PLANNER_SERVICE_URL || "http://planner-agent.planner-agent.svc.cluster.local:8080";

/**
 * GET /api/workflows
 *
 * Combines workflows from:
 * 1. workflow-orchestrator service (Ralph workflows, agents)
 * 2. workflow-patterns index (sequential, parallel, routing, etc.)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);
  const status = searchParams.get("status");
  const source = searchParams.get("source") || "all";

  // Collect workflows from both sources - using UI format with startTime/endTime
  const allWorkflows: UIWorkflowListItem[] = [];

  let orchestratorError: string | undefined;
  let patternsError: string | undefined;

  // Fetch from workflow-orchestrator service
  if (source === "all" || source === "orchestrator") {
    try {
      const queryParams = new URLSearchParams({ limit: "100", offset: "0" });
      if (status) {
        queryParams.set("status", status);
      }

      const response = await fetch(
        `${WORKFLOW_SERVICE_URL}/api/workflows?${queryParams.toString()}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          next: { revalidate: 0 },
        }
      );

      if (response.ok) {
        const data = await response.json();

        interface OrchestratorWorkflowIndex {
          id?: string;
          instanceId?: string;
          status?: string;
          planTitle?: string;
          taskCount?: number;
          completedTasks?: number;
          failedTasks?: number;
          submittedAt?: string;
          createdAt?: string;
          updatedAt?: string;
          startTime?: string;
          endTime?: string;
        }

        const mapped: UIWorkflowListItem[] = (data.workflows || [])
          .filter((w: OrchestratorWorkflowIndex) => w.id || w.instanceId) // Filter out invalid entries
          .map((w: OrchestratorWorkflowIndex) => {
            const instanceId = w.id || w.instanceId || "";
            const uiStatus = mapWorkflowStatus((w.status || "RUNNING") as WorkflowStatus);
            const startTime = w.submittedAt || w.createdAt || w.startTime || "";
            // Only set endTime if workflow is in a terminal state
            const endTime = (uiStatus === "COMPLETED" || uiStatus === "FAILED" || uiStatus === "CANCELLED")
              ? (w.updatedAt || w.endTime || null)
              : null;

            return {
              instanceId,
              workflowType: "planExecutionWorkflow",
              appId: "workflow-orchestrator",
              status: uiStatus,
              startTime,
              endTime,
            };
          });

        allWorkflows.push(...mapped);
      } else {
        orchestratorError = `Service returned ${response.status}`;
      }
    } catch (error) {
      console.error("[Workflows List] Orchestrator error:", error);
      orchestratorError = "Cannot connect to orchestrator service";
    }
  }

  // Fetch from planner-orchestrator service
  if (source === "all" || source === "planner") {
    try {
      const response = await fetch(
        `${PLANNER_SERVICE_URL}/api/workflows`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          next: { revalidate: 0 },
        }
      );

      if (response.ok) {
        const data = await response.json();

        interface PlannerWorkflow {
          workflow_id?: string;
          instanceId?: string;
          runtime_status?: string;
          status?: string;
          phase?: string;
          progress?: number;
          message?: string;
          topic?: string;
          created_at?: string;
          createdAt?: string;
          updated_at?: string;
          updatedAt?: string;
          appId?: string;
          workflowType?: string;
        }

        // Planner orchestrator may return different formats
        const workflows = data.workflows || (Array.isArray(data) ? data : []);
        const mapped: UIWorkflowListItem[] = workflows
          .filter((w: PlannerWorkflow) => w.workflow_id || w.instanceId)
          .map((w: PlannerWorkflow) => {
            const instanceId = w.instanceId || w.workflow_id || "";
            const rawStatus = w.runtime_status || w.status || "RUNNING";
            const uiStatus = mapWorkflowStatus(rawStatus);

            // Use timestamps if provided by the planner service
            // Note: The planner service currently doesn't return timestamps
            // To fix this, update the planner service to include created_at/updated_at
            const startTime = w.created_at || w.createdAt || "";
            const endTime = (uiStatus === "COMPLETED" || uiStatus === "FAILED" || uiStatus === "CANCELLED")
              ? (w.updated_at || w.updatedAt || null)
              : null;

            return {
              instanceId,
              workflowType: w.workflowType || "unified_planner_workflow",
              appId: w.appId || "planner-orchestrator",
              status: uiStatus,
              startTime,
              endTime,
              customStatus: (w.phase || w.progress != null || w.message) ? {
                phase: (w.phase || "executing") as "clone" | "exploration" | "planning" | "awaiting_approval" | "executing" | "completed" | "failed",
                progress: w.progress ?? 0,
                message: w.message || "",
              } : undefined,
            };
          });

        allWorkflows.push(...mapped);
      }
    } catch (error) {
      console.error("[Workflows List] Planner error:", error);
      // Don't set error - planner is optional
    }
  }

  // Fetch from workflow-patterns index
  if (source === "all" || source === "patterns") {
    try {
      // Map status filter if provided
      const statusFilter = status
        ? status.toLowerCase().split(",").map((s) => {
            const mapping: Record<string, string> = {
              running: "running",
              completed: "completed",
              failed: "failed",
              pending: "pending",
              terminated: "terminated",
            };
            return mapping[s] || s;
          })
        : undefined;

      const result = await listPatternWorkflows({
        status: statusFilter as Array<"pending" | "running" | "completed" | "failed" | "terminated">,
        limit: 100,
        offset: 0,
      });

      const mapped: UIWorkflowListItem[] = result.workflows.map((w) => {
        const uiStatus = mapWorkflowStatus(w.status.toUpperCase() as WorkflowStatus);
        const startTime = w.createdAt;
        // Only set endTime if workflow is in a terminal state
        const endTime = (uiStatus === "COMPLETED" || uiStatus === "FAILED" || uiStatus === "CANCELLED")
          ? w.updatedAt
          : null;

        return {
          instanceId: w.instanceId,
          workflowType: `${w.workflowType}Workflow`,
          appId: "workflow-patterns",
          status: uiStatus,
          startTime,
          endTime,
        };
      });

      allWorkflows.push(...mapped);
    } catch (error) {
      console.error("[Workflows List] Patterns error:", error);
      patternsError = "Cannot fetch workflow patterns";
    }
  }

  // Sort by startTime descending (newest first)
  allWorkflows.sort((a, b) => {
    const dateA = new Date(a.startTime).getTime();
    const dateB = new Date(b.startTime).getTime();
    return dateB - dateA;
  });

  // Apply pagination
  const total = allWorkflows.length;
  const paginated = allWorkflows.slice(offset, offset + limit);

  // Build response (using UI-compatible format)
  const response: {
    workflows: UIWorkflowListItem[];
    total: number;
    limit: number;
    offset: number;
    error?: string;
  } = {
    workflows: paginated,
    total,
    limit,
    offset,
  };

  // Add error info if either source failed
  if (orchestratorError && patternsError) {
    response.error = `${orchestratorError}; ${patternsError}`;
  } else if (orchestratorError) {
    response.error = orchestratorError;
  } else if (patternsError) {
    response.error = patternsError;
  }

  return NextResponse.json(response);
}
