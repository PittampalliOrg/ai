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
import type { WorkflowListResponse, WorkflowListItem, WorkflowStatus } from "@/lib/types/workflow";
import { listWorkflows as listPatternWorkflows } from "@/lib/workflow-patterns/workflow-index";

// Workflow orchestrator service configuration
const WORKFLOW_SERVICE_URL =
  process.env.WORKFLOW_SERVICE_URL || "http://workflow-orchestrator.dapr-agents.svc.cluster.local:80";

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

  // Collect workflows from both sources
  const allWorkflows: WorkflowListItem[] = [];

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
          id: string;
          status: string;
          planTitle?: string;
          taskCount: number;
          completedTasks: number;
          failedTasks: number;
          submittedAt?: string;
          createdAt: string;
          updatedAt: string;
        }

        const mapped: WorkflowListItem[] = (data.workflows || []).map((w: OrchestratorWorkflowIndex) => ({
          instanceId: w.id,
          status: w.status as WorkflowStatus,
          topic: w.planTitle || `Workflow ${w.id.substring(0, 8)}`,
          planStepsCount: w.taskCount,
          planStepsCompleted: w.completedTasks,
          taskCount: w.taskCount,
          submittedAt: w.submittedAt,
          createdAt: w.createdAt,
          updatedAt: w.updatedAt,
          source: "orchestrator" as const,
        }));

        allWorkflows.push(...mapped);
      } else {
        orchestratorError = `Service returned ${response.status}`;
      }
    } catch (error) {
      console.error("[Workflows List] Orchestrator error:", error);
      orchestratorError = "Cannot connect to orchestrator service";
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

      const mapped: WorkflowListItem[] = result.workflows.map((w) => {
        // Extract plan title from output if available
        let topic = `${w.workflowType.charAt(0).toUpperCase() + w.workflowType.slice(1)} Pattern`;

        // Try to get a more descriptive title from the workflow output
        const output = w.output as Record<string, unknown> | undefined;
        if (output) {
          // Check for plan.title (sequential workflow output)
          const plan = output.plan as Record<string, unknown> | undefined;
          if (plan?.title && typeof plan.title === "string") {
            topic = plan.title;
          }
          // Check for repository info as fallback
          else if (output.repository) {
            const repo = output.repository as Record<string, unknown>;
            if (repo.owner && repo.repo) {
              topic = `${repo.owner}/${repo.repo}`;
            }
          }
        }
        // Also check input for prompt/repository
        else if (w.input) {
          const input = w.input as Record<string, unknown>;
          if (input.repository) {
            const repo = input.repository as Record<string, unknown>;
            if (repo.owner && repo.repo) {
              topic = `${repo.owner}/${repo.repo}`;
            }
          }
        }

        return {
          instanceId: w.instanceId,
          status: w.status.toUpperCase() as WorkflowStatus,
          topic,
          createdAt: w.createdAt,
          updatedAt: w.updatedAt,
          source: "patterns" as const,
          workflowType: w.workflowType,
        };
      });

      allWorkflows.push(...mapped);
    } catch (error) {
      console.error("[Workflows List] Patterns error:", error);
      patternsError = "Cannot fetch workflow patterns";
    }
  }

  // Sort by createdAt descending (newest first)
  allWorkflows.sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    return dateB - dateA;
  });

  // Apply pagination
  const total = allWorkflows.length;
  const paginated = allWorkflows.slice(offset, offset + limit);

  // Build response
  const response: WorkflowListResponse & {
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
