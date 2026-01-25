"use client";

/**
 * Stream Derived State Hook
 *
 * Transforms WorkflowStreamEvent[] into UI-ready derived state.
 * Can be used independently of the WorkflowExecutionContext.
 */

import { useMemo } from "react";
import type {
  WorkflowStreamEvent,
  WorkflowStreamEventType,
  AgentId,
} from "@/hooks/use-workflow-stream";

// ============================================================================
// Types
// ============================================================================

/**
 * Log entry derived from workflow stream events
 */
export interface WorkflowLogEntry {
  id: string;
  type: "llm" | "tool_call" | "tool_result" | "progress" | "error" | "user-message";
  content: string;
  timestamp: Date;
  agentId?: AgentId;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: string;
  status?: "running" | "success" | "error";
  progress?: number;
}

/**
 * File change derived from tool_result events
 */
export interface FileChange {
  path: string;
  oldContent: string | null;
  newContent: string | null;
  additions: number;
  deletions: number;
  isNew: boolean;
}

/**
 * Task progress information
 */
export interface TaskProgress {
  current: number;
  total: number;
  currentTaskId?: string;
  currentTaskTitle?: string;
}

/**
 * Execution status derived from stream events
 */
export type ExecutionStatus = "idle" | "running" | "completed" | "error";

/**
 * Return type for the hook
 */
export interface StreamDerivedState {
  logs: WorkflowLogEntry[];
  fileChanges: Map<string, FileChange>;
  fileChangeArray: FileChange[];
  activeAgent: AgentId | null;
  taskProgress: TaskProgress | null;
  executionStatus: ExecutionStatus;
  fileChangeStats: { additions: number; deletions: number };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract file path from various tool input formats
 */
function extractFilePath(toolInput: unknown): string | null {
  if (!toolInput || typeof toolInput !== "object") return null;

  const input = toolInput as Record<string, unknown>;
  return (
    (input.path as string) ||
    (input.file_path as string) ||
    (input.filePath as string) ||
    (input.file as string) ||
    (input.filename as string) ||
    (input.notebook_path as string) ||  // For NotebookEdit tool
    null
  );
}

/**
 * Check if a tool is a write operation (modifies files)
 */
function isWriteOperation(toolName: string, toolInput: unknown): boolean {
  // Normalize to lowercase for comparison
  const normalizedName = toolName.toLowerCase();
  const writeTools = ["write", "edit", "create", "str_replace_based_edit_tool", "notebookedit"];
  if (writeTools.includes(normalizedName)) return true;

  // Check for command-based tools
  if (toolInput && typeof toolInput === "object") {
    const input = toolInput as Record<string, unknown>;
    const command = input.command as string;
    if (command && command !== "view") return true;
  }

  return false;
}

/**
 * Count lines in a string
 */
function countLines(str: string | null): number {
  if (!str) return 0;
  return str.split("\n").length;
}

/**
 * Convert stream events to log entries
 */
export function eventsToLogs(events: WorkflowStreamEvent[]): WorkflowLogEntry[] {
  const logs: WorkflowLogEntry[] = [];
  const llmLogByAgent = new Map<string, WorkflowLogEntry>();

  events.forEach((event) => {
    switch (event.type) {
      case "llm_chunk":
        // For LLM chunks, we update existing entry or create new one per agent
        if (event.data.content) {
          const agentKey = event.agentId || "unknown";
          const existingLog = llmLogByAgent.get(agentKey);

          if (existingLog) {
            // Update content
            existingLog.content += event.data.content;
          } else {
            const newLog: WorkflowLogEntry = {
              id: event.id,
              type: "llm",
              content: event.data.content,
              timestamp: new Date(event.timestamp),
              agentId: event.agentId,
            };
            llmLogByAgent.set(agentKey, newLog);
            logs.push(newLog);
          }
        }
        break;

      case "tool_call":
        logs.push({
          id: event.id,
          type: "tool_call",
          content: formatToolCallContent(event.data.toolName!, event.data.toolInput),
          timestamp: new Date(event.timestamp),
          agentId: event.agentId,
          toolName: event.data.toolName,
          toolInput: event.data.toolInput,
          status: "running",
        });
        break;

      case "tool_result":
        logs.push({
          id: event.id,
          type: "tool_result",
          content: truncateOutput(event.data.toolOutput || "Completed", 500),
          timestamp: new Date(event.timestamp),
          agentId: event.agentId,
          toolName: event.data.toolName,
          toolOutput: event.data.toolOutput,
          status: event.data.error ? "error" : "success",
        });
        break;

      case "task_progress":
        logs.push({
          id: event.id,
          type: "progress",
          content: event.data.status || "Progress update",
          timestamp: new Date(event.timestamp),
          progress: event.data.progress,
        });
        break;

      case "task_completed":
        logs.push({
          id: event.id,
          type: "progress",
          content: event.data.status || "Task completed",
          timestamp: new Date(event.timestamp),
          status: "success",
        });
        // Clear LLM logs for next task
        llmLogByAgent.clear();
        break;

      case "error":
        logs.push({
          id: event.id,
          type: "error",
          content: event.data.error || "Unknown error",
          timestamp: new Date(event.timestamp),
          status: "error",
        });
        break;
    }
  });

  return logs;
}

/**
 * Format tool call content for display
 */
function formatToolCallContent(toolName: string, toolInput: unknown): string {
  if (!toolInput) return `Running: ${toolName}`;

  const input = toolInput as Record<string, unknown>;

  switch (toolName) {
    case "shell":
      const cmd = input.command;
      const cmdStr = Array.isArray(cmd) ? cmd.join(" ") : String(cmd || "");
      return cmdStr;

    case "grep":
      return `grep "${input.query || ""}" ${input.path || "."}`;

    case "str_replace_based_edit_tool":
    case "edit":
    case "write":
    case "create":
      const filePath = extractFilePath(toolInput);
      const operation = (input.command as string) || toolName;
      return `${operation} ${filePath || "file"}`;

    default:
      return `${toolName}`;
  }
}

/**
 * Truncate output string
 */
function truncateOutput(output: string, maxLength = 2000): string {
  if (output.length <= maxLength) return output;
  return output.slice(0, maxLength) + "\n... (truncated)";
}

/**
 * Extract file changes from tool_call events (not tool_result, since tool_result doesn't contain toolInput)
 */
export function eventsToFileChanges(events: WorkflowStreamEvent[]): Map<string, FileChange> {
  const fileChanges = new Map<string, FileChange>();
  const pendingToolCalls = new Map<string, { toolName: string; toolInput: unknown; eventId: string }>();

  events.forEach((event) => {
    // Process tool_call events to capture file write operations
    if (event.type === "tool_call") {
      const { toolName, toolInput } = event.data;
      if (!toolName) return;

      // Track all tool calls for potential matching with results
      pendingToolCalls.set(event.id, { toolName, toolInput, eventId: event.id });

      // Only process write operations
      if (!isWriteOperation(toolName, toolInput)) return;

      const filePath = extractFilePath(toolInput);
      if (!filePath) return;

      // Extract content from toolInput
      const input = (toolInput as Record<string, unknown>) || {};
      const oldContent = (input.old_str as string) || (input.old_string as string) || null;
      const newContent =
        (input.new_str as string) ||
        (input.new_string as string) ||
        (input.file_text as string) ||
        (input.content as string) ||
        (input.text as string) ||
        null;

      const existing = fileChanges.get(filePath);
      const finalOldContent = oldContent || existing?.oldContent || null;
      const finalNewContent = newContent || existing?.newContent || null;

      // Default to new file if no old content
      const isNewFile = !finalOldContent;
      const additions = finalNewContent ? countLines(finalNewContent) : (existing?.additions || 1);
      const deletions =
        finalOldContent && finalNewContent
          ? Math.max(0, countLines(finalOldContent) - countLines(finalNewContent))
          : existing?.deletions || 0;

      fileChanges.set(filePath, {
        path: filePath,
        oldContent: finalOldContent,
        newContent: finalNewContent,
        additions: Math.max(1, additions),
        deletions,
        isNew: isNewFile,
      });
    }

    // Also check tool_result for "created" messages to update isNew flag
    if (event.type === "tool_result") {
      const { toolOutput } = event.data;
      if (toolOutput?.toLowerCase().includes("created")) {
        // Try to extract file path from the output message
        const match = toolOutput.match(/(?:at|to):\s*(\S+)/i);
        if (match) {
          const filePath = match[1];
          const existing = fileChanges.get(filePath);
          if (existing) {
            fileChanges.set(filePath, { ...existing, isNew: true });
          }
        }
      }
    }
  });

  return fileChanges;
}

/**
 * Get the currently active agent from events
 */
export function getActiveAgent(events: WorkflowStreamEvent[]): AgentId | null {
  // Find the most recent event with an agentId
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].agentId) {
      return events[i].agentId!;
    }
  }
  return null;
}

/**
 * Get task progress from events
 */
export function getTaskProgress(events: WorkflowStreamEvent[]): TaskProgress | null {
  // Find the most recent task_progress or task_completed event
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.type === "task_progress" || event.type === "task_completed") {
      const metadata = event.data.metadata as Record<string, unknown> | undefined;
      return {
        current: (metadata?.currentTask as number) ?? 0,
        total: (metadata?.totalTasks as number) ?? 0,
        currentTaskId: event.taskId,
        currentTaskTitle: metadata?.taskTitle as string,
      };
    }
  }
  return null;
}

/**
 * Derive execution status from events
 */
export function deriveExecutionStatus(events: WorkflowStreamEvent[]): ExecutionStatus {
  if (events.length === 0) return "idle";

  const hasError = events.some((e) => e.type === "error");
  if (hasError) return "error";

  const lastEvent = events[events.length - 1];
  if (lastEvent.type === "task_completed") {
    const metadata = lastEvent.data.metadata as Record<string, unknown> | undefined;
    const isWorkflowComplete = metadata?.workflowComplete as boolean;
    if (isWorkflowComplete) return "completed";
  }

  // Check for running tool calls
  const toolCalls = events.filter((e) => e.type === "tool_call");
  const toolResults = events.filter((e) => e.type === "tool_result");
  if (toolCalls.length > toolResults.length) return "running";

  // Check for recent LLM activity
  const recentEvents = events.slice(-10);
  const hasRecentLLM = recentEvents.some((e) => e.type === "llm_chunk");
  if (hasRecentLLM) return "running";

  return events.length > 0 ? "running" : "idle";
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to derive UI-ready state from workflow stream events
 *
 * @param events - Array of workflow stream events
 * @returns Derived state for UI rendering
 */
export function useStreamDerivedState(events: WorkflowStreamEvent[]): StreamDerivedState {
  // Derive logs from events
  const logs = useMemo(() => eventsToLogs(events), [events]);

  // Derive file changes from events
  const fileChanges = useMemo(() => eventsToFileChanges(events), [events]);

  // Stable array of file changes for iteration
  const fileChangeArray = useMemo(
    () => Array.from(fileChanges.values()),
    [fileChanges]
  );

  // Compute file change stats
  const fileChangeStats = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    fileChangeArray.forEach((change) => {
      additions += change.additions;
      deletions += change.deletions;
    });
    return { additions, deletions };
  }, [fileChangeArray]);

  // Get active agent
  const activeAgent = useMemo(() => getActiveAgent(events), [events]);

  // Get task progress
  const taskProgress = useMemo(() => getTaskProgress(events), [events]);

  // Derive execution status
  const executionStatus = useMemo(() => deriveExecutionStatus(events), [events]);

  return {
    logs,
    fileChanges,
    fileChangeArray,
    activeAgent,
    taskProgress,
    executionStatus,
    fileChangeStats,
  };
}
