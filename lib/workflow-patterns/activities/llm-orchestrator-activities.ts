/**
 * LLM Orchestrator Activities
 *
 * Dapr Workflow activities for intelligent agent selection and routing.
 *
 * Activities:
 * 1. getAgentsActivity - Query agent registry for available agents
 * 2. selectAgentActivity - Use LLM to select best agent for task
 * 3. invokeAgentActivity - Invoke selected agent via Dapr service invocation
 */

import { DaprClient, HttpMethod } from "@dapr/dapr";
import type { WorkflowActivityContext } from "@dapr/dapr";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { AgentMetadata } from "../../dapr/agent-registry";

// ============================================================================
// Configuration
// ============================================================================

const AGENT_REGISTRY_STORE =
  process.env.AGENT_REGISTRY_STORE || "agentregistrystore";

/**
 * Singleton DaprClient for activities.
 */
let daprClient: DaprClient | null = null;

function getDaprClient(): DaprClient {
  if (!daprClient) {
    daprClient = new DaprClient();
  }
  return daprClient;
}

// ============================================================================
// Types
// ============================================================================

export interface GetAgentsInput {
  teamName: string;
}

export interface SelectAgentInput {
  task: string;
  agents: AgentMetadata[];
  requiredCapabilities?: string[];
}

export interface SelectAgentOutput {
  selectedAppId: string;
  reasoning: string;
}

export interface InvokeAgentInput {
  appId: string;
  endpoint: string;
  task: string;
  context?: Record<string, unknown>;
}

// ============================================================================
// Activities
// ============================================================================

/**
 * Activity: Get agents from the registry by team.
 *
 * Queries the Dapr state store for all agents registered under a team.
 * Returns only active agents that are available for task assignment.
 */
export async function getAgentsActivity(
  _context: WorkflowActivityContext,
  input: GetAgentsInput
): Promise<AgentMetadata[]> {
  const { teamName } = input;

  console.log(`[getAgentsActivity] Querying agents for team: ${teamName}`);

  const client = getDaprClient();

  try {
    // Get the team index
    const indexKey = `team-index:${teamName}`;
    const indexResponse = await client.state.get(AGENT_REGISTRY_STORE, indexKey);

    if (!indexResponse) {
      console.log(`[getAgentsActivity] No team index found for: ${teamName}`);
      return [];
    }

    const agentIds = indexResponse as string[];
    if (!agentIds || agentIds.length === 0) {
      console.log(`[getAgentsActivity] Empty team index for: ${teamName}`);
      return [];
    }

    // Fetch all agents in bulk
    const keys = agentIds.map((id) => `agent:${teamName}:${id}`);
    const bulkResponse = await client.state.getBulk(AGENT_REGISTRY_STORE, keys);

    const agents: AgentMetadata[] = [];
    for (const item of bulkResponse) {
      if (item.data) {
        const agent =
          typeof item.data === "string"
            ? (JSON.parse(item.data) as AgentMetadata)
            : (item.data as AgentMetadata);

        // Only include active agents
        if (agent.status === "active") {
          agents.push(agent);
        }
      }
    }

    console.log(
      `[getAgentsActivity] Found ${agents.length} active agents for team: ${teamName}`
    );

    return agents;
  } catch (error) {
    console.error(`[getAgentsActivity] Error querying agents:`, error);
    return [];
  }
}

/**
 * Activity: Use LLM to select the best agent for a task.
 *
 * Analyzes the task requirements and agent capabilities to select
 * the most appropriate agent. Uses Claude for intelligent reasoning.
 */
export async function selectAgentActivity(
  _context: WorkflowActivityContext,
  input: SelectAgentInput
): Promise<SelectAgentOutput> {
  const { task, agents, requiredCapabilities } = input;

  console.log(
    `[selectAgentActivity] Selecting agent for task from ${agents.length} candidates`
  );

  // If only one agent, select it directly
  if (agents.length === 1) {
    return {
      selectedAppId: agents[0].appId,
      reasoning: "Only one agent available, selected by default.",
    };
  }

  // If required capabilities specified, filter agents first
  let eligibleAgents = agents;
  if (requiredCapabilities && requiredCapabilities.length > 0) {
    eligibleAgents = agents.filter((agent) =>
      requiredCapabilities.every((cap) => agent.capabilities.includes(cap))
    );

    if (eligibleAgents.length === 0) {
      // Fall back to agent with most matching capabilities
      const scored = agents.map((agent) => ({
        agent,
        score: requiredCapabilities.filter((cap) =>
          agent.capabilities.includes(cap)
        ).length,
      }));
      scored.sort((a, b) => b.score - a.score);
      eligibleAgents = [scored[0].agent];
    }

    if (eligibleAgents.length === 1) {
      return {
        selectedAppId: eligibleAgents[0].appId,
        reasoning: `Selected based on required capabilities: ${requiredCapabilities.join(", ")}`,
      };
    }
  }

  // Use LLM for intelligent selection
  const agentDescriptions = eligibleAgents
    .map(
      (a) =>
        `- ${a.appId}: capabilities=[${a.capabilities.join(", ")}], endpoints=[${a.endpoints.join(", ")}]${a.description ? `, description="${a.description}"` : ""}`
    )
    .join("\n");

  try {
    const { text } = await generateText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: `You are an agent router. Select the best agent for the given task based on their capabilities.
Reply with ONLY a JSON object in this exact format:
{"appId": "<selected_app_id>", "reasoning": "<brief explanation>"}

Do not include any other text, just the JSON object.`,
      prompt: `Task: "${task}"

Available agents:
${agentDescriptions}

Which agent should handle this task?`,
    });

    // Parse LLM response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as {
        appId: string;
        reasoning: string;
      };

      // Verify the selected agent exists
      const selectedAgent = eligibleAgents.find(
        (a) => a.appId === parsed.appId
      );
      if (selectedAgent) {
        console.log(
          `[selectAgentActivity] LLM selected: ${parsed.appId} - ${parsed.reasoning}`
        );
        return {
          selectedAppId: parsed.appId,
          reasoning: parsed.reasoning,
        };
      }
    }

    // Fallback: select agent with most capabilities matching task keywords
    console.warn(
      `[selectAgentActivity] LLM selection failed, using fallback`
    );
  } catch (error) {
    console.error(`[selectAgentActivity] LLM error:`, error);
  }

  // Fallback: select first eligible agent
  return {
    selectedAppId: eligibleAgents[0].appId,
    reasoning: "Fallback selection - first eligible agent.",
  };
}

/**
 * Activity: Invoke a selected agent via Dapr service invocation.
 *
 * Uses Dapr's service invocation to call the agent's endpoint.
 * Provides automatic service discovery, retries, and tracing.
 */
export async function invokeAgentActivity(
  _context: WorkflowActivityContext,
  input: InvokeAgentInput
): Promise<unknown> {
  const { appId, endpoint, task, context: taskContext } = input;

  console.log(`[invokeAgentActivity] Invoking ${appId}/${endpoint}`);

  const client = getDaprClient();

  try {
    const response = await client.invoker.invoke(appId, endpoint, HttpMethod.POST, {
      task,
      prompt: task,
      cwd: taskContext?.cwd || "/workspace",
      ...taskContext,
    });

    console.log(`[invokeAgentActivity] Invocation successful`);

    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown invocation error";
    console.error(`[invokeAgentActivity] Error invoking ${appId}:`, error);
    throw new Error(`Failed to invoke agent ${appId}: ${message}`);
  }
}

// ============================================================================
// Activity Registration Helpers
// ============================================================================

/**
 * Activity names for registration.
 */
export const LLM_ORCHESTRATOR_ACTIVITY_NAMES = {
  getAgents: "getAgentsActivity",
  selectAgent: "selectAgentActivity",
  invokeAgent: "invokeAgentActivity",
} as const;

/**
 * Get all LLM orchestrator activities for registration.
 */
export function getLLMOrchestratorActivities() {
  return {
    [LLM_ORCHESTRATOR_ACTIVITY_NAMES.getAgents]: getAgentsActivity,
    [LLM_ORCHESTRATOR_ACTIVITY_NAMES.selectAgent]: selectAgentActivity,
    [LLM_ORCHESTRATOR_ACTIVITY_NAMES.invokeAgent]: invokeAgentActivity,
  };
}
