/**
 * Workflow Patterns Start API
 *
 * POST /api/workflow-patterns/start
 * Starts a new workflow pattern instance.
 */

import { NextResponse } from "next/server";
import {
  type WorkflowPatternId,
  sequentialInputSchema,
  parallelInputSchema,
  routingInputSchema,
  orchestratorInputSchema,
  evaluatorInputSchema,
  PATTERN_METADATA,
} from "@/lib/workflow-patterns/types";
import {
  initializeWorkflowPatternsRuntime,
  scheduleWorkflowPattern,
  isWorkflowPatternsRuntimeInitialized,
} from "@/lib/workflow-patterns/runtime";
import { registerWorkflow } from "@/lib/workflow-patterns/workflow-index";

export const maxDuration = 60;

interface StartWorkflowRequest {
  patternId: WorkflowPatternId;
  input: unknown;
  instanceId?: string;
}

interface StartWorkflowResponse {
  success: boolean;
  instanceId?: string;
  patternId?: WorkflowPatternId;
  error?: string;
}

// Map pattern IDs to workflow names
const WORKFLOW_NAMES: Record<WorkflowPatternId, string> = {
  sequential: "sequentialWorkflow",
  parallel: "parallelWorkflow",
  routing: "routingWorkflow",
  orchestrator: "orchestratorWorkflow",
  evaluator: "evaluatorWorkflow",
};

// Map pattern IDs to input schemas
const INPUT_SCHEMAS = {
  sequential: sequentialInputSchema,
  parallel: parallelInputSchema,
  routing: routingInputSchema,
  orchestrator: orchestratorInputSchema,
  evaluator: evaluatorInputSchema,
};

export async function POST(request: Request): Promise<Response> {
  let requestBody: StartWorkflowRequest;

  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid JSON body",
      } satisfies StartWorkflowResponse,
      { status: 400 }
    );
  }

  try {
    const { patternId, input, instanceId } = requestBody;

    // Validate pattern ID
    if (!patternId || !PATTERN_METADATA[patternId]) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid pattern ID. Valid patterns: ${Object.keys(PATTERN_METADATA).join(", ")}`,
        } satisfies StartWorkflowResponse,
        { status: 400 }
      );
    }

    // Validate input against pattern schema
    const schema = INPUT_SCHEMAS[patternId];
    const validationResult = schema.safeParse(input);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid input: ${validationResult.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", ")}`,
        } satisfies StartWorkflowResponse,
        { status: 400 }
      );
    }

    // Initialize runtime if needed
    if (!isWorkflowPatternsRuntimeInitialized()) {
      console.log("[Workflow Patterns Start] Initializing runtime...");
      await initializeWorkflowPatternsRuntime();
    }

    // Get workflow name
    const workflowName = WORKFLOW_NAMES[patternId];

    // Schedule the workflow
    console.log(`[Workflow Patterns Start] Scheduling ${workflowName}`);
    const id = await scheduleWorkflowPattern(
      workflowName,
      validationResult.data,
      instanceId
    );

    console.log(`[Workflow Patterns Start] Workflow scheduled: ${id}`);

    // Register in workflow index for listing
    try {
      await registerWorkflow(
        id,
        workflowName,
        patternId,
        validationResult.data as Record<string, unknown>
      );
      console.log(`[Workflow Patterns Start] Workflow registered in index: ${id}`);
    } catch (indexError) {
      // Log but don't fail - index is secondary
      console.error(`[Workflow Patterns Start] Failed to register in index:`, indexError);
    }

    return NextResponse.json(
      {
        success: true,
        instanceId: id,
        patternId,
      } satisfies StartWorkflowResponse,
      { status: 201 }
    );
  } catch (error) {
    console.error("[Workflow Patterns Start] Error:", error);

    // Check if runtime is disabled
    if (error instanceof Error && error.message.includes("disabled")) {
      return NextResponse.json(
        {
          success: false,
          error: "Workflow Patterns runtime is disabled. Set WORKFLOW_PATTERNS_ENABLED=true to enable.",
        } satisfies StartWorkflowResponse,
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      } satisfies StartWorkflowResponse,
      { status: 500 }
    );
  }
}
