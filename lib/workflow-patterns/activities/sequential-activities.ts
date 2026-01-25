/**
 * Sequential Workflow Activities
 *
 * Activities for the Sequential workflow pattern:
 * Marketing copy generation with quality evaluation and improvement.
 */

import { type WorkflowActivityContext } from "@dapr/dapr";
import { type TActivity } from "../runtime";
import { generateText, generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { QualityEvaluation } from "../types";

// ============================================================================
// Input Types
// ============================================================================

export interface GenerateCopyInput {
  productDescription: string;
  tone?: string;
  targetAudience?: string;
}

export interface EvaluateQualityInput {
  copy: string;
  productDescription: string;
}

export interface ImproveCopyInput {
  copy: string;
  feedback: string;
  productDescription: string;
}

// ============================================================================
// Output Types
// ============================================================================

export interface GenerateCopyOutput {
  copy: string;
  headline: string;
  callToAction: string;
}

// ============================================================================
// Schemas
// ============================================================================

const qualityEvaluationSchema = z.object({
  score: z.number().min(1).max(10).describe("Overall quality score from 1-10"),
  feedback: z.string().describe("Detailed feedback for improvement"),
  aspects: z.object({
    clarity: z.number().min(1).max(10).describe("How clear and understandable the copy is"),
    engagement: z.number().min(1).max(10).describe("How engaging and attention-grabbing it is"),
    accuracy: z.number().min(1).max(10).describe("How accurately it represents the product"),
    persuasiveness: z.number().min(1).max(10).describe("How persuasive and compelling it is"),
  }),
});

const copySchema = z.object({
  copy: z.string().describe("The main marketing copy body text"),
  headline: z.string().describe("A catchy headline for the copy"),
  callToAction: z.string().describe("A clear call-to-action"),
});

// ============================================================================
// Activities
// ============================================================================

/**
 * Generate Marketing Copy Activity
 *
 * Generates initial marketing copy for a product.
 */
export const generateCopyActivity: TActivity<GenerateCopyInput, GenerateCopyOutput> = async (
  _ctx: WorkflowActivityContext,
  input: GenerateCopyInput
): Promise<GenerateCopyOutput> => {
  const { productDescription, tone = "professional yet engaging", targetAudience = "general consumers" } = input;

  console.log(`[GenerateCopy] Creating marketing copy for product`);

  const result = await generateObject({
    model: anthropic("claude-sonnet-4-20250514"),
    system: `You are an expert marketing copywriter. Create compelling marketing copy that is ${tone} and appeals to ${targetAudience}.`,
    prompt: `Create marketing copy for the following product:\n\n${productDescription}`,
    schema: copySchema,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "sequential-generate-copy",
    },
  });

  return result.object;
};

/**
 * Evaluate Copy Quality Activity
 *
 * Evaluates the quality of marketing copy.
 */
export const evaluateQualityActivity: TActivity<EvaluateQualityInput, QualityEvaluation> = async (
  _ctx: WorkflowActivityContext,
  input: EvaluateQualityInput
): Promise<QualityEvaluation> => {
  const { copy, productDescription } = input;

  console.log(`[EvaluateQuality] Evaluating copy quality`);

  const result = await generateObject({
    model: anthropic("claude-sonnet-4-20250514"),
    system: `You are an expert marketing copy evaluator. Evaluate the quality of marketing copy objectively and provide constructive feedback.`,
    prompt: `Evaluate the following marketing copy for this product.

Product Description:
${productDescription}

Marketing Copy to Evaluate:
${copy}

Provide a detailed quality evaluation.`,
    schema: qualityEvaluationSchema,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "sequential-evaluate-quality",
    },
  });

  return result.object;
};

/**
 * Improve Copy Activity
 *
 * Improves marketing copy based on feedback.
 */
export const improveCopyActivity: TActivity<ImproveCopyInput, GenerateCopyOutput> = async (
  _ctx: WorkflowActivityContext,
  input: ImproveCopyInput
): Promise<GenerateCopyOutput> => {
  const { copy, feedback, productDescription } = input;

  console.log(`[ImproveCopy] Improving copy based on feedback`);

  const result = await generateObject({
    model: anthropic("claude-sonnet-4-20250514"),
    system: `You are an expert marketing copywriter. Improve the provided copy based on specific feedback while maintaining the core message.`,
    prompt: `Improve the following marketing copy based on the feedback provided.

Product Description:
${productDescription}

Current Copy:
${copy}

Feedback for Improvement:
${feedback}

Create an improved version that addresses all the feedback.`,
    schema: copySchema,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "sequential-improve-copy",
    },
  });

  return result.object;
};
