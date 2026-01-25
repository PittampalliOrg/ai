"use client";

/**
 * Workflow Execution Context
 *
 * Provides workflow streaming state to the component tree.
 * Wraps useWorkflowStream and derives UI-ready state from events.
 */

import {
  createContext,
  useContext,
  useMemo,
  useCallback,
  useState,
  type ReactNode,
} from "react";
import {
  useWorkflowStream,
  type WorkflowStreamEvent,
  type StreamConnectionStatus,
  type AgentId,
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
 * Context value provided to consumers
 */
export interface WorkflowExecutionContextValue {
  // Stream state (from useWorkflowStream)
  workflowId: string | null;
  events: WorkflowStreamEvent[];
  status: StreamConnectionStatus;
  isConnected: boolean;
  accumulatedText: string;
  latestToolCall: { toolName: string; toolInput?: unknown } | null;

  // Derived state
  logs: WorkflowLogEntry[];
  fileChanges: Map<string, FileChange>;
  fileChangeArray: FileChange[];
  activeAgent: AgentId | null;
  taskProgress: TaskProgress | null;
  executionStatus: ExecutionStatus;
  taskPrompt: string | null;

  // Computed stats
  fileChangeStats: { additions: number; deletions: number };

  // Controls
  connect: () => void;
  disconnect: () => void;
  clearEvents: () => void;
  setTaskPrompt: (prompt: string | null) => void;
}

// ============================================================================
// Context
// ============================================================================

const WorkflowExecutionContext = createContext<WorkflowExecutionContextValue | null>(null);

// ============================================================================
// Provider Props
// ============================================================================

interface WorkflowExecutionProviderProps {
  workflowId: string | null | undefined;
  children: ReactNode;
  initialTaskPrompt?: string | null;
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

  // Check for exact matches first
  const writeTools = ["write", "edit", "create", "str_replace_based_edit_tool", "notebookedit"];
  if (writeTools.includes(normalizedName)) return true;

  // Check for partial matches (e.g., "write_file", "writefile", "edit_file", "editfile")
  const writePatterns = ["write", "edit", "create"];
  if (writePatterns.some(pattern => normalizedName.includes(pattern))) return true;

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
function eventsToLogs(events: WorkflowStreamEvent[]): WorkflowLogEntry[] {
  const logs: WorkflowLogEntry[] = [];

  events.forEach((event) => {
    switch (event.type) {
      case "llm_chunk":
        // LLM chunks are accumulated, we create log entries for significant content
        if (event.data.content && event.data.content.length > 50) {
          // Only log substantial chunks
          const existingLog = logs.find(
            (l) => l.type === "llm" && l.agentId === event.agentId
          );
          if (!existingLog) {
            logs.push({
              id: event.id,
              type: "llm",
              content: event.data.content,
              timestamp: new Date(event.timestamp),
              agentId: event.agentId,
            });
          }
        }
        break;

      case "tool_call":
        logs.push({
          id: event.id,
          type: "tool_call",
          content: `Running: ${event.data.toolName}`,
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
          content: event.data.toolOutput || "Completed",
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
 * Extract file changes from tool_call events (not tool_result, since tool_result doesn't contain toolInput)
 */
function eventsToFileChanges(events: WorkflowStreamEvent[]): Map<string, FileChange> {
  const fileChanges = new Map<string, FileChange>();

  events.forEach((event) => {
    // Process tool_call events to capture file write operations
    if (event.type === "tool_call") {
      const { toolName, toolInput } = event.data;
      if (!toolName) return;

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
function getActiveAgent(events: WorkflowStreamEvent[]): AgentId | null {
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
function getTaskProgress(events: WorkflowStreamEvent[]): TaskProgress | null {
  // Find the most recent task_progress event
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.type === "task_progress" || event.type === "task_completed") {
      const metadata = event.data.metadata as Record<string, unknown> | undefined;
      return {
        current: metadata?.currentTask as number ?? 0,
        total: metadata?.totalTasks as number ?? 0,
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
function deriveExecutionStatus(events: WorkflowStreamEvent[]): ExecutionStatus {
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
  const lastLlmChunk = events.findLast((e) => e.type === "llm_chunk");
  if (lastLlmChunk) {
    const timeSinceLastChunk = Date.now() - new Date(lastLlmChunk.timestamp).getTime();
    if (timeSinceLastChunk < 5000) return "running"; // Active if chunk within 5s
  }

  return "running";
}

// ============================================================================
// Provider Component
// ============================================================================

export function WorkflowExecutionProvider({
  workflowId,
  children,
  initialTaskPrompt,
}: WorkflowExecutionProviderProps) {
  // Use the workflow stream hook
  const stream = useWorkflowStream(workflowId);

  // Local state for task prompt (can be set from outside)
  const [taskPrompt, setTaskPromptInternal] = useState<string | null>(
    initialTaskPrompt ?? null
  );

  const setTaskPrompt = useCallback((prompt: string | null) => {
    setTaskPromptInternal(prompt);
  }, []);

  // Derive logs from events
  const logs = useMemo(() => eventsToLogs(stream.events), [stream.events]);

  // Derive file changes from events
  const fileChanges = useMemo(
    () => eventsToFileChanges(stream.events),
    [stream.events]
  );

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
  const activeAgent = useMemo(
    () => getActiveAgent(stream.events),
    [stream.events]
  );

  // Get task progress
  const taskProgress = useMemo(
    () => getTaskProgress(stream.events),
    [stream.events]
  );

  // Derive execution status
  const executionStatus = useMemo(
    () => deriveExecutionStatus(stream.events),
    [stream.events]
  );

  // Build context value
  const contextValue: WorkflowExecutionContextValue = useMemo(
    () => ({
      // Stream state
      workflowId: workflowId ?? null,
      events: stream.events,
      status: stream.status,
      isConnected: stream.isConnected,
      accumulatedText: stream.accumulatedText,
      latestToolCall: stream.latestToolCall,

      // Derived state
      logs,
      fileChanges,
      fileChangeArray,
      activeAgent,
      taskProgress,
      executionStatus,
      taskPrompt,

      // Computed stats
      fileChangeStats,

      // Controls
      connect: stream.connect,
      disconnect: stream.disconnect,
      clearEvents: stream.clearEvents,
      setTaskPrompt,
    }),
    [
      workflowId,
      stream.events,
      stream.status,
      stream.isConnected,
      stream.accumulatedText,
      stream.latestToolCall,
      stream.connect,
      stream.disconnect,
      stream.clearEvents,
      logs,
      fileChanges,
      fileChangeArray,
      activeAgent,
      taskProgress,
      executionStatus,
      taskPrompt,
      fileChangeStats,
      setTaskPrompt,
    ]
  );

  return (
    <WorkflowExecutionContext.Provider value={contextValue}>
      {children}
    </WorkflowExecutionContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access workflow execution context
 */
export function useWorkflowExecution() {
  const context = useContext(WorkflowExecutionContext);
  if (!context) {
    throw new Error(
      "useWorkflowExecution must be used within WorkflowExecutionProvider"
    );
  }
  return context;
}

/**
 * Optional hook that returns null if not within provider
 */
export function useWorkflowExecutionOptional() {
  return useContext(WorkflowExecutionContext);
}
