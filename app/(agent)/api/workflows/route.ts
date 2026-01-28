/**
 * Workflow List API
 *
 * GET /api/workflows
 * Returns list of workflows from AgentSession table (planner-agent workflows)
 * Status is read from the database cache (updated via Dapr pub/sub events)
 *
 * Query parameters:
 * - limit: Maximum number of workflows to return (default: 50)
 * - offset: Number of workflows to skip (default: 0)
 * - status: Filter by workflow status (optional)
 */

import { NextRequest, NextResponse } from "next/server";
import type { WorkflowListItem as UIWorkflowListItem } from "@/lib/types/workflow-ui";
import { getAgentSessionsWithWorkflows } from "@/lib/db/agent-queries";
import { transformAgentSessionToWorkflowListItemWithCache } from "@/lib/transforms/workflow-ui";

/**
 * GET /api/workflows
 *
 * Returns workflows from AgentSession table with cached status
 * No longer polls planner-agent - reads status from database (synced via Dapr events)
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);
  const status = searchParams.get("status");

  const allWorkflows: UIWorkflowListItem[] = [];
  let error: string | undefined;

  try {
    const sessions = await getAgentSessionsWithWorkflows({
      limit: 100,
      offset: 0,
      status: status || undefined,
    });

    // Transform sessions to workflow list items using cached status from database
    for (const session of sessions) {
      allWorkflows.push(transformAgentSessionToWorkflowListItemWithCache(session));
    }
  } catch (err) {
    console.error("[Workflows List] Error fetching workflows:", err);
    error = "Cannot fetch workflows from database";
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

  // Build response
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

  if (error) {
    response.error = error;
  }

  return NextResponse.json(response);
}
