/**
 * Create PR Activity
 *
 * Creates a GitHub Pull Request with all the changes made during execution.
 */

import { type WorkflowActivityContext } from "@dapr/dapr";
import { type TActivity } from "../workflow-runtime";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { type TaskPlan, getPlanStats } from "@/lib/types/ralph-plan";
import { RALPH_PR_DESCRIPTION_PROMPT } from "../prompts";
import {
  invokeSandboxMethod,
  type SandboxShellResponse,
} from "@/lib/sandbox/dapr-client";
import { getAgentSession } from "@/lib/db/agent-queries";

/**
 * Input for the create PR activity
 */
export interface CreatePRInput {
  sessionId: string;
  plan: TaskPlan;
  targetRepo: {
    owner: string;
    repo: string;
    branch: string;
    installationId?: string;
  };
}

/**
 * Output from the create PR activity
 */
export interface CreatePROutput {
  number: number;
  url: string;
  status: string;
  branch: string;
}

/**
 * Get sandbox app ID for a session
 */
async function getSandboxAppId(sessionId: string): Promise<string | null> {
  const session = await getAgentSession({ id: sessionId });
  if (!session?.sandboxPodName) {
    return null;
  }
  return `sandbox-${sessionId.substring(0, 8)}`;
}

/**
 * Execute a shell command in the sandbox
 */
async function executeShell(
  sandboxAppId: string,
  command: string,
  workdir: string
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  const result = await invokeSandboxMethod<SandboxShellResponse>(
    sandboxAppId,
    "v1/shell/exec",
    { command, workdir, timeout: 60 },
    60000
  );

  if (!result.success || !result.data) {
    return {
      success: false,
      stdout: "",
      stderr: result.error || "Unknown error",
    };
  }

  return {
    success: result.data.exit_code === 0,
    stdout: result.data.output,
    stderr: "", // Sandbox API combines output
  };
}

/**
 * Generate a PR description using LLM
 */
async function generatePRDescription(
  plan: TaskPlan,
  sessionId: string
): Promise<string> {
  const stats = getPlanStats(plan);

  // Build a summary of completed tasks
  const completedTasks = plan.items
    .filter((item) => item.status === "completed")
    .map((item) => {
      const files = item.result?.filesModified?.join(", ") || "N/A";
      return `- **${item.title}**: ${item.description.substring(0, 100)}...\n  - Files: ${files}`;
    })
    .join("\n");

  const prompt = `${RALPH_PR_DESCRIPTION_PROMPT}

## Plan Information

**Title**: ${plan.title}
**Objective**: ${plan.objective}

## Completed Tasks

${completedTasks}

## Statistics

- Total items: ${stats.total}
- Completed: ${stats.completed}
- Failed: ${stats.failed}
- Skipped: ${stats.skipped}

Generate a professional PR description based on this information.`;

  const result = await generateText({
    model: anthropic("claude-sonnet-4-20250514"),
    prompt,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "ralph-generate-pr-description",
      metadata: {
        sessionId,
      },
    },
  });

  return result.text;
}

/**
 * Create PR Activity
 *
 * Creates a GitHub Pull Request by:
 * 1. Creating a new branch from the changes
 * 2. Committing all modified files
 * 3. Pushing the branch
 * 4. Creating a PR via GitHub CLI
 */
export const createPRActivity: TActivity<CreatePRInput, CreatePROutput> = async (
  _ctx: WorkflowActivityContext,
  input: CreatePRInput
): Promise<CreatePROutput> => {
  const { sessionId, plan, targetRepo } = input;

  console.log(`[CreatePR] Creating PR for session ${sessionId}`);

  // Get sandbox app ID
  const sandboxAppId = await getSandboxAppId(sessionId);
  if (!sandboxAppId) {
    console.error(`[CreatePR] No sandbox available for session ${sessionId}`);
    throw new Error("No sandbox environment available for PR creation");
  }

  const workdir = `/home/gem/${targetRepo.repo}`;

  // Generate branch name
  const shortSessionId = sessionId.substring(0, 8);
  const branchName = `ralph/${shortSessionId}`;

  try {
    // 1. Create and checkout new branch
    console.log(`[CreatePR] Creating branch: ${branchName}`);
    const branchResult = await executeShell(
      sandboxAppId,
      `git checkout -b ${branchName}`,
      workdir
    );

    if (!branchResult.success) {
      // Branch might already exist, try to checkout
      await executeShell(sandboxAppId, `git checkout ${branchName}`, workdir);
    }

    // 2. Stage all changes
    console.log("[CreatePR] Staging changes");
    await executeShell(sandboxAppId, "git add -A", workdir);

    // 3. Check if there are changes to commit
    const statusResult = await executeShell(
      sandboxAppId,
      "git status --porcelain",
      workdir
    );

    if (!statusResult.stdout.trim()) {
      console.log("[CreatePR] No changes to commit");
      throw new Error("No changes to commit. The plan may not have modified any files.");
    }

    // 4. Generate PR description
    console.log("[CreatePR] Generating PR description");
    const prDescription = await generatePRDescription(plan, sessionId);

    // 5. Commit changes
    console.log("[CreatePR] Committing changes");
    const commitMessage = `${plan.title}\n\n${plan.objective}\n\nGenerated by Ralph Loop`;
    const commitResult = await executeShell(
      sandboxAppId,
      `git commit -m "${commitMessage.replace(/"/g, '\\"')}"`,
      workdir
    );

    if (!commitResult.success) {
      console.error("[CreatePR] Failed to commit:", commitResult.stderr);
      throw new Error(`Failed to commit changes: ${commitResult.stderr}`);
    }

    // 6. Push branch
    console.log("[CreatePR] Pushing branch");
    const pushResult = await executeShell(
      sandboxAppId,
      `git push -u origin ${branchName}`,
      workdir
    );

    if (!pushResult.success) {
      console.error("[CreatePR] Failed to push:", pushResult.stderr);
      throw new Error(`Failed to push branch: ${pushResult.stderr}`);
    }

    // 7. Create PR using GitHub CLI
    console.log("[CreatePR] Creating PR via gh CLI");
    const prTitle = plan.title;
    const prBody = prDescription.replace(/"/g, '\\"');

    const prResult = await executeShell(
      sandboxAppId,
      `gh pr create --title "${prTitle}" --body "${prBody}" --base ${targetRepo.branch}`,
      workdir
    );

    if (!prResult.success) {
      console.error("[CreatePR] Failed to create PR:", prResult.stderr);
      throw new Error(`Failed to create PR: ${prResult.stderr}`);
    }

    // Parse PR URL from output
    const prUrl = prResult.stdout.trim();
    const prNumberMatch = prUrl.match(/\/pull\/(\d+)/);
    const prNumber = prNumberMatch ? parseInt(prNumberMatch[1], 10) : 0;

    console.log(`[CreatePR] PR created: ${prUrl}`);

    return {
      number: prNumber,
      url: prUrl,
      status: "open",
      branch: branchName,
    };
  } catch (error) {
    console.error(`[CreatePR] Error creating PR:`, error);
    throw error;
  }
};
