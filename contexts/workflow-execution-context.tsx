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
  oldPath?: string;
  status?: "A" | "M" | "D" | "R";
  rawPatch?: string | null;
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
 *
 * Handles comprehensive event types from:
 * - Claude Agent SDK (message_*, content_block_*, text_delta, thinking_delta)
 * - OpenAI Agents SDK (tool_called, tool_output, handoff_*, agent_updated)
 * - Vercel AI SDK (text-start, text-delta, tool-call-*, reasoning)
 * - Planner-dapr-agent (status, execution_*, phase_completed)
 */
function eventsToLogs(events: WorkflowStreamEvent[]): WorkflowLogEntry[] {
  const logs: WorkflowLogEntry[] = [];

  events.forEach((event) => {
    const eventType = event.type;
    const data = event.data || {};

    switch (eventType) {
      // ========== LLM Text Streaming Events ==========
      case "llm_chunk":
      case "text_delta":
      case "text-delta":
      case "content_block_delta":
        // LLM chunks are accumulated, we create log entries for significant content
        if (data.content && data.content.length > 50) {
          const existingLog = logs.find(
            (l) => l.type === "llm" && l.agentId === event.agentId
          );
          if (!existingLog) {
            logs.push({
              id: event.id,
              type: "llm",
              content: data.content,
              timestamp: new Date(event.timestamp),
              agentId: event.agentId,
            });
          }
        }
        break;

      case "message_start":
      case "text-start":
      case "content_block_start":
        // Start of a new message/content block
        logs.push({
          id: event.id,
          type: "progress",
          content: data.content || data.status || "AI generating response...",
          timestamp: new Date(event.timestamp),
          agentId: event.agentId,
        });
        break;

      case "message_stop":
      case "message_delta":
      case "text-end":
      case "content_block_stop":
        // End/update of message - only log if has meaningful content
        if (data.content || data.status) {
          logs.push({
            id: event.id,
            type: "progress",
            content: data.content || data.status || "Response complete",
            timestamp: new Date(event.timestamp),
            status: "success",
          });
        }
        break;

      case "thinking_delta":
      case "reasoning":
        // Extended thinking/reasoning content
        if (data.content && data.content.length > 20) {
          logs.push({
            id: event.id,
            type: "llm",
            content: `[Thinking] ${data.content}`,
            timestamp: new Date(event.timestamp),
            agentId: event.agentId,
          });
        }
        break;

      // ========== Tool Call Events ==========
      case "tool_call":
      case "tool_called":
      case "tool-call":
      case "tool-call-streaming-start":
        logs.push({
          id: event.id,
          type: "tool_call",
          content: `Running: ${data.toolName || data.name || "tool"}`,
          timestamp: new Date(event.timestamp),
          agentId: event.agentId,
          toolName: data.toolName || data.name,
          toolInput: data.toolInput || data.input || data.arguments,
          status: "running",
        });
        break;

      case "tool-call-delta":
        // Incremental tool argument updates - skip unless significant
        break;

      case "tool_result":
      case "tool_output":
      case "tool-result": {
        const resultOutput = data.toolOutput ?? data.output ?? data.result;
        const outputStr = typeof resultOutput === "string"
          ? resultOutput
          : resultOutput != null
            ? JSON.stringify(resultOutput)
            : "Completed";
        logs.push({
          id: event.id,
          type: "tool_result",
          content: outputStr,
          timestamp: new Date(event.timestamp),
          agentId: event.agentId,
          toolName: data.toolName || data.name,
          toolOutput: outputStr,
          status: data.error ? "error" : "success",
        });
        break;
      }

      // ========== LLM Lifecycle Events ==========
      case "llm_start": {
        const llmContent = data.llm_call ?? data.content;
        logs.push({
          id: event.id,
          type: "progress",
          content: typeof llmContent === "string" ? llmContent : "LLM processing...",
          timestamp: new Date(event.timestamp),
          agentId: event.agentId,
          status: "running",
        });
        break;
      }

      case "llm_end":
        logs.push({
          id: event.id,
          type: "llm",
          content: data.output || data.content || "LLM response complete",
          timestamp: new Date(event.timestamp),
          agentId: event.agentId,
          status: "success",
        });
        break;

      // ========== Activity Lifecycle Events ==========
      case "activity_started": {
        const activityContent = data.activity ?? data.content;
        logs.push({
          id: event.id,
          type: "progress",
          content: typeof activityContent === "string" ? activityContent : "Activity started",
          timestamp: new Date(event.timestamp),
          status: "running",
        });
        break;
      }

      case "activity_completed": {
        const activityCompletedContent = data.activity ?? data.content;
        logs.push({
          id: event.id,
          type: "progress",
          content: typeof activityCompletedContent === "string" ? activityCompletedContent : "Activity completed",
          timestamp: new Date(event.timestamp),
          status: data.status === "failed" ? "error" : "success",
        });
        break;
      }

      // ========== Agent Lifecycle Events ==========
      case "agent_started": {
        const agentStartedContent = data.agent ?? data.content;
        logs.push({
          id: event.id,
          type: "progress",
          content: typeof agentStartedContent === "string" ? agentStartedContent : "Agent started",
          timestamp: new Date(event.timestamp),
          status: "running",
        });
        break;
      }

      case "agent_completed": {
        const agentCompletedContent = data.agent ?? data.content;
        logs.push({
          id: event.id,
          type: "progress",
          content: typeof agentCompletedContent === "string" ? agentCompletedContent : "Agent completed",
          timestamp: new Date(event.timestamp),
          status: "success",
        });
        break;
      }

      // ========== Workflow/Task Progress Events ==========
      case "task_progress":
      case "start-step":
        logs.push({
          id: event.id,
          type: "progress",
          content: data.status || data.content || data.message || "Progress update",
          timestamp: new Date(event.timestamp),
          progress: data.progress,
        });
        break;

      case "initial":
      case "status":
      case "execution_started": {
        // Handle initial/status workflow state events
        // Detect approval-waiting states - these should not show as "running"
        const content = data.content || data.message || data.status || "Workflow started";
        const phase = data.phase?.toLowerCase() || "";
        const isAwaitingApproval = phase === "awaiting_approval" ||
          content.toLowerCase().includes("approval") ||
          content.toLowerCase().includes("awaiting");
        logs.push({
          id: event.id,
          type: "progress",
          content,
          timestamp: new Date(event.timestamp),
          progress: data.progress,
          // Don't mark approval-waiting as "running" to avoid showing spinner
          status: isAwaitingApproval ? undefined : (eventType === "execution_started" ? "running" : undefined),
        });
        break;
      }

      case "phase_started":
        // Handle phase start events (cloning, planning, execution, testing)
        logs.push({
          id: event.id,
          type: "progress",
          content: data.phase ? `Starting phase: ${data.phase}` : (data.content || data.message || "Phase started"),
          timestamp: new Date(event.timestamp),
          status: "running",
          progress: data.progress,
        });
        break;

      case "task_completed":
      case "execution_completed":
      case "phase_completed":
      case "finish-step":
        // Handle workflow/task completion events
        logs.push({
          id: event.id,
          type: "progress",
          content: data.phase ? `Completed phase: ${data.phase}` : (data.status || data.content || data.message || "Task completed"),
          timestamp: new Date(event.timestamp),
          status: "success",
          progress: data.progress,
        });
        break;

      case "execution_failed":
        logs.push({
          id: event.id,
          type: "error",
          content: data.error || data.message || "Execution failed",
          timestamp: new Date(event.timestamp),
          status: "error",
        });
        break;

      // ========== Agent/Handoff Events ==========
      case "handoff_requested":
      case "handoff_occured":
      case "agent_updated":
        logs.push({
          id: event.id,
          type: "progress",
          content: data.content || data.status || `Agent handoff: ${data.agentName || "unknown"}`,
          timestamp: new Date(event.timestamp),
          agentId: event.agentId,
        });
        break;

      // ========== MCP Events ==========
      case "mcp_approval_requested":
        logs.push({
          id: event.id,
          type: "progress",
          content: data.content || "MCP approval requested",
          timestamp: new Date(event.timestamp),
        });
        break;

      case "mcp_approval_response":
        logs.push({
          id: event.id,
          type: "progress",
          content: data.content || `MCP approval: ${data.approved ? "approved" : "denied"}`,
          timestamp: new Date(event.timestamp),
          status: data.approved ? "success" : "error",
        });
        break;

      // ========== Error Events ==========
      case "error":
        logs.push({
          id: event.id,
          type: "error",
          content: data.error || data.message || "Unknown error",
          timestamp: new Date(event.timestamp),
          status: "error",
        });
        break;

      // ========== Keep-alive/Heartbeat Events ==========
      case "heartbeat":
      case "ping":
      case "stream_done":
        // Silently ignore keep-alive events
        break;

      // ========== Default Handler ==========
      default:
        // Handle any unknown event types as progress updates if they have content
        if (data.content || data.status || data.message) {
          logs.push({
            id: event.id,
            type: "progress",
            content: data.content || data.status || data.message || `Event: ${eventType}`,
            timestamp: new Date(event.timestamp),
            progress: data.progress,
          });
        }
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
