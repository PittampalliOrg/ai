/**
 * Repository Activities
 *
 * Dapr Workflow activities for GitHub repository operations.
 * Integrates with planner-agent for clone and planning operations.
 */

import type { WorkflowActivityContext } from "@dapr/dapr";
import type { SequentialPlan } from "../types";

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
  error?: string;
}

// ============================================================================
// Configuration
// ============================================================================

const PLANNER_AGENT_URL =
  process.env.PLANNER_AGENT_URL ||
  "http://planner-agent.planner-agent.svc.cluster.local:8080";

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
 * Activity 2: Clone repository via planner-agent
 *
 * Calls the planner-agent service which handles:
 * - Git clone with auth support
 * - Shallow clone (--depth 1) for performance
 */
export async function cloneRepositoryActivity(
  _context: WorkflowActivityContext,
  input: CloneRepositoryInput
): Promise<CloneRepositoryOutput> {
  const { repository } = input;

  console.log(
    `[cloneRepositoryActivity] Cloning ${repository.owner}/${repository.repo} via planner-agent`
  );

  try {
    const response = await fetch(`${PLANNER_AGENT_URL}/api/clone`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        owner: repository.owner,
        repo: repository.repo,
        branch: repository.branch,
        token: repository.token,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[cloneRepositoryActivity] planner-agent returned ${response.status}: ${errorText}`
      );
      return {
        success: false,
        path: "",
        fileCount: 0,
        error: `Clone failed: ${response.status} - ${errorText}`,
      };
    }

    const result = await response.json();
    console.log(`[cloneRepositoryActivity] Clone result:`, result);

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
      error: `Failed to connect to planner-agent: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Activity 3: Create implementation plan via planner-agent
 *
 * Calls the planner-agent service which uses Claude SDK to:
 * - Explore the codebase
 * - Generate an implementation plan
 */
export async function createPlanActivity(
  _context: WorkflowActivityContext,
  input: CreatePlanInput
): Promise<CreatePlanOutput> {
  console.log(
    `[createPlanActivity] Creating plan for ${input.repoPath}`
  );

  try {
    const response = await fetch(`${PLANNER_AGENT_URL}/api/plan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cwd: input.repoPath,
        prompt: input.prompt,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[createPlanActivity] planner-agent returned ${response.status}: ${errorText}`
      );
      return {
        plan: null,
        error: `Plan creation failed: ${response.status} - ${errorText}`,
      };
    }

    const result = await response.json();
    console.log(`[createPlanActivity] Plan created:`, result.plan?.title);

    // Transform the result to match SequentialPlan type
    const plan: SequentialPlan = {
      id: result.plan.id,
      title: result.plan.title,
      summary: result.plan.summary,
      steps: (result.plan.steps || []).map((step: { title: string; description: string; files_affected?: string[]; complexity?: string }) => ({
        title: step.title,
        description: step.description,
        filesAffected: step.files_affected,
        complexity: step.complexity as "low" | "medium" | "high" | undefined,
      })),
      criticalFiles: result.plan.critical_files,
      considerations: result.plan.considerations,
      status: result.plan.status || "draft",
    };

    return { plan };
  } catch (error) {
    console.error(`[createPlanActivity] Error:`, error);
    return {
      plan: null,
      error: `Failed to create plan: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Activity 4: Execute an approved plan via planner-agent
 *
 * Calls the planner-agent service which uses Claude SDK to:
 * - Convert the approved plan to tasks
 * - Execute each task with Write, Edit, Bash tools
 * - Stream progress via Dapr pub/sub
 */
export async function executePlanActivity(
  _context: WorkflowActivityContext,
  input: ExecutePlanInput
): Promise<ExecutePlanOutput> {
  console.log(
    `[executePlanActivity] Executing plan ${input.planId} for ${input.repoPath}`
  );

  try {
    // Use a long timeout for execution (30 minutes)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30 * 60 * 1000);

    const response = await fetch(`${PLANNER_AGENT_URL}/api/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repo_path: input.repoPath,
        plan_id: input.planId,
        workflow_id: input.workflowId,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[executePlanActivity] planner-agent returned ${response.status}: ${errorText}`
      );
      return {
        success: false,
        tasksCompleted: 0,
        tasksTotal: 0,
        filesChanged: [],
        error: `Execution failed: ${response.status} - ${errorText}`,
      };
    }

    const result = await response.json();
    console.log(
      `[executePlanActivity] Execution completed: ${result.tasks_completed}/${result.tasks_total} tasks`
    );

    return {
      success: result.success,
      tasksCompleted: result.tasks_completed || 0,
      tasksTotal: result.tasks_total || 0,
      filesChanged: result.files_changed || [],
      error: result.error,
    };
  } catch (error) {
    console.error(`[executePlanActivity] Error:`, error);

    // Check if it was a timeout
    if (error instanceof Error && error.name === "AbortError") {
      return {
        success: false,
        tasksCompleted: 0,
        tasksTotal: 0,
        filesChanged: [],
        error: "Execution timed out after 30 minutes",
      };
    }

    return {
      success: false,
      tasksCompleted: 0,
      tasksTotal: 0,
      filesChanged: [],
      error: `Failed to execute plan: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
