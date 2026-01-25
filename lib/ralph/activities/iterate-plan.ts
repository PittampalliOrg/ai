/**
 * Iterate Plan Activity
 *
 * Updates a task plan based on user feedback using an LLM.
 */

import { type WorkflowActivityContext } from "@dapr/dapr";
import { type TActivity } from "../workflow-runtime";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { type TaskPlan, parseXmlPlan } from "@/lib/types/ralph-plan";
import { generateIterationPrompt } from "../prompts";
import { updateAgentSessionStatus } from "@/lib/db/agent-queries";

/**
 * Input for the iterate plan activity
 */
export interface IteratePlanInput {
  plan: TaskPlan;
  feedback: string;
}

/**
 * Convert a TaskPlan back to XML format for iteration
 */
function planToXml(plan: TaskPlan): string {
  const itemsXml = plan.items
    .map((item) => {
      const deps = item.dependencies.join(", ");
      const files = item.files.join(", ");
      const criteria = item.acceptanceCriteria
        ?.map((c) => `        <criterion>${c}</criterion>`)
        .join("\n") || "";

      return `    <item id="${item.id}">
      <title>${item.title}</title>
      <description>${item.description}</description>
      <priority>${item.priority}</priority>
      <dependencies>${deps}</dependencies>
      <files>${files}</files>
      <acceptance_criteria>
${criteria}
      </acceptance_criteria>
    </item>`;
    })
    .join("\n");

  return `<plan>
  <title>${plan.title}</title>
  <objective>${plan.objective}</objective>
  <items>
${itemsXml}
  </items>
</plan>`;
}

/**
 * Iterate Plan Activity
 *
 * Takes an existing plan and user feedback, then uses an LLM to generate
 * an updated plan that addresses the feedback.
 */
export const iteratePlanActivity: TActivity<IteratePlanInput, TaskPlan> = async (
  _ctx: WorkflowActivityContext,
  input: IteratePlanInput
): Promise<TaskPlan> => {
  const { plan, feedback } = input;
  const sessionId = plan.sessionId;

  console.log(`[IteratePlan] Iterating plan for session ${sessionId}`);
  console.log(`[IteratePlan] Current iteration: ${plan.iteration}`);
  console.log(`[IteratePlan] Feedback: ${feedback.substring(0, 100)}...`);

  try {
    // Convert existing plan to XML
    const existingPlanXml = planToXml(plan);

    // Generate the iteration prompt
    const iterationPrompt = generateIterationPrompt(existingPlanXml, feedback);

    // Use Claude to iterate on the plan
    const result = await generateText({
      model: anthropic("claude-sonnet-4-20250514"),
      prompt: iterationPrompt,
      experimental_telemetry: {
        isEnabled: true,
        functionId: "ralph-iterate-plan",
        metadata: {
          sessionId,
          iteration: String(plan.iteration + 1),
        },
      },
    });

    console.log(`[IteratePlan] LLM response received (${result.text.length} chars)`);

    // Parse the updated plan
    const updatedPlan = parseXmlPlan(result.text, sessionId);

    // Preserve metadata from original plan
    updatedPlan.iteration = plan.iteration + 1;
    updatedPlan.status = "iterating";
    updatedPlan.createdAt = plan.createdAt;
    updatedPlan.updatedAt = new Date().toISOString();

    // Preserve execution state for items that weren't changed
    for (const item of updatedPlan.items) {
      const existingItem = plan.items.find((i) => i.id === item.id);
      if (existingItem && existingItem.status !== "pending") {
        // Preserve status and result of already-executed items
        item.status = existingItem.status;
        item.result = existingItem.result;
      }
    }

    console.log(
      `[IteratePlan] Plan updated: "${updatedPlan.title}" with ${updatedPlan.items.length} items`
    );

    // Update the agent session with the new plan
    await updateAgentSessionStatus({
      id: sessionId,
      taskPlan: updatedPlan,
    });

    return updatedPlan;
  } catch (error) {
    console.error(`[IteratePlan] Error iterating plan:`, error);

    // Return the original plan with an error note
    const errorPlan: TaskPlan = {
      ...plan,
      status: "iterating",
      updatedAt: new Date().toISOString(),
      items: [
        ...plan.items,
        {
          id: `error-iteration-${plan.iteration + 1}`,
          title: "Iteration Error",
          description:
            error instanceof Error
              ? `Failed to process feedback: ${error.message}`
              : "Unknown error processing feedback",
          status: "failed",
          priority: plan.items.length + 1,
          dependencies: [],
          files: [],
          result: {
            success: false,
            error:
              error instanceof Error ? error.message : "Unknown error",
          },
        },
      ],
    };

    await updateAgentSessionStatus({
      id: sessionId,
      taskPlan: errorPlan,
    });

    throw error;
  }
};
