/**
 * Execute Plan Item Activity
 *
 * Executes a single plan item in the sandbox environment.
 */

import { type WorkflowActivityContext } from "@dapr/dapr";
import { type TActivity } from "../workflow-runtime";
import { generateText, tool, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { type TaskPlan, type TaskPlanItem } from "@/lib/types/ralph-plan";
import { generateExecutorPrompt } from "../prompts";
import {
  invokeSandboxMethod,
  type SandboxShellResponse,
} from "@/lib/sandbox/dapr-client";
import { getAgentSession } from "@/lib/db/agent-queries";

/**
 * Input for the execute plan item activity
 */
export interface ExecutePlanItemInput {
  sessionId: string;
  item: TaskPlanItem;
  plan: TaskPlan;
  targetRepo: {
    owner: string;
    repo: string;
    branch: string;
    installationId?: string;
  };
}

/**
 * Get sandbox app ID for a session
 */
async function getSandboxAppId(sessionId: string): Promise<string | null> {
  const session = await getAgentSession({ id: sessionId });
  if (!session?.sandboxPodName) {
    return null;
  }
  // Dapr app ID format matches pod name convention
  return `sandbox-${sessionId.substring(0, 8)}`;
}

/**
 * Execute a shell command in the sandbox
 */
async function executeShellInSandbox(
  sandboxAppId: string,
  command: string,
  workdir: string
): Promise<{
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const result = await invokeSandboxMethod<SandboxShellResponse>(
    sandboxAppId,
    "v1/shell/exec",
    { command, workdir, timeout: 120 },
    120000
  );

  if (!result.success || !result.data) {
    return {
      success: false,
      stdout: "",
      stderr: result.error || "Unknown error",
      exitCode: 1,
    };
  }

  return {
    success: result.data.exit_code === 0,
    stdout: result.data.output,
    stderr: "", // Sandbox API combines output
    exitCode: result.data.exit_code,
  };
}

/**
 * Read a file from the sandbox
 */
async function readFileInSandbox(
  sandboxAppId: string,
  filePath: string
): Promise<string | null> {
  const result = await executeShellInSandbox(
    sandboxAppId,
    `cat "${filePath}"`,
    "/home/gem"
  );

  if (!result.success) {
    return null;
  }

  return result.stdout;
}

/**
 * Write a file to the sandbox
 */
async function writeFileInSandbox(
  sandboxAppId: string,
  filePath: string,
  content: string
): Promise<boolean> {
  // Use a heredoc to write the file content
  const escapedContent = content.replace(/'/g, "'\"'\"'");
  const result = await executeShellInSandbox(
    sandboxAppId,
    `cat > "${filePath}" << 'RALPH_EOF'\n${escapedContent}\nRALPH_EOF`,
    "/home/gem"
  );

  return result.success;
}

/**
 * Execute Plan Item Activity
 *
 * Executes a single plan item by:
 * 1. Setting up the sandbox context
 * 2. Using an LLM with tools to implement the task
 * 3. Recording the results
 */
export const executePlanItemActivity: TActivity<ExecutePlanItemInput, TaskPlanItem> = async (
  _ctx: WorkflowActivityContext,
  input: ExecutePlanItemInput
): Promise<TaskPlanItem> => {
  const { sessionId, item, targetRepo } = input;
  const startTime = Date.now();

  console.log(`[ExecuteItem] Starting execution of item ${item.id}: ${item.title}`);

  // Mark as in progress
  const executingItem: TaskPlanItem = {
    ...item,
    status: "in_progress",
  };

  try {
    // Get sandbox app ID
    const sandboxAppId = await getSandboxAppId(sessionId);
    if (!sandboxAppId) {
      console.error(`[ExecuteItem] No sandbox available for session ${sessionId}`);
      return {
        ...executingItem,
        status: "failed",
        result: {
          success: false,
          error: "No sandbox environment available. Please start a session with a sandbox first.",
        },
      };
    }

    // Get the working directory
    const workdir = `/home/gem/${targetRepo.repo}`;

    // Generate the executor prompt
    const systemPrompt = generateExecutorPrompt(item, targetRepo);

    // Define tools for the executor
    const shellTool = tool({
      description: "Execute a shell command in the sandbox",
      inputSchema: z.object({
        command: z.string().describe("The shell command to execute"),
      }),
      execute: async ({ command }) => {
        console.log(`[ExecuteItem] Shell: ${command}`);
        const result = await executeShellInSandbox(sandboxAppId, command, workdir);
        return {
          exitCode: result.exitCode,
          stdout: result.stdout.substring(0, 4000), // Truncate long output
          stderr: result.stderr.substring(0, 1000),
        };
      },
    });

    const readFileTool = tool({
      description: "Read the contents of a file",
      inputSchema: z.object({
        path: z.string().describe("The path to the file to read"),
      }),
      execute: async ({ path }) => {
        console.log(`[ExecuteItem] Reading file: ${path}`);
        const content = await readFileInSandbox(sandboxAppId, `${workdir}/${path}`);
        if (content === null) {
          return { error: `File not found: ${path}` };
        }
        return { content: content.substring(0, 8000) }; // Truncate long files
      },
    });

    const writeFileTool = tool({
      description: "Write content to a file",
      inputSchema: z.object({
        path: z.string().describe("The path to the file to write"),
        content: z.string().describe("The content to write to the file"),
      }),
      execute: async ({ path, content }) => {
        console.log(`[ExecuteItem] Writing file: ${path}`);
        const success = await writeFileInSandbox(sandboxAppId, `${workdir}/${path}`, content);
        return { success, path };
      },
    });

    // Execute with LLM
    const result = await generateText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: systemPrompt,
      prompt: `Execute the following task:\n\n**${item.title}**\n\n${item.description}`,
      tools: {
        shell: shellTool,
        read_file: readFileTool,
        write_file: writeFileTool,
      },
      stopWhen: stepCountIs(20), // Limit iterations for safety
      experimental_telemetry: {
        isEnabled: true,
        functionId: "ralph-execute-item",
        metadata: {
          sessionId,
          itemId: item.id,
        },
      },
    });

    const duration = Date.now() - startTime;

    // Extract files modified from tool calls
    const filesModified: string[] = [];
    for (const step of result.steps || []) {
      for (const toolResult of step.toolResults || []) {
        if (toolResult.toolName === "write_file") {
          const output = toolResult.output as { path?: string } | undefined;
          if (output?.path && !filesModified.includes(output.path)) {
            filesModified.push(output.path);
          }
        }
      }
    }

    console.log(
      `[ExecuteItem] Completed item ${item.id} in ${duration}ms, modified ${filesModified.length} files`
    );

    // Return successful result
    return {
      ...executingItem,
      status: "completed",
      result: {
        success: true,
        message: result.text.substring(0, 500),
        filesModified,
        duration,
      },
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[ExecuteItem] Error executing item ${item.id}:`, error);

    return {
      ...executingItem,
      status: "failed",
      result: {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        duration,
      },
    };
  }
};
