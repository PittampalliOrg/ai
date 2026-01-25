/**
 * Workflow Patterns List API
 *
 * GET /api/workflow-patterns/list
 * Returns list of all workflow pattern instances from the index.
 *
 * Query parameters:
 * - status: Filter by workflow status (comma-separated)
 * - type: Filter by workflow type (comma-separated)
 * - limit: Maximum number of workflows to return (default: 50)
 * - offset: Number of workflows to skip (default: 0)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  listWorkflows,
  type WorkflowIndexEntry,
  type WorkflowIndexQuery,
} from "@/lib/workflow-patterns/workflow-index";

export interface WorkflowPatternsListResponse {
  workflows: WorkflowIndexEntry[];
  total: number;
  limit: number;
  offset: number;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse query parameters
    const statusParam = searchParams.get("status");
    const typeParam = searchParams.get("type");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Build query
    const query: WorkflowIndexQuery = {
      limit,
      offset,
    };

    if (statusParam) {
      query.status = statusParam.split(",") as WorkflowIndexEntry["status"][];
    }

    if (typeParam) {
      query.workflowType = typeParam.split(",") as WorkflowIndexEntry["workflowType"][];
    }

    // Fetch workflows from index
    const result = await listWorkflows(query);

    return NextResponse.json({
      workflows: result.workflows,
      total: result.total,
      limit,
      offset,
    } satisfies WorkflowPatternsListResponse);
  } catch (error) {
    console.error("[Workflow Patterns List] Error:", error);

    return NextResponse.json(
      {
        workflows: [],
        total: 0,
        limit: 50,
        offset: 0,
        error: error instanceof Error ? error.message : "Failed to list workflows",
      },
      { status: 500 }
    );
  }
}
