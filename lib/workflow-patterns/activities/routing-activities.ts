/**
 * Routing Workflow Activities
 *
 * Activities for the Routing workflow pattern:
 * Query classification and routing to specialized handlers.
 */

import { type WorkflowActivityContext } from "@dapr/dapr";
import { type TActivity } from "../runtime";
import { generateObject, generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { QueryClassification } from "../types";

// ============================================================================
// Input Types
// ============================================================================

export interface ClassifyQueryInput {
  query: string;
  customerId?: string;
  conversationHistory?: string[];
}

export interface GenerateResponseInput {
  query: string;
  classification: QueryClassification;
  customerId?: string;
  handlerConfig: {
    model: string;
    systemPrompt: string;
    temperature?: number;
  };
}

// ============================================================================
// Output Types
// ============================================================================

export interface GenerateResponseOutput {
  response: string;
  handlerModel: string;
  escalationNeeded: boolean;
  suggestedActions?: string[];
}

// ============================================================================
// Schemas
// ============================================================================

const classificationSchema = z.object({
  type: z.enum(["general", "refund", "technical", "billing", "complaint"]).describe("The category of the query"),
  confidence: z.number().min(0).max(1).describe("Confidence score for the classification"),
  reasoning: z.string().describe("Brief explanation of why this classification was chosen"),
});

const responseSchema = z.object({
  response: z.string().describe("The generated response to the customer"),
  escalationNeeded: z.boolean().describe("Whether this should be escalated to a human"),
  suggestedActions: z.array(z.string()).optional().describe("Suggested follow-up actions"),
});

// ============================================================================
// Handler Configurations
// ============================================================================

export const HANDLER_CONFIGS = {
  general: {
    model: "gpt-4o-mini",
    systemPrompt: `You are a friendly and helpful customer support assistant. Handle general inquiries professionally and efficiently. Be concise but thorough.`,
    temperature: 0.7,
  },
  refund: {
    model: "claude-sonnet-4-20250514",
    systemPrompt: `You are a customer support specialist focused on refunds and returns. Be empathetic, understand the customer's situation, and explain the refund process clearly. Always verify order details before proceeding.`,
    temperature: 0.5,
  },
  technical: {
    model: "claude-sonnet-4-20250514",
    systemPrompt: `You are a technical support specialist. Help customers troubleshoot issues step-by-step. Ask clarifying questions when needed and provide clear, technical explanations.`,
    temperature: 0.3,
  },
  billing: {
    model: "gpt-4o",
    systemPrompt: `You are a billing support specialist. Handle payment issues, subscription questions, and invoice inquiries. Be precise with numbers and clear about billing policies.`,
    temperature: 0.4,
  },
  complaint: {
    model: "claude-sonnet-4-20250514",
    systemPrompt: `You are a senior customer support representative handling complaints. Be extremely empathetic, acknowledge the customer's frustration, and focus on resolution. You have authority to offer reasonable compensations.`,
    temperature: 0.6,
  },
} as const;

// ============================================================================
// Activities
// ============================================================================

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
  return anthropic("claude-sonnet-4-20250514");
}

/**
 * Classify Query Activity
 *
 * Classifies customer queries into categories for routing.
 */
export const classifyQueryActivity: TActivity<ClassifyQueryInput, QueryClassification> = async (
  _ctx: WorkflowActivityContext,
  input: ClassifyQueryInput
): Promise<QueryClassification> => {
  const { query, customerId, conversationHistory } = input;

  console.log(`[ClassifyQuery] Classifying query${customerId ? ` for customer ${customerId}` : ''}`);

  const historyContext = conversationHistory?.length
    ? `\nPrevious conversation:\n${conversationHistory.join('\n')}\n`
    : '';

  const result = await generateObject({
    model: anthropic("claude-sonnet-4-20250514"),
    system: `You are a customer support query classifier. Analyze customer queries and classify them into the most appropriate category for routing to the right support specialist.

Categories:
- general: General product questions, how-to queries, feature inquiries
- refund: Return requests, refund status, exchange requests
- technical: Bug reports, technical issues, troubleshooting needs
- billing: Payment issues, subscription questions, invoice inquiries
- complaint: Complaints, negative feedback, escalation requests`,
    prompt: `Classify the following customer query:${historyContext}

Customer Query: "${query}"

Determine the most appropriate category and explain your reasoning.`,
    schema: classificationSchema,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "routing-classify-query",
    },
  });

  return result.object;
};

/**
 * Generate Response Activity
 *
 * Generates a response using the appropriate handler based on classification.
 */
export const generateResponseActivity: TActivity<GenerateResponseInput, GenerateResponseOutput> = async (
  _ctx: WorkflowActivityContext,
  input: GenerateResponseInput
): Promise<GenerateResponseOutput> => {
  const { query, classification, customerId, handlerConfig } = input;

  console.log(`[GenerateResponse] Generating ${classification.type} response with ${handlerConfig.model}`);

  const customerContext = customerId ? `Customer ID: ${customerId}\n` : '';

  const result = await generateObject({
    model: getModel(handlerConfig.model),
    system: handlerConfig.systemPrompt,
    prompt: `${customerContext}Query Classification: ${classification.type} (confidence: ${(classification.confidence * 100).toFixed(0)}%)

Customer Query: "${query}"

Generate an appropriate response. If you cannot fully resolve the issue or if the customer seems very frustrated, indicate that escalation may be needed.`,
    schema: responseSchema,
    temperature: handlerConfig.temperature,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "routing-generate-response",
      metadata: {
        queryType: classification.type,
        handlerModel: handlerConfig.model,
      },
    },
  });

  return {
    ...result.object,
    handlerModel: handlerConfig.model,
  };
};
