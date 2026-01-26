/**
 * LLM Orchestrator Workflow
 *
 * Intelligent agent selection and routing using LLM-based decision making.
 * Based on the Dapr Agents pattern for multi-agent orchestration.
 *
 * This workflow:
 * 1. Queries the agent registry for available agents
 * 2. Uses an LLM to select the best agent for the task
 * 3. Invokes the selected agent via Dapr service invocation
 * 4. Returns the result
 *
 * Dapr Features Used:
 * - setCustomStatus(): Real-time progress tracking
 * - isReplaying(): Conditional logging during replay
 * - callActivity(): LLM-based agent selection and invocation
 *
 * Agent Registry Pattern:
 * - Agents register with capabilities (e.g., ["clone", "plan", "execute"])
 * - LLM analyzes task requirements and matches to agent capabilities
 * - Enables dynamic scaling and agent hot-swapping
 */

import { type WorkflowContext, type TWorkflow } from "@dapr/dapr";
import type { AgentMetadata } from "../../dapr/agent-registry";

// ============================================================================
// Types
// ============================================================================

/**
 * Input for the LLM Orchestrator workflow.
 */
export interface LLMOrchestratorInput {
  /** The task to be performed */
  task: string;
  /** Team name to search for agents */
  teamName: string;
  /** Additional context for the task */
  context?: Record<string, unknown>;
  /** Optional: Preferred agent App ID (bypasses LLM selection) */
  preferredAgentId?: string;
  /** Optional: Required capabilities for agent selection */
  requiredCapabilities?: string[];
}

/**
 * Output from the LLM Orchestrator workflow.
 */
export interface LLMOrchestratorOutput {
  /** Whether the task was completed successfully */
  success: boolean;
  /** The agent that was selected to handle the task */
  selectedAgent: string;
  /** The result from the agent execution */
  result?: unknown;
  /** Error message if failed */
  error?: string;
  /** LLM's reasoning for agent selection */
  selectionReasoning?: string;
}

/**
 * Agent selection input for the activity.
 */
interface SelectAgentInput {
  task: string;
  agents: AgentMetadata[];
  requiredCapabilities?: string[];
}

/**
 * Agent selection output.
 */
interface SelectAgentOutput {
  selectedAppId: string;
  reasoning: string;
}

/**
 * Agent invocation input.
 */
interface InvokeAgentInput {
  appId: string;
  endpoint: string;
  task: string;
  context?: Record<string, unknown>;
}

// Activity function references (resolved at runtime by name)
const getAgentsActivity = "getAgentsActivity";
const selectAgentActivity = "selectAgentActivity";
const invokeAgentActivity = "invokeAgentActivity";

// ============================================================================
// LLM Orchestrator Workflow
// ============================================================================

/**
 * LLM Orchestrator Workflow
 *
 * Intelligently routes tasks to the most appropriate agent based on:
 * 1. Agent capabilities from the registry
 * 2. LLM analysis of task requirements
 * 3. Optional user preferences (preferredAgentId)
 */
export const llmOrchestratorWorkflow: TWorkflow = async function* (
  ctx: WorkflowContext,
  input: LLMOrchestratorInput
): AsyncGenerator<unknown, LLMOrchestratorOutput, unknown> {
  const { task, teamName, context, preferredAgentId, requiredCapabilities } = input;

  if (!ctx.isReplaying()) {
    console.log(`[LLM Orchestrator] Starting task routing for team: ${teamName}`);
    console.log(`[LLM Orchestrator] Task: ${task.substring(0, 100)}...`);
  }

  // ========================================================================
  // Step 1: Get Available Agents from Registry
  // ========================================================================

  ctx.setCustomStatus("Querying agent registry...");

  const agents = (yield ctx.callActivity(getAgentsActivity, {
    teamName,
  })) as AgentMetadata[];

  if (!agents || agents.length === 0) {
    if (!ctx.isReplaying()) {
      console.error(`[LLM Orchestrator] No agents found for team: ${teamName}`);
    }
    return {
      success: false,
      selectedAgent: "",
      error: `No agents found for team: ${teamName}`,
    };
  }

  if (!ctx.isReplaying()) {
    console.log(`[LLM Orchestrator] Found ${agents.length} agents in team ${teamName}`);
  }

  ctx.setCustomStatus(`Found ${agents.length} agents`);

  // ========================================================================
  // Step 2: Select Best Agent (LLM or Preferred)
  // ========================================================================

  let selectedAppId: string;
  let selectionReasoning: string;

  if (preferredAgentId) {
    // User specified a preferred agent - verify it exists
    const preferredAgent = agents.find((a) => a.appId === preferredAgentId);
    if (preferredAgent) {
      selectedAppId = preferredAgentId;
      selectionReasoning = `User preferred agent: ${preferredAgentId}`;
    } else {
      if (!ctx.isReplaying()) {
        console.warn(`[LLM Orchestrator] Preferred agent ${preferredAgentId} not found, using LLM selection`);
      }
      // Fall back to LLM selection
      const selection = (yield ctx.callActivity(selectAgentActivity, {
        task,
        agents,
        requiredCapabilities,
      } as SelectAgentInput)) as SelectAgentOutput;

      selectedAppId = selection.selectedAppId;
      selectionReasoning = selection.reasoning;
    }
  } else {
    // Use LLM to select best agent
    ctx.setCustomStatus("LLM selecting best agent...");

    const selection = (yield ctx.callActivity(selectAgentActivity, {
      task,
      agents,
      requiredCapabilities,
    } as SelectAgentInput)) as SelectAgentOutput;

    selectedAppId = selection.selectedAppId;
    selectionReasoning = selection.reasoning;
  }

  if (!ctx.isReplaying()) {
    console.log(`[LLM Orchestrator] Selected agent: ${selectedAppId}`);
    console.log(`[LLM Orchestrator] Reasoning: ${selectionReasoning}`);
  }

  ctx.setCustomStatus(`Selected: ${selectedAppId}`);

  // ========================================================================
  // Step 3: Invoke Selected Agent
  // ========================================================================

  ctx.setCustomStatus(`Invoking ${selectedAppId}...`);

  // Find the agent to get its endpoints
  const selectedAgent = agents.find((a) => a.appId === selectedAppId);
  if (!selectedAgent) {
    return {
      success: false,
      selectedAgent: selectedAppId,
      selectionReasoning,
      error: `Selected agent ${selectedAppId} not found in registry`,
    };
  }

  // Determine best endpoint based on task
  // Default to the plan endpoint for planning tasks, execute for others
  const endpoint = task.toLowerCase().includes("plan")
    ? "api/durable/plan"
    : selectedAgent.endpoints[0]?.replace(/^\//, "") || "api/durable/execute";

  if (!ctx.isReplaying()) {
    console.log(`[LLM Orchestrator] Invoking ${selectedAppId}/${endpoint}`);
  }

  try {
    const result = (yield ctx.callActivity(invokeAgentActivity, {
      appId: selectedAppId,
      endpoint,
      task,
      context,
    } as InvokeAgentInput)) as unknown;

    ctx.setCustomStatus(`Complete: ${selectedAppId}`);

    if (!ctx.isReplaying()) {
      console.log(`[LLM Orchestrator] Task completed successfully`);
    }

    return {
      success: true,
      selectedAgent: selectedAppId,
      result,
      selectionReasoning,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (!ctx.isReplaying()) {
      console.error(`[LLM Orchestrator] Agent invocation failed:`, error);
    }

    ctx.setCustomStatus(`Failed: ${errorMessage}`);

    return {
      success: false,
      selectedAgent: selectedAppId,
      selectionReasoning,
      error: `Agent ${selectedAppId} failed: ${errorMessage}`,
    };
  }
};

// ============================================================================
// Workflow Registration
// ============================================================================

/**
 * Get the workflow name for registration.
 */
export function getLLMOrchestratorWorkflowName(): string {
  return "llmOrchestratorWorkflow";
}

// ============================================================================
// Activity Names (for registration)
// ============================================================================

/**
 * Activity names used by this workflow.
 * These must be registered in the workflow runtime.
 */
export const LLM_ORCHESTRATOR_ACTIVITIES = {
  getAgents: getAgentsActivity,
  selectAgent: selectAgentActivity,
  invokeAgent: invokeAgentActivity,
} as const;
