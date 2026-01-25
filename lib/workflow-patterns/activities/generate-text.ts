/**
 * Generate Text Activity
 *
 * Wrapper around AI SDK's generateText for use in Dapr workflows.
 */

import { type WorkflowActivityContext } from "@dapr/dapr";
import { type TActivity } from "../runtime";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";

export interface GenerateTextInput {
  prompt: string;
  system?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface GenerateTextOutput {
  text: string;
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
 * Generate Text Activity
 *
 * Uses AI SDK to generate text based on a prompt.
 */
export const generateTextActivity: TActivity<GenerateTextInput, GenerateTextOutput> = async (
  _ctx: WorkflowActivityContext,
  input: GenerateTextInput
): Promise<GenerateTextOutput> => {
  const { prompt, system, model = "claude-sonnet-4-20250514", maxTokens = 4096, temperature = 0.7 } = input;

  console.log(`[GenerateText] Generating text with model ${model}`);

  const result = await generateText({
    model: getModel(model),
    system,
    prompt,
    maxOutputTokens: maxTokens,
    temperature,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "workflow-pattern-generate-text",
    },
  });

  const inputTokens = result.usage?.inputTokens ?? 0;
  const outputTokens = result.usage?.outputTokens ?? 0;

  return {
    text: result.text,
    usage: {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
    },
  };
};
