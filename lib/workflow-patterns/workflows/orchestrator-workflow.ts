/**
 * Orchestrator Workflow (Dapr-Enhanced)
 *
 * Feature implementation planning and execution with child workflow support.
 *
 * Dapr Features Used:
 * - setCustomStatus(): Real-time progress tracking
 * - isReplaying(): Conditional logging during replay
 * - callChildWorkflow(): Nested workflows for file operations (optional)
 * - whenAll(): Parallel file changes (optional)
 *
 * Flow:
 * 1. Create implementation plan (orchestrator)
 * 2. For each file in the plan:
 *    a. If useChildWorkflows: spawn child workflow
 *    b. Otherwise: call activity directly
 * 3. Optionally execute file changes in parallel
 * 4. Collect results and return summary
 */

import { type WorkflowContext, type TWorkflow } from "@dapr/dapr";
import type {
  OrchestratorInput,
  OrchestratorOutput,
  ImplementationPlan,
  FileChange,
} from "../types";

// Activity function references (resolved at runtime by name)
const planImplementationActivity = "planImplementationActivity";
const implementFileActivity = "implementFileActivity";

// Child workflow for file implementation (if useChildWorkflows is enabled)
// This provides isolated durability for each file operation
const fileImplementationWorkflowName = "fileImplementationWorkflow";

/**
 * Orchestrator Workflow (Dapr-Enhanced)
 *
 * This workflow demonstrates the orchestrator/worker pattern with Dapr features:
 * - Real-time status updates via setCustomStatus()
 * - Optional child workflows via callChildWorkflow()
 * - Optional parallel execution via whenAll()
 * - Graceful handling of partial failures
 */
export const orchestratorWorkflow: TWorkflow = async function* (
  ctx: WorkflowContext,
  input: OrchestratorInput
): AsyncGenerator<unknown, OrchestratorOutput, unknown> {
  const { featureRequest, codebaseContext, daprOptions } = input;

  const useChildWorkflows = daprOptions?.useChildWorkflows ?? false;
  const parallelFileChanges = daprOptions?.parallelFileChanges ?? false;

  if (!ctx.isReplaying()) {
    console.log(`[Orchestrator Workflow] Starting feature implementation`);
    console.log(`[Orchestrator Workflow] Using child workflows: ${useChildWorkflows}`);
    console.log(`[Orchestrator Workflow] Parallel execution: ${parallelFileChanges}`);
  }

  // ========================================================================
  // Step 1: Create Implementation Plan (Orchestrator)
  // ========================================================================

  ctx.setCustomStatus("Creating implementation plan...");

  const plan = (yield ctx.callActivity(planImplementationActivity, {
    featureRequest,
    codebaseContext,
  })) as ImplementationPlan;

  if (!ctx.isReplaying()) {
    console.log(`[Orchestrator Workflow] Plan created: "${plan.title}" with ${plan.files.length} files`);
  }

  ctx.setCustomStatus(`Plan created: ${plan.files.length} files to change`);

  // ========================================================================
  // Step 2: Execute File Changes (Workers)
  // ========================================================================

  const changes: FileChange[] = [];
  const errors: { path: string; error: string }[] = [];

  if (parallelFileChanges && plan.files.length > 1) {
    // Parallel execution using whenAll
    ctx.setCustomStatus(`Executing ${plan.files.length} file changes in parallel...`);

    if (!ctx.isReplaying()) {
      console.log(`[Orchestrator Workflow] Executing ${plan.files.length} file changes in parallel`);
    }

    const tasks = plan.files.map((file) => {
      if (useChildWorkflows) {
        // Use child workflow for isolated durability
        const instanceId = `${ctx.getWorkflowInstanceId()}-file-${file.path.replace(/[^a-zA-Z0-9]/g, "-")}`;
        return ctx.callChildWorkflow(
          fileImplementationWorkflowName,
          {
            file,
            featureRequest,
            plan,
            existingContent: file.operation === "modify" ? "// Existing content" : undefined,
          },
          instanceId
        );
      } else {
        // Use activity directly
        return ctx.callActivity(implementFileActivity, {
          file,
          featureRequest,
          plan,
          existingContent: file.operation === "modify" ? "// Existing content" : undefined,
        });
      }
    });

    try {
      const results = (yield ctx.whenAll(tasks)) as FileChange[];
      changes.push(...results);
    } catch (error) {
      // Handle partial failures in parallel execution
      if (!ctx.isReplaying()) {
        console.error(`[Orchestrator Workflow] Some parallel tasks failed:`, error);
      }
      // In a real implementation, we'd collect partial results
      // For now, we'll continue with an empty result
    }
  } else {
    // Sequential execution
    for (let i = 0; i < plan.files.length; i++) {
      const file = plan.files[i];
      ctx.setCustomStatus(`Processing file ${i + 1}/${plan.files.length}: ${file.path}`);

      if (!ctx.isReplaying()) {
        console.log(`[Orchestrator Workflow] Delegating ${file.operation} for ${file.path}`);
      }

      try {
        let change: FileChange;

        if (useChildWorkflows) {
          // Use child workflow for isolated durability
          const instanceId = `${ctx.getWorkflowInstanceId()}-file-${file.path.replace(/[^a-zA-Z0-9]/g, "-")}`;

          change = (yield ctx.callChildWorkflow(
            fileImplementationWorkflowName,
            {
              file,
              featureRequest,
              plan,
              existingContent: file.operation === "modify" ? "// Existing content" : undefined,
            },
            instanceId
          )) as FileChange;
        } else {
          // Use activity directly
          change = (yield ctx.callActivity(implementFileActivity, {
            file,
            featureRequest,
            plan,
            existingContent: file.operation === "modify" ? "// Existing content" : undefined,
          })) as FileChange;
        }

        changes.push(change);

        if (!ctx.isReplaying()) {
          console.log(`[Orchestrator Workflow] Completed ${file.path}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        errors.push({ path: file.path, error: errorMessage });

        if (!ctx.isReplaying()) {
          console.error(`[Orchestrator Workflow] Failed to process ${file.path}:`, error);
        }

        // Continue with remaining files despite error
        ctx.setCustomStatus(`Error on ${file.path}, continuing...`);
      }
    }
  }

  // ========================================================================
  // Step 3: Generate Summary
  // ========================================================================

  const createdFiles = changes.filter((c) => c.operation === "create").length;
  const modifiedFiles = changes.filter((c) => c.operation === "modify").length;
  const deletedFiles = changes.filter((c) => c.operation === "delete").length;
  const failedFiles = errors.length;

  let summary = `Implementation complete: ${createdFiles} files created, ${modifiedFiles} files modified, ${deletedFiles} files deleted.`;

  if (failedFiles > 0) {
    summary += ` ${failedFiles} files failed: ${errors.map((e) => e.path).join(", ")}.`;
  }

  summary += ` ${plan.summary}`;

  ctx.setCustomStatus(
    `Complete: ${changes.length}/${plan.files.length} files (${failedFiles} errors)`
  );

  if (!ctx.isReplaying()) {
    console.log(`[Orchestrator Workflow] ${summary}`);
  }

  // ========================================================================
  // Return Final Result
  // ========================================================================

  const result: OrchestratorOutput = {
    plan,
    changes,
    summary,
  };

  return result;
};

/**
 * File Implementation Child Workflow
 *
 * A child workflow that handles a single file operation.
 * This provides isolated durability - if one file fails,
 * it doesn't affect others.
 */
export const fileImplementationWorkflow: TWorkflow = async function* (
  ctx: WorkflowContext,
  input: {
    file: { path: string; operation: string; description: string };
    featureRequest: string;
    plan: ImplementationPlan;
    existingContent?: string;
  }
): AsyncGenerator<unknown, FileChange, unknown> {
  const { file, featureRequest, plan, existingContent } = input;

  ctx.setCustomStatus(`Processing ${file.operation}: ${file.path}`);

  if (!ctx.isReplaying()) {
    console.log(`[File Implementation] Processing ${file.path}`);
  }

  const change = (yield ctx.callActivity(implementFileActivity, {
    file,
    featureRequest,
    plan,
    existingContent,
  })) as FileChange;

  ctx.setCustomStatus(`Complete: ${file.path}`);

  return change;
};

/**
 * Get the workflow name for registration
 */
export function getOrchestratorWorkflowName(): string {
  return "orchestratorWorkflow";
}

/**
 * Get the file implementation workflow name for registration
 */
export function getFileImplementationWorkflowName(): string {
  return "fileImplementationWorkflow";
}
