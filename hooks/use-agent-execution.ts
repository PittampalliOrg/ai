"use client";

/**
 * @deprecated This hook is deprecated. Use useWorkflowExecution from WorkflowExecutionProvider instead.
 * This file is kept for backward compatibility with legacy AgentChat components.
 * See: contexts/workflow-execution-context.tsx and hooks/use-workflow-stream.ts
 */

import { useState, useCallback, useMemo, useRef } from "react";
import type { UIMessage } from "ai";

export type TabType = "diff" | "logs";

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
  setupLogs?: string; // Pod initialization logs for "init" phase
}

export interface ExecutionState {
  isExecuting: boolean;
  startTime: Date | null;
  endTime: Date | null;
  status: "idle" | "running" | "completed" | "error";
  taskPrompt: string | null;
  summary: string[];
  fileChanges: Map<string, FileChange>;
  logs: LogEntry[];
  selectedTab: TabType;
  selectedFile: string | null;
}

export interface SetupEvent {
  phase: "provisioning" | "cloning" | "ready" | "init";
  status: "running" | "success" | "error";
  message: string;
  namespace?: string;
  branch?: string;
  logs?: string; // Pod initialization logs
}

export interface UseAgentExecutionReturn extends ExecutionState {
  setSelectedTab: (tab: TabType) => void;
  setSelectedFile: (path: string | null) => void;
  processMessages: (messages: UIMessage[]) => void;
  addSetupLog: (event: SetupEvent) => void;
  markSetupComplete: () => void;
  getExecutionTime: () => string;
  getFileChangeStats: () => { additions: number; deletions: number };
  // Stable array for components that need to iterate
  fileChangeArray: FileChange[];
}

// Helper to compare file changes maps for equality
function areFileChangesEqual(a: Map<string, FileChange>, b: Map<string, FileChange>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, valueA] of a) {
    const valueB = b.get(key);
    if (!valueB) return false;
    if (valueA.additions !== valueB.additions ||
        valueA.deletions !== valueB.deletions ||
        valueA.isNew !== valueB.isNew ||
        valueA.oldContent !== valueB.oldContent ||
        valueA.newContent !== valueB.newContent) {
      return false;
    }
  }
  return true;
}

// Helper to compare log arrays for equality (by id and status)
function areLogsEqual(a: LogEntry[], b: LogEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].status !== b[i].status || a[i].output !== b[i].output) {
      return false;
    }
  }
  return true;
}

export function useAgentExecution(): UseAgentExecutionReturn {
  const [selectedTab, setSelectedTab] = useState<TabType>("logs");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [executionState, setExecutionState] = useState<Omit<ExecutionState, "selectedTab" | "selectedFile">>({
    isExecuting: false,
    startTime: null,
    endTime: null,
    status: "idle",
    taskPrompt: null,
    summary: [],
    fileChanges: new Map(),
    logs: [],
  });

  // Ref to store setup logs separately - these persist across processMessages calls
  const setupLogsRef = useRef<LogEntry[]>([]);

  // Ref to track last processed message count to avoid redundant processing
  const lastProcessedMessageCount = useRef(0);

  // Ref to track if we should switch to diff tab (set once, not on every render)
  const shouldSwitchToDiff = useRef(false);

  const processMessages = useCallback((messages: UIMessage[]) => {
    // Debug: Log all message parts to see what we're receiving
    console.log("[processMessages] Messages:", messages.map(m => ({
      role: m.role,
      parts: (m.parts || []).map((p: Record<string, unknown>) => ({ type: p.type, hasText: !!p.text }))
    })));

    const newFileChanges = new Map<string, FileChange>();
    // Start with setup logs from ref - these persist across processMessages calls
    const newLogs: LogEntry[] = [...setupLogsRef.current];
    let taskPrompt: string | null = null;
    // If we have ANY setup logs, execution has started (sandbox is being used)
    const hasSetupLogs = setupLogsRef.current.length > 0;
    let isExecuting = hasSetupLogs;
    let hasCompletedExecution = false;
    const summary: string[] = [];
    let startTime: Date | null = hasSetupLogs ? new Date() : null;

    // Helper to get timestamp from message (fallback to current time)
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

          // Handle both 'text' and 'reasoning' part types from AI SDK
          if ((part.type === "text" || part.type === "reasoning") && part.text) {
            // Add reasoning/text to logs
            newLogs.push({
              id: `reasoning-${partId}`,
              type: "reasoning",
              content: part.text,
              timestamp: getTimestamp(),
            });

            // Try to extract summary bullets from final text
            const bullets = extractBullets(part.text);
            if (bullets.length > 0 && msgIndex === messages.length - 1) {
              summary.push(...bullets);
            }
          }

          // Handle tool-invocation type (standard format)
          if (part.type === "tool-invocation") {
            if (!startTime) {
              startTime = getTimestamp();
            }

            const isRunning = part.state === "call" || part.state === "partial-call";
            const isComplete = part.state === "result";

            if (isRunning) {
              isExecuting = true;
            }
            if (isComplete) {
              hasCompletedExecution = true;
            }

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

          // Handle tool-* types from AI SDK streaming (e.g., tool-shell, tool-grep)
          if (part.type.startsWith("tool-") && part.type !== "tool-invocation" && part.type !== "tool-result") {
            if (!startTime) {
              startTime = getTimestamp();
            }

            // Mark as executing when we see tool parts with output
            const toolState = (part as { state?: string }).state;
            if (toolState === "output-available") {
              hasCompletedExecution = true;
            } else {
              isExecuting = true;
            }

            const toolType = part.type.replace("tool-", "");

            if (toolType === "shell") {
              // Extract command from the tool part - AI SDK format has input.command as array
              const toolPart = part as {
                type: string;
                state?: string;
                input?: { command?: string | string[]; workdir?: string };
                output?: { result?: string; status?: string; exitCode?: number; workdir?: string };
              };

              const cmdArray = toolPart.input?.command;
              const command = Array.isArray(cmdArray) ? cmdArray.join(" ") : String(cmdArray || "");
              // Get workdir from output (preferred) or input
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
                  // text-editor.ts uses these property names
                  old_str?: string;
                  new_str?: string;
                  file_text?: string;
                };
                output?: { result?: string; status?: string; content?: string; path?: string };
              };

              const editCmd = toolPart.input?.command || toolType;
              const result = toolPart.output?.result || toolPart.output?.content;
              const outputStatus = toolPart.output?.status;

              // Skip "view" commands - they are read-only and shouldn't appear in diff
              // Only track write operations: str_replace, create, insert
              const isWriteOperation = editCmd !== "view";

              // Try multiple possible property names for file path
              let filePath = toolPart.input?.path
                || toolPart.input?.file_path
                || toolPart.input?.file
                || toolPart.input?.filename
                || toolPart.output?.path
                || "";

              // Fallback: try to extract file path from result message
              if (!filePath && result) {
                const fileMatch = result.match(/file\s+([^\s]+\.[a-zA-Z0-9]+)/i);
                if (fileMatch) {
                  filePath = fileMatch[1];
                }
              }

              // Track file changes for diff view - ONLY for write operations
              // Check for actual property names used by text-editor.ts (old_str, new_str, file_text)
              const oldContent = toolPart.input?.old_str || toolPart.input?.old_string || null;
              const newContent = toolPart.input?.new_str || toolPart.input?.file_text || toolPart.input?.new_string || toolPart.input?.content || toolPart.input?.text || null;

              if (filePath) {
                // Always log file operations for the logs view
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

                // Only track file changes in diff view for WRITE operations (not view/read)
                if (isWriteOperation && (newContent || oldContent)) {
                  const existing = newFileChanges.get(filePath);
                  const finalOldContent = oldContent || existing?.oldContent || null;
                  const finalNewContent = newContent || existing?.newContent || null;

                  // Check if result contains "created" to determine if it's a new file
                  const isNewFile = result?.toLowerCase().includes("created") || !finalOldContent;

                  const additions = finalNewContent ? countLines(finalNewContent) : (existing?.additions || 1);
                  const deletions = finalOldContent && finalNewContent
                    ? Math.max(0, countLines(finalOldContent) - countLines(finalNewContent))
                    : (existing?.deletions || 0);

                  newFileChanges.set(filePath, {
                    path: filePath,
                    oldContent: finalOldContent,
                    newContent: finalNewContent,
                    additions: Math.max(1, additions), // At least 1 addition if file was touched
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

            // Update last log entry with result
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

            // Track file changes for str_replace_based_edit_tool
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
    let status: ExecutionState["status"] = "idle";
    if (isExecuting) {
      status = "running";
    } else if (hasCompletedExecution) {
      status = newLogs.some((l) => l.status === "error") ? "error" : "completed";
    }

    // Only update state if something actually changed
    setExecutionState((prev) => {
      // Check if anything changed to avoid unnecessary re-renders
      const fileChangesChanged = !areFileChangesEqual(prev.fileChanges, newFileChanges);
      const logsChanged = !areLogsEqual(prev.logs, newLogs);
      const statusChanged = prev.status !== status;
      const isExecutingChanged = prev.isExecuting !== isExecuting;
      const taskPromptChanged = prev.taskPrompt !== taskPrompt;
      const summaryChanged = JSON.stringify(prev.summary) !== JSON.stringify(summary);

      // If nothing changed, return the same reference to prevent re-render
      if (!fileChangesChanged && !logsChanged && !statusChanged &&
          !isExecutingChanged && !taskPromptChanged && !summaryChanged) {
        return prev;
      }

      // Auto-switch to diff tab when files are modified (only once)
      if (fileChangesChanged && newFileChanges.size > 0 && status === "completed" && !shouldSwitchToDiff.current) {
        shouldSwitchToDiff.current = true;
        // Use setTimeout to avoid state update during render
        setTimeout(() => setSelectedTab("diff"), 0);
      }

      return {
        isExecuting,
        startTime: startTime || prev.startTime,
        endTime: status === "completed" || status === "error" ? (prev.endTime || new Date()) : null,
        status,
        taskPrompt,
        summary,
        fileChanges: fileChangesChanged ? newFileChanges : prev.fileChanges,
        logs: logsChanged ? newLogs : prev.logs,
      };
    });
  }, []);

  // Memoize fileChangeArray to prevent recreation on every render
  const fileChangeArray = useMemo(() => {
    return Array.from(executionState.fileChanges.values());
  }, [executionState.fileChanges]);

  // Memoize file change stats to prevent new object creation
  const fileChangeStats = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    fileChangeArray.forEach((change) => {
      additions += change.additions;
      deletions += change.deletions;
    });
    return { additions, deletions };
  }, [fileChangeArray]);

  // Memoize execution time string
  const executionTimeString = useMemo(() => {
    const { startTime, endTime, isExecuting } = executionState;
    if (!startTime) return "";

    const end = endTime || (isExecuting ? new Date() : startTime);
    const diffMs = end.getTime() - startTime.getTime();
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  }, [executionState.startTime, executionState.endTime, executionState.isExecuting]);

  // Keep callbacks for backward compatibility but they now return memoized values
  const getExecutionTime = useCallback(() => {
    return executionTimeString;
  }, [executionTimeString]);

  const getFileChangeStats = useCallback(() => {
    return fileChangeStats;
  }, [fileChangeStats]);

  const addSetupLog = useCallback((event: SetupEvent) => {
    const newLog: LogEntry = {
      id: `setup-${event.phase}-${Date.now()}`,
      type: "setup",
      content: event.message,
      timestamp: new Date(),
      status: event.status,
      setupPhase: event.phase,
      setupLogs: event.logs, // Pod initialization logs for "init" phase
    };

    // Store in ref so it persists across processMessages calls
    setupLogsRef.current = [...setupLogsRef.current, newLog];

    setExecutionState((prev) => ({
      ...prev,
      logs: [...prev.logs, newLog],
      // ANY setup event means execution has started - trigger split view
      // Setup events indicate sandbox is being provisioned/used
      isExecuting: true,
      status: prev.status === "idle" ? "running" as const : prev.status,
      startTime: prev.startTime || new Date(),
    }));
  }, []);

  const markSetupComplete = useCallback(() => {
    const dividerLog: LogEntry = {
      id: `setup-divider-${Date.now()}`,
      type: "setup-divider",
      content: "",
      timestamp: new Date(),
    };

    // Store in ref so it persists across processMessages calls
    setupLogsRef.current = [...setupLogsRef.current, dividerLog];

    setExecutionState((prev) => ({
      ...prev,
      logs: [...prev.logs, dividerLog],
    }));
  }, []);

  return {
    ...executionState,
    selectedTab,
    selectedFile,
    setSelectedTab,
    setSelectedFile,
    processMessages,
    addSetupLog,
    markSetupComplete,
    getExecutionTime,
    getFileChangeStats,
    // Stable memoized array for components that need to iterate
    fileChangeArray,
  };
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

  return bullets.slice(0, 5); // Max 5 bullets for summary
}

function countLines(str: string | null): number {
  if (!str) return 0;
  return str.split("\n").length;
}
