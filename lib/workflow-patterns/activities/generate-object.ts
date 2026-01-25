/**
 * Generate Object Activity
 *
 * Wrapper around AI SDK's generateObject for structured outputs in Dapr workflows.
 */

import { type WorkflowActivityContext } from "@dapr/dapr";
import { type TActivity } from "../runtime";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { type ZodSchema } from "zod";

export interface GenerateObjectInput<T = unknown> {
  prompt: string;
  system?: string;
  model?: string;
  schema: ZodSchema<T>;
  schemaName?: string;
  schemaDescription?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface GenerateObjectOutput<T = unknown> {
  object: T;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Get the AI model based on the model string
 */
function getModel(modelString: string) {
  if (modelString.startsWith("gpt-")) {
    return openai(modelString);
  }
  if (modelString.startsWith("claude-")) {
    return anthropic(modelString);
  }
  // Default to Claude Sonnet
  return anthropic("claude-sonnet-4-20250514");
}

/**
 * Generate Object Activity
 *
 * Uses AI SDK to generate a structured object based on a prompt and schema.
 */
export const generateObjectActivity: TActivity<
  GenerateObjectInput,
  GenerateObjectOutput
> = async (
  _ctx: WorkflowActivityContext,
  input: GenerateObjectInput
): Promise<GenerateObjectOutput> => {
  const {
    prompt,
    system,
    model = "claude-sonnet-4-20250514",
    schema,
    schemaName,
    schemaDescription,
    maxTokens = 4096,
    temperature = 0.5,
  } = input;

  console.log(`[GenerateObject] Generating object with model ${model}`);

  const result = await generateObject({
    model: getModel(model),
    system,
    prompt,
    schema,
    schemaName,
    schemaDescription,
    maxOutputTokens: maxTokens,
    temperature,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "workflow-pattern-generate-object",
    },
  });

  const inputTokens = result.usage?.inputTokens ?? 0;
  const outputTokens = result.usage?.outputTokens ?? 0;

  return {
    object: result.object,
    usage: {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
    },
  };
};
