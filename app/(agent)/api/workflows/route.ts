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
import { invokeService } from "@/lib/dapr/client";
import { getConfig } from "@/lib/dapr/config-provider";

// Dapr app IDs for cross-namespace service invocation
const getWorkflowOrchestratorAppId = () =>
  getConfig("WORKFLOW_ORCHESTRATOR_APP_ID", "workflow-orchestrator.workflow-builder");

const getPlannerDaprAgentAppId = () =>
  getConfig("PLANNER_DAPR_AGENT_APP_ID", "planner-dapr-agent.workflow-builder");

// Legacy planner-orchestrator URL (for older planner-* workflows)
const getPlannerServiceUrl = () =>
  getConfig("PLANNER_SERVICE_URL", "http://planner-dapr-agent.workflow-builder.svc.cluster.local:8000");

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

  // Fetch from workflow-orchestrator service via Dapr service invocation
  if (source === "all" || source === "orchestrator") {
    try {
      const query: Record<string, string> = { limit: "100", offset: "0" };
      if (status) {
        query.status = status;
      }

      const response = await invokeService<{ workflows: unknown[] }>({
        appId: getWorkflowOrchestratorAppId(),
        method: "GET",
        path: "/api/workflows",
        query,
        timeout: 15000,
      });

      if (response.ok) {
        const data = response.data as { workflows: unknown[] };

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

        const mapped: UIWorkflowListItem[] = ((data.workflows || []) as OrchestratorWorkflowIndex[])
          .filter((w) => w.id || w.instanceId) // Filter out invalid entries
          .map((w) => {
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
        `${getPlannerServiceUrl()}/api/workflows`,
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

  // Fetch from planner-dapr-agent service via Dapr service invocation
  if (source === "all" || source === "dapr-agent") {
    try {
      const response = await invokeService<{ workflows: unknown[] }>({
        appId: getPlannerDaprAgentAppId(),
        method: "GET",
        path: "/workflows",
        timeout: 15000,
      });

      if (response.ok) {
        const data = response.data as { workflows: unknown[] };

        interface DaprAgentWorkflow {
          instanceId: string;
          workflowName?: string;
          status: string;
          phase?: string;
          progress?: number;
          message?: string;
          createdAt?: string;
          updatedAt?: string;
          completedAt?: string;
        }

        const workflows = (data.workflows || []) as DaprAgentWorkflow[];
        const mapped: UIWorkflowListItem[] = workflows.map((w) => {
          const uiStatus = mapWorkflowStatus(w.status.toUpperCase() as WorkflowStatus);
          return {
            instanceId: w.instanceId,
            workflowType: w.workflowName || "planner_workflow",
            appId: "planner-dapr-agent",
            status: uiStatus,
            startTime: w.createdAt || "",
            endTime: (uiStatus === "COMPLETED" || uiStatus === "FAILED")
              ? (w.completedAt || w.updatedAt || null)
              : null,
            // Add customStatus with phase for table display
            customStatus: w.phase ? {
              phase: w.phase as "clone" | "exploration" | "planning" | "awaiting_approval" | "executing" | "completed" | "failed",
              progress: w.progress ?? 0,
              message: w.message || "",
            } : undefined,
          };
        });

        allWorkflows.push(...mapped);
      }
    } catch (error) {
      console.error("[Workflows List] Planner Dapr Agent error:", error);
      // Don't set error - service is optional
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

  // Deduplicate workflows by instanceId
  // Priority: planner-dapr-agent > planner-orchestrator > workflow-orchestrator > workflow-patterns
  const appIdPriority: Record<string, number> = {
    "planner-dapr-agent": 4,
    "planner-orchestrator": 3,
    "workflow-orchestrator": 2,
    "workflow-patterns": 1,
  };

  const workflowMap = new Map<string, UIWorkflowListItem>();
  for (const workflow of allWorkflows) {
    const existing = workflowMap.get(workflow.instanceId);
    if (!existing) {
      workflowMap.set(workflow.instanceId, workflow);
    } else {
      // Keep the one with higher priority appId
      const existingPriority = appIdPriority[existing.appId] || 0;
      const newPriority = appIdPriority[workflow.appId] || 0;
      if (newPriority > existingPriority) {
        workflowMap.set(workflow.instanceId, workflow);
      }
    }
  }

  const deduplicatedWorkflows = Array.from(workflowMap.values());

  // Sort by startTime descending (newest first)
  deduplicatedWorkflows.sort((a, b) => {
    const dateA = new Date(a.startTime).getTime();
    const dateB = new Date(b.startTime).getTime();
    return dateB - dateA;
  });

  // Apply pagination
  const total = deduplicatedWorkflows.length;
  const paginated = deduplicatedWorkflows.slice(offset, offset + limit);

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
