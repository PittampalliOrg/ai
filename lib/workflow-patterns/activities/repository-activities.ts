/**
 * Repository Activities
 *
 * Dapr Workflow activities for GitHub repository operations.
 * Integrates with planner-agent for clone and planning operations.
 *
 * Uses Dapr service invocation for automatic service discovery,
 * load balancing, and observability.
 */

import { DaprClient, HttpMethod } from "@dapr/dapr";
import type { WorkflowActivityContext } from "@dapr/dapr";
import type { SequentialPlan } from "../types";

// ============================================================================
// Dapr Service Invocation Configuration
// ============================================================================

/**
 * Planner Agent App ID for Dapr service invocation.
 * This enables automatic service discovery - no hardcoded URLs needed.
 * For cross-namespace invocation, use format: app-id.namespace
 */
const PLANNER_AGENT_APP_ID =
  process.env.PLANNER_AGENT_APP_ID || "planner-agent.planner-agent";

/**
 * Singleton DaprClient instance for service invocation.
 * Reused across all activity calls for connection pooling.
 */
let daprClient: DaprClient | null = null;

/**
 * Get or create the DaprClient singleton.
 * The client automatically connects to the Dapr sidecar.
 */
function getDaprClient(): DaprClient {
  if (!daprClient) {
    daprClient = new DaprClient();
    console.log(
      `[DaprClient] Initialized for service invocation to: ${PLANNER_AGENT_APP_ID}`
    );
  }
  return daprClient;
}

/**
 * Invoke a planner-agent endpoint via Dapr service invocation.
 * Provides automatic retries, load balancing, and distributed tracing.
 */
async function invokePlannerAgent<TRequest extends object, TResponse>(
  endpoint: string,
  data: TRequest,
  method: HttpMethod = HttpMethod.POST
): Promise<TResponse> {
  const client = getDaprClient();

  console.log(
    `[DaprInvoke] Calling ${PLANNER_AGENT_APP_ID}/${endpoint} via Dapr`
  );

  try {
    const response = await client.invoker.invoke(
      PLANNER_AGENT_APP_ID,
      endpoint,
      method,
      data
    );

    return response as TResponse;
  } catch (error) {
    // Enhance error message with Dapr context
    const message =
      error instanceof Error ? error.message : "Unknown Dapr invocation error";
    console.error(
      `[DaprInvoke] Failed to invoke ${PLANNER_AGENT_APP_ID}/${endpoint}: ${message}`
    );
    throw new Error(
      `Dapr service invocation failed for ${PLANNER_AGENT_APP_ID}/${endpoint}: ${message}`
    );
  }
}

// ============================================================================
// Types
// ============================================================================

export interface RepositoryInput {
  owner: string;
  repo: string;
  branch: string;
  token?: string;
}

export interface ValidateRepositoryInput {
  owner: string;
  repo: string;
  branch: string;
  token?: string;
}

export interface ValidateRepositoryOutput {
  valid: boolean;
  error?: string;
}

export interface CloneRepositoryInput {
  repository: RepositoryInput;
  prompt: string;
}

export interface CloneRepositoryOutput {
  success: boolean;
  path: string;
  fileCount: number;
  error?: string;
}

export interface CreatePlanInput {
  repoPath: string;
  prompt: string;
}

export interface CreatePlanOutput {
  plan: SequentialPlan | null;
  error?: string;
}

export interface ExecutePlanInput {
  repoPath: string;
  planId: string;
  workflowId: string;
}

export interface ExecutePlanOutput {
  success: boolean;
  tasksCompleted: number;
  tasksTotal: number;
  filesChanged: string[];
  durableExecution?: boolean;
  error?: string;
}

// ============================================================================
// Response Types (from planner-agent)
// ============================================================================

interface CloneApiResponse {
  path: string;
  success: boolean;
  fileCount?: number;
  error?: string;
}

interface PlanApiResponse {
  success?: boolean;
  plan_id?: string;
  title?: string;
  summary?: string;
  steps_count?: number;
  status?: string;
  durable_execution?: boolean;
  error?: string;
}

interface ExecuteApiResponse {
  success: boolean;
  tasks_completed?: number;
  tasks_total?: number;
  files_changed?: string[];
  durable_execution?: boolean;
  error?: string;
}

// ============================================================================
// Activities
// ============================================================================

/**
 * Activity 1: Validate repository exists and is accessible
 *
 * Uses GitHub API to check if the repository exists and is accessible.
 * Supports private repos via token authentication.
 */
export async function validateRepositoryActivity(
  _context: WorkflowActivityContext,
  input: ValidateRepositoryInput
): Promise<ValidateRepositoryOutput> {
  console.log(
    `[validateRepositoryActivity] Validating ${input.owner}/${input.repo}`
  );

  try {
    const url = `https://api.github.com/repos/${input.owner}/${input.repo}`;
    const headers: Record<string, string> = {
      "User-Agent": "workflow-patterns",
      Accept: "application/vnd.github.v3+json",
    };

    if (input.token) {
      headers.Authorization = `token ${input.token}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const errorBody = await response.text();
      console.log(
        `[validateRepositoryActivity] GitHub API returned ${response.status}: ${errorBody}`
      );

      if (response.status === 404) {
        return {
          valid: false,
          error: `Repository ${input.owner}/${input.repo} not found. It may be private or does not exist.`,
        };
      }
      if (response.status === 401 || response.status === 403) {
        return {
          valid: false,
          error: `Access denied to ${input.owner}/${input.repo}. A valid token may be required.`,
        };
      }
      return {
        valid: false,
        error: `GitHub API error: ${response.status} ${response.statusText}`,
      };
    }

    // Also validate the branch exists
    if (input.branch && input.branch !== "main" && input.branch !== "master") {
      const branchUrl = `https://api.github.com/repos/${input.owner}/${input.repo}/branches/${input.branch}`;
      const branchResponse = await fetch(branchUrl, { headers });

      if (!branchResponse.ok) {
        return {
          valid: false,
          error: `Branch '${input.branch}' not found in ${input.owner}/${input.repo}`,
        };
      }
    }

    console.log(
      `[validateRepositoryActivity] Repository ${input.owner}/${input.repo} is valid`
    );
    return { valid: true };
  } catch (error) {
    console.error(`[validateRepositoryActivity] Error:`, error);
    return {
      valid: false,
      error: `Failed to validate repository: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Activity 2: Clone repository via planner-agent (Dapr Service Invocation)
 *
 * Uses Dapr service invocation for:
 * - Automatic service discovery (no hardcoded URLs)
 * - Built-in retries and circuit breaking
 * - Distributed tracing via Dapr sidecars
 *
 * The planner-agent handles:
 * - Git clone with auth support
 * - Shallow clone (--depth 1) for performance
 */
export async function cloneRepositoryActivity(
  _context: WorkflowActivityContext,
  input: CloneRepositoryInput
): Promise<CloneRepositoryOutput> {
  const { repository } = input;

  console.log(
    `[cloneRepositoryActivity] Cloning ${repository.owner}/${repository.repo} via Dapr service invocation`
  );

  try {
    const result = await invokePlannerAgent<
      {
        owner: string;
        repo: string;
        branch: string;
        token?: string;
      },
      CloneApiResponse
    >("api/clone", {
      owner: repository.owner,
      repo: repository.repo,
      branch: repository.branch,
      token: repository.token,
    });

    console.log(`[cloneRepositoryActivity] Clone result:`, result);

    if (!result.success) {
      return {
        success: false,
        path: "",
        fileCount: 0,
        error: result.error || "Clone failed",
      };
    }

    return {
      success: true,
      path: result.path,
      fileCount: result.fileCount || 0,
    };
  } catch (error) {
    console.error(`[cloneRepositoryActivity] Error:`, error);
    return {
      success: false,
      path: "",
      fileCount: 0,
      error: `Dapr service invocation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Activity 3: Create implementation plan via planner-agent (Dapr Service Invocation)
 *
 * Uses Dapr service invocation for automatic service discovery and tracing.
 *
 * Calls the planner-agent durable endpoint which uses DurableAgent to:
 * - Explore the codebase with fault-tolerant execution
 * - Generate an implementation plan with persistent state
 * - Falls back to standard PlannerAgent if Dapr Agents unavailable
 */
export async function createPlanActivity(
  _context: WorkflowActivityContext,
  input: CreatePlanInput
): Promise<CreatePlanOutput> {
  console.log(
    `[createPlanActivity] Creating plan for ${input.repoPath} via Dapr service invocation`
  );

  try {
    const result = await invokePlannerAgent<
      {
        cwd: string;
        prompt: string;
        use_durable: boolean;
      },
      PlanApiResponse
    >("api/durable/plan", {
      cwd: input.repoPath,
      prompt: input.prompt,
      use_durable: true,
    });

    if (!result.success) {
      console.error(
        `[createPlanActivity] planner-agent returned error: ${result.error}`
      );
      return {
        plan: null,
        error: `Plan creation failed: ${result.error}`,
      };
    }

    console.log(
      `[createPlanActivity] Plan created:`,
      result.title,
      `(durable: ${result.durable_execution})`
    );

    // Transform the durable response to match SequentialPlan type
    // The durable endpoint returns a flattened response structure
    const plan: SequentialPlan = {
      id: result.plan_id || "plan_1",
      title: result.title || "Implementation Plan",
      summary: result.summary || "",
      steps: [], // Durable endpoint doesn't return steps in the same format
      criticalFiles: [],
      considerations: [],
      status: (result.status as "draft" | "approved" | "rejected") || "draft",
    };

    return { plan };
  } catch (error) {
    console.error(`[createPlanActivity] Error:`, error);
    return {
      plan: null,
      error: `Dapr service invocation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Activity 4: Execute an approved plan via planner-agent (Dapr Service Invocation)
 *
 * Uses Dapr service invocation for automatic service discovery and tracing.
 * Note: Dapr has its own timeout and retry mechanisms configured via policies.
 *
 * Calls the planner-agent durable endpoint which uses DurableAgent to:
 * - Execute plan with fault-tolerant, resumable activities
 * - Persistent state via ConversationDaprStateMemory
 * - Automatic retry mechanisms
 * - Falls back to standard execution if Dapr Agents unavailable
 */
export async function executePlanActivity(
  _context: WorkflowActivityContext,
  input: ExecutePlanInput
): Promise<ExecutePlanOutput> {
  console.log(
    `[executePlanActivity] Executing plan ${input.planId} for ${input.repoPath} via Dapr service invocation`
  );

  try {
    const result = await invokePlannerAgent<
      {
        cwd: string;
        plan_id: string;
        workflow_id: string;
      },
      ExecuteApiResponse
    >("api/durable/execute", {
      cwd: input.repoPath,
      plan_id: input.planId,
      workflow_id: input.workflowId,
    });

    if (!result.success) {
      console.error(
        `[executePlanActivity] planner-agent returned error: ${result.error}`
      );
      return {
        success: false,
        tasksCompleted: result.tasks_completed || 0,
        tasksTotal: result.tasks_total || 0,
        filesChanged: result.files_changed || [],
        error: `Execution failed: ${result.error}`,
      };
    }

    console.log(
      `[executePlanActivity] Execution completed: ${result.tasks_completed}/${result.tasks_total} tasks (durable: ${result.durable_execution})`
    );

    return {
      success: result.success,
      tasksCompleted: result.tasks_completed || 0,
      tasksTotal: result.tasks_total || 0,
      filesChanged: result.files_changed || [],
      durableExecution: result.durable_execution,
      error: result.error,
    };
  } catch (error) {
    console.error(`[executePlanActivity] Error:`, error);

    return {
      success: false,
      tasksCompleted: 0,
      tasksTotal: 0,
      filesChanged: [],
      error: `Dapr service invocation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
