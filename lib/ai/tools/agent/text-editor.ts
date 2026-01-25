import { tool } from "ai";
import { z } from "zod";
import { join, dirname } from "path";
import { promises as fs } from "fs";
import type { SandboxContext } from "@/lib/sandbox/types";
import {
  readFileInSandbox,
  writeFileInSandbox,
  pathExistsInSandbox,
  isDirectoryInSandbox,
  listDirectoryInSandbox,
  mkdirInSandbox,
} from "@/lib/sandbox/sandbox-executor";

/**
 * Options for creating a text editor tool
 */
export interface TextEditorToolOptions {
  /** Repository path (local mode) or workspace path (sandbox mode) */
  repoPath: string;
  /** Optional sandbox context for K8s execution */
  sandboxContext?: SandboxContext;
}

/**
 * Create a text editor tool for viewing and modifying files
 * Supports both local execution and Kubernetes sandbox execution
 */
export function createTextEditorTool(options: string | TextEditorToolOptions) {
  // Support both string (legacy) and options object
  const { repoPath, sandboxContext } =
    typeof options === "string" ? { repoPath: options, sandboxContext: undefined } : options;

  const effectivePath = sandboxContext?.repoPath || repoPath;
  const isK8sMode = sandboxContext?.mode === "k8s";
  return tool({
    description:
      "A text editor tool that can view, create, and edit files. " +
      `The working directory is \`${effectivePath}\`. ` +
      "Supports commands: view (read file/directory), str_replace (replace text), " +
      "create (new file), insert (add text at line).",
    inputSchema: z.object({
      command: z
        .enum(["view", "str_replace", "create", "insert"])
        .describe("The command to execute: view, str_replace, create, or insert"),
      path: z
        .string()
        .describe(
          "The path to the file or directory. Can be absolute or relative to the repo root."
        ),
      view_range: z
        .tuple([z.number(), z.number()])
        .optional()
        .describe(
          "Optional [start, end] line numbers to view (1-indexed). " +
            "Use -1 for end to read to end of file. Only applies to view command."
        ),
      old_str: z
        .string()
        .optional()
        .describe(
          "The text to replace (must match exactly, including whitespace). " +
            "Required for str_replace command."
        ),
      new_str: z
        .string()
        .optional()
        .describe(
          "The new text to insert. Required for str_replace and insert commands."
        ),
      file_text: z
        .string()
        .optional()
        .describe("The content for a new file. Required for create command."),
      insert_line: z
        .number()
        .optional()
        .describe(
          "Line number after which to insert text (0 for beginning). " +
            "Required for insert command."
        ),
    }),
    execute: async (input) => {
      try {
        const { command, path, view_range, old_str, new_str, file_text, insert_line } =
          input;

        // Resolve the file path
        const filePath = path.startsWith("/") ? path : join(effectivePath, path);

        switch (command) {
          case "view": {
            // Check if it's a directory
            const isDir = isK8sMode && sandboxContext
              ? await isDirectoryInSandbox(filePath, sandboxContext)
              : (await fs.stat(filePath)).isDirectory();

            if (isDir) {
              // List directory contents
              if (isK8sMode && sandboxContext) {
                const entries = await listDirectoryInSandbox(filePath, sandboxContext);
                const listing = entries
                  .map((entry) => `[${entry.type}] ${entry.name}`)
                  .join("\n");
                return {
                  result: `Directory: ${path}\n\n${listing}`,
                  status: "success" as const,
                };
              }
              const entries = await fs.readdir(filePath, { withFileTypes: true });
              const listing = entries
                .map((entry) => {
                  const type = entry.isDirectory() ? "dir" : "file";
                  return `[${type}] ${entry.name}`;
                })
                .join("\n");
              return {
                result: `Directory: ${path}\n\n${listing}`,
                status: "success" as const,
              };
            }

            // Read file content
            const content = isK8sMode && sandboxContext
              ? await readFileInSandbox(filePath, sandboxContext)
              : await fs.readFile(filePath, "utf-8");
            const lines = content.split("\n");

            if (view_range) {
              const [start, end] = view_range;
              const startIdx = Math.max(0, start - 1);
              const endIdx = end === -1 ? lines.length : Math.min(lines.length, end);
              const selectedLines = lines.slice(startIdx, endIdx);
              const numberedLines = selectedLines
                .map((line, i) => `${startIdx + i + 1}: ${line}`)
                .join("\n");
              return {
                result: numberedLines,
                status: "success" as const,
              };
            }

            // Return full file with line numbers
            const numberedLines = lines
              .map((line, i) => `${i + 1}: ${line}`)
              .join("\n");
            return {
              result: numberedLines,
              status: "success" as const,
            };
          }

          case "str_replace": {
            if (old_str === undefined || new_str === undefined) {
              return {
                result:
                  "str_replace requires both old_str and new_str parameters",
                status: "error" as const,
              };
            }

            const content = isK8sMode && sandboxContext
              ? await readFileInSandbox(filePath, sandboxContext)
              : await fs.readFile(filePath, "utf-8");

            if (!content.includes(old_str)) {
              return {
                result: `Error: old_str not found in file. Make sure the text matches exactly, including whitespace and indentation.`,
                status: "error" as const,
              };
            }

            // Count occurrences
            const occurrences = content.split(old_str).length - 1;
            if (occurrences > 1) {
              return {
                result: `Error: old_str found ${occurrences} times. It must be unique. Add more context to make it unique.`,
                status: "error" as const,
              };
            }

            const newContent = content.replace(old_str, new_str);
            if (isK8sMode && sandboxContext) {
              await writeFileInSandbox(filePath, newContent, sandboxContext);
            } else {
              await fs.writeFile(filePath, newContent, "utf-8");
            }

            return {
              result: `Successfully replaced text in ${path}`,
              status: "success" as const,
            };
          }

          case "create": {
            if (file_text === undefined) {
              return {
                result: "create command requires file_text parameter",
                status: "error" as const,
              };
            }

            // Ensure parent directory exists
            if (isK8sMode && sandboxContext) {
              await mkdirInSandbox(dirname(filePath), sandboxContext);
              await writeFileInSandbox(filePath, file_text, sandboxContext);
            } else {
              await fs.mkdir(dirname(filePath), { recursive: true });
              await fs.writeFile(filePath, file_text, "utf-8");
            }

            return {
              result: `Successfully created file ${path}`,
              status: "success" as const,
            };
          }

          case "insert": {
            if (insert_line === undefined || new_str === undefined) {
              return {
                result: "insert command requires insert_line and new_str parameters",
                status: "error" as const,
              };
            }

            const content = isK8sMode && sandboxContext
              ? await readFileInSandbox(filePath, sandboxContext)
              : await fs.readFile(filePath, "utf-8");
            const lines = content.split("\n");

            if (insert_line < 0 || insert_line > lines.length) {
              return {
                result: `Error: insert_line ${insert_line} is out of range (0-${lines.length})`,
                status: "error" as const,
              };
            }

            // Insert the new lines
            const newLines = new_str.split("\n");
            lines.splice(insert_line, 0, ...newLines);
            const newContent = lines.join("\n");

            if (isK8sMode && sandboxContext) {
              await writeFileInSandbox(filePath, newContent, sandboxContext);
            } else {
              await fs.writeFile(filePath, newContent, "utf-8");
            }

            return {
              result: `Successfully inserted ${newLines.length} line(s) at position ${insert_line} in ${path}`,
              status: "success" as const,
            };
          }

          default:
            return {
              result: `Unknown command: ${command}`,
              status: "error" as const,
            };
        }
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          result: `Error: ${errorMessage}`,
          status: "error" as const,
        };
      }
    },
  });
}
