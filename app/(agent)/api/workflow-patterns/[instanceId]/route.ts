/**
 * Workflow Pattern Instance API
 *
 * GET /api/workflow-patterns/[instanceId]
 * Returns the status and details of a workflow instance.
 */

import { NextResponse } from "next/server";
import {
  getWorkflowPatternState,
  isWorkflowPatternsRuntimeInitialized,
  initializeWorkflowPatternsRuntime,
} from "@/lib/workflow-patterns/runtime";
import { syncWorkflowFromDapr } from "@/lib/workflow-patterns/workflow-index";

interface WorkflowInstanceResponse {
  success: boolean;
  instanceId?: string;
  workflowName?: string;
  status?: string;
  input?: unknown;
  output?: unknown;
  customStatus?: unknown;
  createdAt?: string;
  lastUpdatedAt?: string;
  error?: string;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ instanceId: string }> }
): Promise<Response> {
  const { instanceId } = await params;

  try {
    // Initialize runtime if needed
    if (!isWorkflowPatternsRuntimeInitialized()) {
      await initializeWorkflowPatternsRuntime();
    }

    // Get workflow state
    const state = await getWorkflowPatternState(instanceId);

    if (!state) {
      return NextResponse.json(
        {
          success: false,
          error: `Workflow instance ${instanceId} not found`,
        } satisfies WorkflowInstanceResponse,
        { status: 404 }
      );
    }

    // Parse serialized data if present
    let input: unknown;
    let output: unknown;
    let customStatus: unknown;

    try {
      if (state.serializedInput) {
        input = JSON.parse(state.serializedInput);
      }
    } catch {
      input = state.serializedInput;
    }

    try {
      if (state.serializedOutput) {
        output = JSON.parse(state.serializedOutput);
      }
    } catch {
      output = state.serializedOutput;
    }

    try {
      if (state.serializedCustomStatus) {
        customStatus = JSON.parse(state.serializedCustomStatus);
      }
    } catch {
      customStatus = state.serializedCustomStatus;
    }

    // Sync workflow index with Dapr state (non-blocking)
    syncWorkflowFromDapr(instanceId, {
      runtimeStatus: state.runtimeStatus,
      customStatus: typeof customStatus === "string" ? customStatus : undefined,
      serializedOutput: state.serializedOutput,
    }).catch((err) => {
      console.error(`[Workflow Patterns Instance] Failed to sync index:`, err);
    });

    return NextResponse.json({
      success: true,
      instanceId: state.instanceId,
      workflowName: state.workflowName,
      status: state.runtimeStatus,
      input,
      output,
      customStatus,
      createdAt: state.createdAt.toISOString(),
      lastUpdatedAt: state.lastUpdatedAt.toISOString(),
    } satisfies WorkflowInstanceResponse);
  } catch (error) {
    console.error(`[Workflow Patterns Instance] Error fetching ${instanceId}:`, error);

    // Check if runtime is disabled
    if (error instanceof Error && error.message.includes("disabled")) {
      return NextResponse.json(
        {
          success: false,
          error: "Workflow Patterns runtime is disabled. Set WORKFLOW_PATTERNS_ENABLED=true to enable.",
        } satisfies WorkflowInstanceResponse,
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } satisfies WorkflowInstanceResponse,
      { status: 500 }
    );
  }
}
