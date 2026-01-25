import { tool } from "ai";
import { z } from "zod";
import { executeCommand } from "@/lib/agent/shell-executor";
import type { SandboxContext } from "@/lib/sandbox/types";
import { executeInSandbox } from "@/lib/sandbox/sandbox-executor";

const DEFAULT_TIMEOUT = 60;

/**
 * Options for creating a grep tool
 */
export interface GrepToolOptions {
  /** Repository path (local mode) or workspace path (sandbox mode) */
  repoPath: string;
  /** Optional sandbox context for K8s execution */
  sandboxContext?: SandboxContext;
}

/**
 * Escape a shell argument for safe use in commands
 */
function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/**
 * Format a grep command from options
 * Uses ripgrep (rg) if available, falls back to grep -r
 */
function formatGrepCommand(
  options: {
    query: string;
    match_string?: boolean;
    case_sensitive?: boolean;
    context_lines?: number;
    exclude_files?: string;
    include_files?: string;
    max_results?: number;
    file_types?: string[];
    follow_symlinks?: boolean;
  },
  useGrepFallback = false
): string[] {
  // Use grep -r as fallback when ripgrep is not available (e.g., in sandbox)
  if (useGrepFallback) {
    return formatGrepFallbackCommand(options);
  }

  const args = ["rg"];

  // Required flags for consistent output
  args.push("--color=never", "--line-number", "--heading");

  // Case sensitivity
  if (!options.case_sensitive) {
    args.push("-i");
  }

  // Fixed string vs regex
  if (options.match_string) {
    args.push("--fixed-strings");
  }

  // Context lines
  if (options.context_lines && options.context_lines > 0) {
    args.push("-C", String(options.context_lines));
  }

  // File globs
  if (options.include_files) {
    args.push("--glob", escapeShellArg(options.include_files));
  }

  if (options.exclude_files) {
    args.push("--glob", escapeShellArg(`!${options.exclude_files}`));
  }

  // File types
  if (options.file_types && options.file_types.length > 0) {
    for (const ext of options.file_types) {
      const normalizedExt = ext.startsWith(".") ? ext : `.${ext}`;
      args.push("--glob", escapeShellArg(`**/*${normalizedExt}`));
    }
  }

  // Follow symlinks
  if (options.follow_symlinks) {
    args.push("-L");
  }

  // Max results
  if (options.max_results && options.max_results > 0) {
    args.push("--max-count", String(options.max_results));
  }

  // The query
  if (options.query) {
    args.push(escapeShellArg(options.query));
  }

  return args;
}

/**
 * Format a grep fallback command using standard grep -r
 * Used when ripgrep is not available (e.g., in sandbox environments)
 */
function formatGrepFallbackCommand(options: {
  query: string;
  match_string?: boolean;
  case_sensitive?: boolean;
  context_lines?: number;
  exclude_files?: string;
  include_files?: string;
  max_results?: number;
  file_types?: string[];
  follow_symlinks?: boolean;
}): string[] {
  const args = ["grep", "-r", "-n"]; // recursive, line numbers

  // Always exclude .git directory
  args.push("--exclude-dir=.git");

  // Case sensitivity
  if (!options.case_sensitive) {
    args.push("-i");
  }

  // Fixed string vs regex
  if (options.match_string) {
    args.push("-F");
  } else {
    args.push("-E"); // Extended regex
  }

  // Context lines
  if (options.context_lines && options.context_lines > 0) {
    args.push("-C", String(options.context_lines));
  }

  // Exclude patterns (grep uses --exclude and --exclude-dir)
  if (options.exclude_files) {
    args.push("--exclude=" + options.exclude_files);
  }

  // Include patterns (grep uses --include)
  if (options.include_files) {
    args.push("--include=" + options.include_files);
  }

  // File types (convert to include patterns)
  if (options.file_types && options.file_types.length > 0) {
    for (const ext of options.file_types) {
      const normalizedExt = ext.startsWith(".") ? ext : `.${ext}`;
      args.push("--include=*" + normalizedExt);
    }
  }

  // Follow symlinks
  if (options.follow_symlinks) {
    // grep -r follows symlinks by default, use -L to dereference
  }

  // The query
  if (options.query) {
    args.push(escapeShellArg(options.query));
  }

  // Search path (current dir)
  args.push(".");

  // Max results via head (appended separately)
  // Note: grep doesn't have built-in max-count per file like rg

  return args;
}

/**
 * Create a grep tool for searching code in a repository
 * Supports both local execution and Kubernetes sandbox execution
 */
export function createGrepTool(options: string | GrepToolOptions) {
  // Support both string (legacy) and options object
  const { repoPath, sandboxContext } =
    typeof options === "string" ? { repoPath: options, sandboxContext: undefined } : options;

  const effectivePath = sandboxContext?.repoPath || repoPath;

  return tool({
    description:
      "Execute a grep (ripgrep) search in the repository. " +
      "Use this to search for content via string matching or regex in the codebase. " +
      `The working directory is \`${effectivePath}\`.`,
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "The string or regex to search for. If passing a plain string, " +
            "set 'match_string' to true. If passing a regex, set 'match_string' to false."
        ),
      match_string: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "If true, treat the query as a fixed string. If false, treat as regex. Default: false."
        ),
      case_sensitive: z
        .boolean()
        .optional()
        .default(false)
        .describe("Whether to make the search case sensitive. Default: false."),
      context_lines: z
        .number()
        .optional()
        .default(0)
        .describe("Number of lines of context to include before/after matches."),
      exclude_files: z
        .string()
        .optional()
        .describe("Glob pattern of files to exclude (e.g., '*.test.ts')"),
      include_files: z
        .string()
        .optional()
        .describe("Glob pattern of files to include (e.g., '*.ts')"),
      max_results: z
        .number()
        .optional()
        .default(50)
        .describe(
          "Maximum number of results to return. Default: 50. Set to 0 for unlimited."
        ),
      file_types: z
        .array(z.string())
        .optional()
        .describe("Restrict to certain file extensions (e.g., ['.js', '.ts'])."),
      follow_symlinks: z
        .boolean()
        .optional()
        .default(false)
        .describe("Whether to follow symlinks. Default: false."),
    }),
    execute: async (input) => {
      try {
        // Try ripgrep first
        let command = formatGrepCommand(input, false);
        let execOptions = {
          command: command.join(" "),
          workdir: effectivePath,
          timeout: DEFAULT_TIMEOUT,
        };

        // Use sandbox executor if context is provided and in k8s mode
        let response = sandboxContext
          ? await executeInSandbox(execOptions, sandboxContext)
          : await executeCommand(execOptions);

        // If rg is not found (exit code 127), fall back to grep
        if (response.exitCode === 127 || response.stderr.includes("not found")) {
          command = formatGrepCommand(input, true); // use grep fallback
          execOptions = {
            command: command.join(" "),
            workdir: effectivePath,
            timeout: DEFAULT_TIMEOUT,
          };

          response = sandboxContext
            ? await executeInSandbox(execOptions, sandboxContext)
            : await executeCommand(execOptions);
        }

        // Exit code 1 means no matches found (not an error)
        if (response.exitCode === 1) {
          return {
            result: "No matches found.",
            status: "success" as const,
          };
        }

        if (response.exitCode > 1) {
          return {
            result: `Grep failed with exit code ${response.exitCode}: ${response.stderr}`,
            status: "error" as const,
          };
        }

        return {
          result: response.stdout || "No matches found.",
          status: "success" as const,
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          result: `Failed to run grep: ${errorMessage}`,
          status: "error" as const,
        };
      }
    },
  });
}
