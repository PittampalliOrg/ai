/**
 * Orchestrator Workflow Activities
 *
 * Activities for the Orchestrator/Worker workflow pattern:
 * Feature implementation planning and execution.
 */

import { type WorkflowActivityContext } from "@dapr/dapr";
import { type TActivity } from "../runtime";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { ImplementationPlan, FileChange } from "../types";

// ============================================================================
// Input Types
// ============================================================================

export interface PlanImplementationInput {
  featureRequest: string;
  codebaseContext?: string;
  existingFiles?: string[];
}

export interface ImplementFileInput {
  file: {
    path: string;
    operation: "create" | "modify" | "delete";
    description: string;
  };
  featureRequest: string;
  plan: ImplementationPlan;
  existingContent?: string;
}

// ============================================================================
// Schemas
// ============================================================================

const implementationPlanSchema = z.object({
  title: z.string().describe("A concise title for this implementation"),
  summary: z.string().describe("Brief summary of what will be implemented"),
  files: z.array(z.object({
    path: z.string().describe("File path relative to project root"),
    operation: z.enum(["create", "modify", "delete"]),
    description: z.string().describe("What changes will be made to this file"),
  })),
  steps: z.array(z.string()).describe("High-level implementation steps"),
});

const fileChangeSchema = z.object({
  path: z.string(),
  operation: z.enum(["create", "modify", "delete"]),
  content: z.string().optional().describe("New file content for create/modify"),
  diff: z.string().optional().describe("Diff showing changes for modify operations"),
  description: z.string().describe("Description of what was changed"),
});

// ============================================================================
// Activities
// ============================================================================

/**
 * Plan Implementation Activity
 *
 * Creates a detailed implementation plan for a feature request.
 */
export const planImplementationActivity: TActivity<PlanImplementationInput, ImplementationPlan> = async (
  _ctx: WorkflowActivityContext,
  input: PlanImplementationInput
): Promise<ImplementationPlan> => {
  const { featureRequest, codebaseContext, existingFiles } = input;

  console.log(`[PlanImplementation] Planning implementation for feature`);

  const contextPrompt = codebaseContext
    ? `\nCodebase Context:\n${codebaseContext}`
    : '';

  const filesPrompt = existingFiles?.length
    ? `\nExisting Files:\n${existingFiles.join('\n')}`
    : '';

  const result = await generateObject({
    model: anthropic("claude-sonnet-4-20250514"),
    system: `You are a senior software architect. Create detailed, practical implementation plans for feature requests. Consider file organization, code patterns, and dependencies. Be specific about which files need to be created or modified.`,
    prompt: `Create an implementation plan for the following feature request:

Feature Request:
${featureRequest}
${contextPrompt}
${filesPrompt}

Create a detailed plan with specific files and steps.`,
    schema: implementationPlanSchema,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "orchestrator-plan-implementation",
    },
  });

  return result.object;
};

/**
 * Implement File Activity
 *
 * Implements changes for a single file based on the plan.
 */
export const implementFileActivity: TActivity<ImplementFileInput, FileChange> = async (
  _ctx: WorkflowActivityContext,
  input: ImplementFileInput
): Promise<FileChange> => {
  const { file, featureRequest, plan, existingContent } = input;

  console.log(`[ImplementFile] Implementing ${file.operation} for ${file.path}`);

  const existingContentPrompt = existingContent
    ? `\nExisting file content:\n\`\`\`\n${existingContent}\n\`\`\``
    : '';

  const operationInstructions = {
    create: "Create a new file with the appropriate content.",
    modify: "Modify the existing file to implement the required changes. Provide both the new content and a diff showing changes.",
    delete: "This file should be deleted. Provide the reason for deletion.",
  };

  const result = await generateObject({
    model: anthropic("claude-sonnet-4-20250514"),
    system: `You are an expert software developer. Implement file changes according to the plan. Write clean, well-documented code following best practices.`,
    prompt: `Implement the following file change:

Feature Request: ${featureRequest}

Plan Summary: ${plan.summary}

File: ${file.path}
Operation: ${file.operation}
Description: ${file.description}
${existingContentPrompt}

${operationInstructions[file.operation]}`,
    schema: fileChangeSchema,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "orchestrator-implement-file",
      metadata: {
        filePath: file.path,
        operation: file.operation,
      },
    },
  });

  return {
    ...result.object,
    path: file.path,
    operation: file.operation,
  };
};
