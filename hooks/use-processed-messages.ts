"use client";

/**
 * @deprecated This hook is deprecated. Use useStreamDerivedState with useWorkflowStream instead.
 * This file is kept for backward compatibility with legacy AgentChat components.
 * See: hooks/use-stream-derived-state.ts and hooks/use-workflow-stream.ts
 */

import { useMemo } from "react";
import type { UIMessage } from "ai";

export interface FileChange {
  path: string;
  oldContent: string | null;
  newContent: string | null;
  additions: number;
  deletions: number;
  isNew: boolean;
}

export interface LogEntry {
  id: string;
  type: "reasoning" | "shell" | "grep" | "file-edit" | "user-message" | "setup" | "setup-divider";
  content: string;
  timestamp: Date;
  toolName?: string;
  command?: string;
  workdir?: string;
  output?: string;
  status?: "running" | "success" | "error";
  exitCode?: number;
  filePath?: string;
  setupPhase?: "provisioning" | "cloning" | "ready" | "init";
  setupLogs?: string;
}

export interface ProcessedMessages {
  taskPrompt: string | null;
  summary: string[];
  fileChanges: Map<string, FileChange>;
  fileChangeArray: FileChange[];
  logs: LogEntry[];
  isExecuting: boolean;
  hasCompletedExecution: boolean;
  status: "idle" | "running" | "completed" | "error";
  fileChangeStats: { additions: number; deletions: number };
}

// Helper functions
function extractBullets(text: string): string[] {
  const lines = text.split("\n");
  const bullets: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.match(/^\d+\.\s/)) {
      bullets.push(trimmed.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, ""));
    }
  }

  return bullets.slice(0, 5);
}

function countLines(str: string | null): number {
  if (!str) return 0;
  return str.split("\n").length;
}

/**
 * Pure computation hook that derives execution state from messages.
 * Uses useMemo to avoid triggering re-renders - all state is computed, not set.
 */
export function useProcessedMessages(
  messages: UIMessage[],
  setupLogs: LogEntry[] = []
): ProcessedMessages {
  return useMemo(() => {
    const newFileChanges = new Map<string, FileChange>();
    const newLogs: LogEntry[] = [...setupLogs];
    let taskPrompt: string | null = null;
    const hasSetupLogs = setupLogs.length > 0;
    let isExecuting = hasSetupLogs;
    let hasCompletedExecution = false;
    const summary: string[] = [];

    const getTimestamp = () => new Date();

    messages.forEach((message, msgIndex) => {
      const parts = (message.parts || []) as Array<{
        type: string;
        text?: string;
        toolName?: string;
        toolCallId?: string;
        args?: Record<string, unknown>;
        result?: unknown;
        state?: string;
      }>;

      // Extract first user message as task prompt
      if (message.role === "user" && !taskPrompt) {
        const textPart = parts.find((p) => p.type === "text");
        if (textPart?.text) {
          taskPrompt = textPart.text;
          newLogs.push({
            id: `user-${msgIndex}`,
            type: "user-message",
            content: textPart.text,
            timestamp: getTimestamp(),
          });
        }
      }

      // Process assistant message parts
      if (message.role === "assistant") {
        parts.forEach((part, partIndex) => {
          const partId = `${msgIndex}-${partIndex}`;

          if ((part.type === "text" || part.type === "reasoning") && part.text) {
            newLogs.push({
              id: `reasoning-${partId}`,
              type: "reasoning",
              content: part.text,
              timestamp: getTimestamp(),
            });

            const bullets = extractBullets(part.text);
            if (bullets.length > 0 && msgIndex === messages.length - 1) {
              summary.push(...bullets);
            }
          }

          if (part.type === "tool-invocation") {
            const isRunning = part.state === "call" || part.state === "partial-call";
            const isComplete = part.state === "result";

            if (isRunning) isExecuting = true;
            if (isComplete) hasCompletedExecution = true;

            if (part.toolName === "shell") {
              const command = part.args?.command;
              const commandStr = Array.isArray(command) ? command.join(" ") : String(command || "");
              newLogs.push({
                id: `shell-${partId}`,
                type: "shell",
                content: commandStr,
                command: commandStr,
                toolName: "shell",
                timestamp: getTimestamp(),
                status: isComplete ? "success" : "running",
              });
            }

            if (part.toolName === "grep") {
              const query = part.args?.query as string;
              const path = part.args?.path as string;
              newLogs.push({
                id: `grep-${partId}`,
                type: "grep",
                content: `grep "${query}" ${path || "."}`,
                command: `grep "${query}" ${path || "."}`,
                toolName: "grep",
                timestamp: getTimestamp(),
                status: isComplete ? "success" : "running",
              });
            }

            if (part.toolName === "str_replace_based_edit_tool") {
              const filePath = part.args?.path as string;
              const command = part.args?.command as string;
              if (filePath) {
                newLogs.push({
                  id: `file-${partId}`,
                  type: "file-edit",
                  content: `${command || "edit"} ${filePath}`,
                  filePath,
                  toolName: "str_replace_based_edit_tool",
                  timestamp: getTimestamp(),
                  status: isComplete ? "success" : "running",
                });
              }
            }
          }

          // Handle tool-* types from AI SDK streaming
          if (part.type.startsWith("tool-") && part.type !== "tool-invocation" && part.type !== "tool-result") {
            const toolState = (part as { state?: string }).state;
            if (toolState === "output-available") {
              hasCompletedExecution = true;
            } else {
              isExecuting = true;
            }

            const toolType = part.type.replace("tool-", "");

            if (toolType === "shell") {
              const toolPart = part as {
                type: string;
                state?: string;
                input?: { command?: string | string[]; workdir?: string };
                output?: { result?: string; status?: string; exitCode?: number; workdir?: string };
              };

              const cmdArray = toolPart.input?.command;
              const command = Array.isArray(cmdArray) ? cmdArray.join(" ") : String(cmdArray || "");
              const workdir = toolPart.output?.workdir || toolPart.input?.workdir;
              const result = toolPart.output?.result;
              const exitCode = toolPart.output?.exitCode;
              const outputStatus = toolPart.output?.status;

              newLogs.push({
                id: `shell-${partId}`,
                type: "shell",
                content: command,
                command: command,
                workdir: workdir,
                output: result,
                toolName: "shell",
                timestamp: getTimestamp(),
                status: outputStatus === "error" || (exitCode !== undefined && exitCode !== 0)
                  ? "error"
                  : result !== undefined ? "success" : "running",
                exitCode,
              });
            }

            if (toolType === "grep") {
              const toolPart = part as {
                type: string;
                state?: string;
                input?: { query?: string; path?: string };
                output?: { result?: string; status?: string };
              };

              const query = toolPart.input?.query || "";
              const path = toolPart.input?.path || ".";
              const result = toolPart.output?.result;
              const outputStatus = toolPart.output?.status;

              newLogs.push({
                id: `grep-${partId}`,
                type: "grep",
                content: `grep "${query}" ${path}`,
                command: `grep "${query}" ${path}`,
                output: result,
                toolName: "grep",
                timestamp: getTimestamp(),
                status: outputStatus === "error" ? "error" : result !== undefined ? "success" : "running",
              });
            }

            if (toolType === "str_replace_based_edit_tool" || toolType === "edit" || toolType === "write" || toolType === "create") {
              const toolPart = part as {
                type: string;
                state?: string;
                input?: {
                  path?: string;
                  command?: string;
                  file_path?: string;
                  file?: string;
                  filename?: string;
                  content?: string;
                  old_string?: string;
                  new_string?: string;
                  text?: string;
                  old_str?: string;
                  new_str?: string;
                  file_text?: string;
                };
                output?: { result?: string; status?: string; content?: string; path?: string };
              };

              const editCmd = toolPart.input?.command || toolType;
              const result = toolPart.output?.result || toolPart.output?.content;
              const outputStatus = toolPart.output?.status;
              const isWriteOperation = editCmd !== "view";

              let filePath = toolPart.input?.path
                || toolPart.input?.file_path
                || toolPart.input?.file
                || toolPart.input?.filename
                || toolPart.output?.path
                || "";

              if (!filePath && result) {
                const fileMatch = result.match(/file\s+([^\s]+\.[a-zA-Z0-9]+)/i);
                if (fileMatch) filePath = fileMatch[1];
              }

              const oldContent = toolPart.input?.old_str || toolPart.input?.old_string || null;
              const newContent = toolPart.input?.new_str || toolPart.input?.file_text || toolPart.input?.new_string || toolPart.input?.content || toolPart.input?.text || null;

              if (filePath) {
                newLogs.push({
                  id: `file-${partId}`,
                  type: "file-edit",
                  content: `${editCmd} ${filePath}`,
                  filePath,
                  output: result,
                  toolName: toolType,
                  timestamp: getTimestamp(),
                  status: outputStatus === "error" ? "error" : result !== undefined ? "success" : "running",
                });

                if (isWriteOperation && (newContent || oldContent)) {
                  const existing = newFileChanges.get(filePath);
                  const finalOldContent = oldContent || existing?.oldContent || null;
                  const finalNewContent = newContent || existing?.newContent || null;
                  const isNewFile = result?.toLowerCase().includes("created") || !finalOldContent;
                  const additions = finalNewContent ? countLines(finalNewContent) : (existing?.additions || 1);
                  const deletions = finalOldContent && finalNewContent
                    ? Math.max(0, countLines(finalOldContent) - countLines(finalNewContent))
                    : (existing?.deletions || 0);

                  newFileChanges.set(filePath, {
                    path: filePath,
                    oldContent: finalOldContent,
                    newContent: finalNewContent,
                    additions: Math.max(1, additions),
                    deletions,
                    isNew: isNewFile,
                  });
                }
              }
            }
          }

          if (part.type === "tool-result") {
            const result = part.result as {
              result?: string;
              status?: string;
              exitCode?: number;
              content?: string;
              old_str?: string;
              new_str?: string;
              path?: string;
            };

            const lastLog = newLogs[newLogs.length - 1];
            if (lastLog) {
              lastLog.output = result?.result || result?.content || JSON.stringify(result);
              lastLog.status = result?.status === "error" || (result?.exitCode && result.exitCode !== 0)
                ? "error"
                : "success";
              if (result?.exitCode !== undefined) {
                lastLog.exitCode = result.exitCode;
              }
            }

            if (result?.path) {
              const existing = newFileChanges.get(result.path);
              const oldContent = result.old_str || existing?.oldContent || null;
              const newContent = result.new_str || existing?.newContent || null;
              const additions = countLines(newContent) - (oldContent ? countLines(oldContent) : 0);
              const deletions = oldContent && newContent
                ? Math.max(0, countLines(oldContent) - countLines(newContent))
                : 0;

              newFileChanges.set(result.path, {
                path: result.path,
                oldContent,
                newContent,
                additions: Math.max(0, additions),
                deletions,
                isNew: !oldContent,
              });
            }
          }
        });
      }
    });

    // Determine final status
    let status: "idle" | "running" | "completed" | "error" = "idle";
    if (isExecuting && !hasCompletedExecution) {
      status = "running";
    } else if (hasCompletedExecution) {
      status = newLogs.some((l) => l.status === "error") ? "error" : "completed";
    } else if (hasSetupLogs) {
      status = "running";
    }

    // Compute file change array and stats
    const fileChangeArray = Array.from(newFileChanges.values());
    let totalAdditions = 0;
    let totalDeletions = 0;
    fileChangeArray.forEach((change) => {
      totalAdditions += change.additions;
      totalDeletions += change.deletions;
    });

    return {
      taskPrompt,
      summary,
      fileChanges: newFileChanges,
      fileChangeArray,
      logs: newLogs,
      isExecuting: isExecuting || hasSetupLogs,
      hasCompletedExecution,
      status,
      fileChangeStats: { additions: totalAdditions, deletions: totalDeletions },
    };
  }, [messages, setupLogs]);
}
