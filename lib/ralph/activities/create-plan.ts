/**
 * Create Plan Activity
 *
 * Generates an initial task plan from a user prompt using an LLM.
 */

import { type WorkflowActivityContext } from "@dapr/dapr";
import { type TActivity } from "../workflow-runtime";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { type TaskPlan, parseXmlPlan } from "@/lib/types/ralph-plan";
import { RALPH_PLANNER_PROMPT } from "../prompts";
import { updateAgentSessionStatus } from "@/lib/db/agent-queries";

/**
 * Input for the create plan activity
 */
export interface CreatePlanInput {
  sessionId: string;
  prompt: string;
}

/**
 * Create Plan Activity
 *
 * Uses an LLM to generate a structured task plan from a user's prompt.
 * The plan is returned in a parsed format ready for iteration or execution.
 */
export const createPlanActivity: TActivity<CreatePlanInput, TaskPlan> = async (
  _ctx: WorkflowActivityContext,
  input: CreatePlanInput
): Promise<TaskPlan> => {
  const { sessionId, prompt } = input;

  console.log(`[CreatePlan] Generating plan for session ${sessionId}`);
  console.log(`[CreatePlan] User prompt: ${prompt.substring(0, 100)}...`);

  try {
    // Use Claude to generate the plan
    const result = await generateText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: RALPH_PLANNER_PROMPT,
      prompt: `Create a detailed implementation plan for the following request:\n\n${prompt}`,
      experimental_telemetry: {
        isEnabled: true,
        functionId: "ralph-create-plan",
        metadata: {
          sessionId,
        },
      },
    });

    console.log(`[CreatePlan] LLM response received (${result.text.length} chars)`);

    // Parse the XML plan from the response
    const plan = parseXmlPlan(result.text, sessionId);

    console.log(`[CreatePlan] Plan parsed: "${plan.title}" with ${plan.items.length} items`);

    // Update the agent session with the plan
    await updateAgentSessionStatus({
      id: sessionId,
      taskPlan: plan,
      status: "running",
    });

    return plan;
  } catch (error) {
    console.error(`[CreatePlan] Error generating plan:`, error);

    // Create a fallback error plan
    const errorPlan: TaskPlan = {
      version: "1.0",
      sessionId,
      title: "Error Creating Plan",
      objective: "Failed to generate plan",
      status: "failed",
      items: [
        {
          id: "error-1",
          title: "Plan Generation Failed",
          description:
            error instanceof Error
              ? error.message
              : "Unknown error occurred while generating the plan",
          status: "failed",
          priority: 1,
          dependencies: [],
          files: [],
          result: {
            success: false,
            error:
              error instanceof Error ? error.message : "Unknown error",
          },
        },
      ],
      currentItemIndex: 0,
      iteration: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await updateAgentSessionStatus({
      id: sessionId,
      taskPlan: errorPlan,
      status: "error",
    });

    throw error;
  }
};
