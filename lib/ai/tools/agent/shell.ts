import { tool } from "ai";
import { z } from "zod";
import { executeCommand } from "@/lib/agent/shell-executor";
import type { SandboxContext } from "@/lib/sandbox/types";
import { executeInSandbox } from "@/lib/sandbox/sandbox-executor";

const DEFAULT_TIMEOUT = 120; // 2 minutes

/**
 * Options for creating a shell tool
 */
export interface ShellToolOptions {
  /** Repository path (local mode) or workspace path (sandbox mode) */
  repoPath: string;
  /** Optional sandbox context for K8s execution */
  sandboxContext?: SandboxContext;
}

/**
 * Create a shell tool for executing commands in a repository
 * Supports both local execution and Kubernetes sandbox execution
 */
export function createShellTool(options: string | ShellToolOptions) {
  // Support both string (legacy) and options object
  const { repoPath, sandboxContext } =
    typeof options === "string" ? { repoPath: options, sandboxContext: undefined } : options;

  const effectivePath = sandboxContext?.repoPath || repoPath;

  return tool({
    description:
      "Runs a shell command in the repository and returns its output. " +
      "Use this tool to execute git commands, run tests, build projects, or any other shell operation. " +
      `The working directory is \`${effectivePath}\`.`,
    inputSchema: z.object({
      command: z
        .array(z.string())
        .describe(
          "The command to run as an array of strings. The first element is the command, " +
            "and the rest are arguments. Example: ['git', 'status'] or ['npm', 'test']"
        ),
      workdir: z
        .string()
        .optional()
        .default(effectivePath)
        .describe(
          `The working directory for the command. Defaults to ${effectivePath}. ` +
            "Only specify this if the command must run in a different directory."
        ),
      timeout: z
        .number()
        .optional()
        .default(DEFAULT_TIMEOUT)
        .describe(
          "Maximum time to wait for the command to complete in seconds. " +
            "Increase this for long-running commands like tests. Default: 120 seconds."
        ),
    }),
    execute: async ({ command, workdir, timeout }) => {
      try {
        const execOptions = {
          command: command.join(" "),
          workdir: workdir || effectivePath,
          timeout: timeout ?? DEFAULT_TIMEOUT,
        };

        // Use sandbox executor if context is provided and in k8s mode
        const response = sandboxContext
          ? await executeInSandbox(execOptions, sandboxContext)
          : await executeCommand(execOptions);

        const actualWorkdir = workdir || effectivePath;

        if (response.exitCode !== 0) {
          return {
            result: `Command failed. Exit code: ${response.exitCode}\n${response.stderr || response.stdout}`,
            status: "error" as const,
            exitCode: response.exitCode,
            workdir: actualWorkdir,
          };
        }

        return {
          result: response.stdout || `exit code: ${response.exitCode}`,
          status: "success" as const,
          exitCode: response.exitCode,
          workdir: actualWorkdir,
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          result: `Error executing command: ${errorMessage}`,
          status: "error" as const,
          exitCode: 1,
        };
      }
    },
  });
}
