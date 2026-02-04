"use client";

/**
 * Workflow Stream Hook
 *
 * React hook for consuming real-time workflow streaming events via SSE.
 * Provides live updates of LLM responses, tool calls, and agent progress.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { TextStreamPart, ToolSet } from "ai";

// ============================================================================
// Types
// ============================================================================

/**
 * Extract the 'type' field from Vercel AI SDK's TextStreamPart union type
 * This keeps our types in sync with the AI SDK automatically
 */
type VercelAIEventType = TextStreamPart<ToolSet>["type"];

/**
 * Backend-specific event types not covered by Vercel AI SDK
 */
type BackendEventType =
  // Lifecycle events
  | "initial"
  | "status"
  | "heartbeat"
  | "ping"
  | "stream_done"
  // Task/workflow progress
  | "task_progress"
  | "task_completed"
  | "execution_started"
  | "execution_completed"
  | "execution_failed"
  | "phase_completed"
  // LLM/text streaming (Claude style)
  | "llm_chunk"
  | "message_start"
  | "message_delta"
  | "message_stop"
  | "content_block_start"
  | "content_block_delta"
  | "content_block_stop"
  | "text_delta"
  | "thinking_delta"
  // Tool events (alternative naming)
  | "tool_call"
  | "tool_result"
  | "tool_called"
  | "tool_output"
  | "tool-call-streaming-start"
  | "tool-call-delta"
  // Handoff/agent events (OpenAI style)
  | "handoff_requested"
  | "handoff_occured"
  | "agent_updated"
  // MCP events
  | "mcp_approval_requested"
  | "mcp_approval_response";

/**
 * Types of streaming events from workflow agents
 *
 * Comprehensive event types covering:
 * - Vercel AI SDK events (auto-synced via TextStreamPart import)
 * - Claude Agent SDK events (message_start, content_block_*, text_delta, etc.)
 * - OpenAI Agents SDK events (tool_called, tool_output, handoff_*, etc.)
 * - Planner-dapr-agent events (status, execution_*, phase_completed, etc.)
 */
export type WorkflowStreamEventType = VercelAIEventType | BackendEventType | string;

/**
 * Agent identifiers for multi-agent streaming
 */
export type AgentId = "claude-planner" | "claude-code-agent";

/**
 * Task data structure for displaying task cards
 */
export interface TaskData {
  id: string;
  subject: string;
  description: string;
  activeForm?: string;
  status: "pending" | "in_progress" | "completed";
  blocks?: string[];
  blockedBy?: string[];
}

/**
 * Data payload for different event types
 *
 * Supports fields from Claude, OpenAI, and Vercel AI SDK event formats
 */
export interface WorkflowStreamEventData {
  /** Text content for llm_chunk/text_delta events */
  content?: string;
  /** Alternative text content field (used by some event sources) */
  text?: string;
  /** Status message for progress events */
  status?: string;
  /** Human-readable message */
  message?: string;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Error message for error events */
  error?: string;

  // Tool-related fields (multiple naming conventions)
  /** Tool name (Claude/custom style) */
  toolName?: string;
  /** Tool name (OpenAI/Vercel style) */
  name?: string;
  /** Tool input (Claude style) */
  toolInput?: unknown;
  /** Tool input (OpenAI style) */
  input?: unknown;
  /** Tool arguments (Vercel style) */
  arguments?: unknown;
  /** Tool output (Claude style) */
  toolOutput?: string;
  /** Tool output (OpenAI style) */
  output?: string;
  /** Tool result (Vercel style) */
  result?: unknown;
  /** Tool call ID for correlating calls with results */
  callId?: string;
  /** Alternative tool call ID (Vercel style) */
  toolCallId?: string;
  /** Whether tool result is an error */
  isError?: boolean;
  /** Error text for tool errors */
  errorText?: string;

  // Phase/workflow status fields
  /** Current workflow phase */
  phase?: string;
  /** Runtime status (RUNNING, COMPLETED, etc.) */
  runtimeStatus?: string;

  // Agent/handoff fields
  /** Agent name for handoff events */
  agentName?: string;
  /** Whether approval was granted */
  approved?: boolean;

  // File change fields
  /** File path for file_changed events */
  filePath?: string;
  /** Operation type (create, modify, delete) */
  operation?: string;

  // Task/plan fields
  /** Task data for task_created events */
  task?: TaskData;
  /** Task ID for task_updated events */
  taskId?: string;
  /** Task status for task_updated events */
  taskStatus?: "pending" | "in_progress" | "completed";

  // AI SDK part fields (for "part" events)
  /** Part type (text, reasoning, dynamic-tool) */
  type?: string;
  /** Part state for dynamic-tool parts */
  state?: string;

  // Context fields
  /** LLM call metadata */
  llm_call?: unknown;
  /** Activity metadata */
  activity?: unknown;

  /** Additional metadata */
  metadata?: Record<string, unknown>;

  /** Allow additional fields for flexibility */
  [key: string]: unknown;
}

/**
 * Real-time streaming event from workflow agents
 */
export interface WorkflowStreamEvent {
  /** Unique event identifier */
  id: string;
  /** Type of streaming event */
  type: WorkflowStreamEventType;
  /** Associated workflow instance ID */
  workflowId: string;
  /** Associated task ID (if applicable) */
  taskId?: string;
  /** Source agent identifier */
  agentId?: AgentId;
  /** Event payload data */
  data: WorkflowStreamEventData;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Client-side receive timestamp */
  receivedAt?: string;
}

/**
 * Connection status for the SSE stream
 */
export type StreamConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

/**
 * Options for the useWorkflowStream hook
 */
export interface UseWorkflowStreamOptions {
  /** Maximum number of events to keep in memory (default: 500) */
  maxEvents?: number;
  /** Auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Reconnect delay in ms (default: 3000) */
  reconnectDelay?: number;
  /** Maximum reconnect attempts (default: 10) */
  maxReconnectAttempts?: number;
  /** Callback when a new event is received */
  onEvent?: (event: WorkflowStreamEvent) => void;
  /** Callback when connection status changes */
  onStatusChange?: (status: StreamConnectionStatus) => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
}

/**
 * Return type for the useWorkflowStream hook
 */
export interface UseWorkflowStreamReturn {
  /** All received events (most recent last) */
  events: WorkflowStreamEvent[];
  /** Current connection status */
  status: StreamConnectionStatus;
  /** Whether the stream is currently connected */
  isConnected: boolean;
  /** Most recent LLM chunk text */
  latestChunk: string | null;
  /** Most recent tool call */
  latestToolCall: { toolName: string; toolInput?: unknown } | null;
  /** Current accumulated response text */
  accumulatedText: string;
  /** Number of reconnect attempts */
  reconnectAttempts: number;
  /** Error if any */
  error: Error | null;
  /** Manually connect to the stream */
  connect: () => void;
  /** Manually disconnect from the stream */
  disconnect: () => void;
  /** Clear all stored events */
  clearEvents: () => void;
  /** Get events filtered by type */
  getEventsByType: (type: WorkflowStreamEventType) => WorkflowStreamEvent[];
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for consuming workflow streaming events via SSE
 *
 * @param workflowId - The workflow instance ID to stream events for
 * @param options - Configuration options
 * @returns Stream state and control functions
 */
export function useWorkflowStream(
  workflowId: string | null | undefined,
  options: UseWorkflowStreamOptions = {}
): UseWorkflowStreamReturn {
  const {
    maxEvents = 500,
    autoReconnect = true,
    reconnectDelay = 3000,
    maxReconnectAttempts = 10,
    onEvent,
    onStatusChange,
    onError,
  } = options;

  // State
  const [events, setEvents] = useState<WorkflowStreamEvent[]>([]);
  const [status, setStatus] = useState<StreamConnectionStatus>("disconnected");
  const [latestChunk, setLatestChunk] = useState<string | null>(null);
  const [latestToolCall, setLatestToolCall] = useState<{
    toolName: string;
    toolInput?: unknown;
  } | null>(null);
  const [accumulatedText, setAccumulatedText] = useState("");
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  // Refs
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isManualDisconnectRef = useRef(false);
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const workflowCompleteRef = useRef(false);

  // Update status and call callback
  const updateStatus = useCallback(
    (newStatus: StreamConnectionStatus) => {
      setStatus(newStatus);
      onStatusChange?.(newStatus);
    },
    [onStatusChange]
  );

  // Add event to state (with deduplication by ID)
  const addEvent = useCallback(
    (event: WorkflowStreamEvent) => {
      // Early deduplication: skip entirely if we've seen this event ID
      if (event.id && seenEventIdsRef.current.has(event.id)) {
        return;
      }

      // Mark this event ID as seen
      if (event.id) {
        seenEventIdsRef.current.add(event.id);
        // Prevent memory leak: limit seen IDs set size
        if (seenEventIdsRef.current.size > maxEvents * 2) {
          const idsArray = Array.from(seenEventIdsRef.current);
          seenEventIdsRef.current = new Set(idsArray.slice(-maxEvents));
        }
      }

      const eventWithReceiveTime: WorkflowStreamEvent = {
        ...event,
        receivedAt: new Date().toISOString(),
      };

      setEvents((prev) => {
        const newEvents = [...prev, eventWithReceiveTime];
        // Trim to max size
        if (newEvents.length > maxEvents) {
          return newEvents.slice(-maxEvents);
        }
        return newEvents;
      });

      // Update specific state based on event type
      if (event.type === "llm_chunk" && event.data.content) {
        setLatestChunk(event.data.content);
        setAccumulatedText((prev) => prev + event.data.content);
      } else if (event.type === "tool_call" && event.data.toolName) {
        setLatestToolCall({
          toolName: event.data.toolName,
          toolInput: event.data.toolInput,
        });
      } else if (event.type === "task_completed") {
        // Reset accumulated text for new task
        setAccumulatedText("");
        setLatestChunk(null);
        setLatestToolCall(null);
      }

      // Track workflow completion to prevent unnecessary reconnects
      const isCompletionEvent =
        event.type === "stream_done" ||
        event.type === "execution_completed" ||
        event.type === "execution_failed" ||
        (event.type === "phase_completed" && event.data?.phase === "testing") ||
        (event.type === "status" && (
          event.data?.runtimeStatus === "COMPLETED" ||
          event.data?.runtimeStatus === "FAILED" ||
          event.data?.runtimeStatus === "REJECTED"
        ));

      if (isCompletionEvent) {
        workflowCompleteRef.current = true;
      }

      // Call event callback
      onEvent?.(eventWithReceiveTime);
    },
    [maxEvents, onEvent]
  );

  // Connect to the SSE stream
  const connect = useCallback(() => {
    if (!workflowId) return;

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    isManualDisconnectRef.current = false;
    // Only reset completion flag if this is a fresh connection (not a reconnect)
    if (reconnectAttempts === 0) {
      workflowCompleteRef.current = false;
    }
    updateStatus("connecting");
    setError(null);

    try {
      const url = `/api/workflows/${encodeURIComponent(workflowId)}/stream`;
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log(`[Stream] Connected to workflow ${workflowId}`);
        updateStatus("connected");
        setReconnectAttempts(0);
      };

      eventSource.onmessage = (messageEvent) => {
        try {
          const event = JSON.parse(messageEvent.data) as WorkflowStreamEvent;
          addEvent(event);
        } catch (parseError) {
          console.warn("[Stream] Failed to parse event:", messageEvent.data);
        }
      };

      eventSource.onerror = () => {
        // EventSource errors don't provide useful info - check readyState instead
        const state = eventSource.readyState;
        const stateLabel = state === EventSource.CONNECTING ? "connecting"
          : state === EventSource.OPEN ? "open"
          : "closed";

        // Only log as error if not a normal close (e.g., workflow completed)
        if (state !== EventSource.CLOSED) {
          console.warn(`[Stream] Connection issue (state: ${stateLabel})`);
        }

        // Check if workflow appears to be complete based on events we've received
        // If so, treat the close as intentional and don't reconnect
        if (workflowCompleteRef.current) {
          console.log(`[Stream] Workflow appears complete, not reconnecting`);
          updateStatus("disconnected");
          eventSource.close();
          return;
        }

        const connectionError = new Error(`Stream connection ${stateLabel}`);
        setError(connectionError);
        onError?.(connectionError);

        // Check if we should reconnect
        if (
          !isManualDisconnectRef.current &&
          autoReconnect &&
          reconnectAttempts < maxReconnectAttempts
        ) {
          updateStatus("reconnecting");
          setReconnectAttempts((prev) => prev + 1);

          // Schedule reconnect
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay);
        } else {
          updateStatus("error");
          eventSource.close();
        }
      };
    } catch (connectError) {
      const err = connectError instanceof Error ? connectError : new Error(String(connectError));
      setError(err);
      onError?.(err);
      updateStatus("error");
    }
  }, [
    workflowId,
    updateStatus,
    addEvent,
    autoReconnect,
    reconnectAttempts,
    maxReconnectAttempts,
    reconnectDelay,
    onError,
  ]);

  // Disconnect from the SSE stream
  const disconnect = useCallback(() => {
    isManualDisconnectRef.current = true;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    updateStatus("disconnected");
    setReconnectAttempts(0);
  }, [updateStatus]);

  // Clear events
  const clearEvents = useCallback(() => {
    setEvents([]);
    setAccumulatedText("");
    setLatestChunk(null);
    setLatestToolCall(null);
    seenEventIdsRef.current.clear();
    workflowCompleteRef.current = false;
  }, []);

  // Get events by type
  const getEventsByType = useCallback(
    (type: WorkflowStreamEventType) => {
      return events.filter((e) => e.type === type);
    },
    [events]
  );

  // Auto-connect when workflowId changes
  useEffect(() => {
    if (workflowId) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  return {
    events,
    status,
    isConnected: status === "connected",
    latestChunk,
    latestToolCall,
    accumulatedText,
    reconnectAttempts,
    error,
    connect,
    disconnect,
    clearEvents,
    getEventsByType,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get display label for event type
 */
export function getEventTypeLabel(type: WorkflowStreamEventType): string {
  switch (type) {
    case "initial":
      return "Initial State";
    case "llm_chunk":
      return "LLM Response";
    case "tool_call":
      return "Tool Call";
    case "tool_result":
      return "Tool Result";
    case "task_progress":
      return "Progress";
    case "task_completed":
      return "Completed";
    case "heartbeat":
      return "Heartbeat";
    case "error":
      return "Error";
    default:
      return "Unknown";
  }
}

/**
 * Get color class for event type
 */
export function getEventTypeColor(type: WorkflowStreamEventType): string {
  switch (type) {
    case "initial":
      return "text-blue-600";
    case "llm_chunk":
      return "text-green-600";
    case "tool_call":
      return "text-purple-600";
    case "tool_result":
      return "text-indigo-600";
    case "task_progress":
      return "text-yellow-600";
    case "task_completed":
      return "text-emerald-600";
    case "heartbeat":
      return "text-gray-400";
    case "error":
      return "text-red-600";
    default:
      return "text-gray-600";
  }
}

// ============================================================================
// Task and Plan Helpers
// ============================================================================

/**
 * Check if a tool name is a task management tool
 */
export function isTaskTool(toolName: string): boolean {
  const taskTools = ["TaskCreate", "TaskUpdate", "TaskList", "TaskGet"];
  return taskTools.includes(toolName);
}

/**
 * Check if a tool name is a plan management tool
 */
export function isPlanTool(toolName: string): boolean {
  const planTools = ["EnterPlanMode", "ExitPlanMode"];
  return planTools.includes(toolName);
}

/**
 * Check if a tool name is a thinking/reasoning tool
 */
export function isThinkTool(toolName: string): boolean {
  const thinkTools = ["think", "reasoning", "chain_of_thought"];
  return thinkTools.includes(toolName.toLowerCase());
}

/**
 * Check if a tool name is a plan drafting tool
 */
export function isDraftPlanTool(toolName: string): boolean {
  const draftPlanTools = ["draft_plan", "draftPlan", "create_plan", "plan"];
  return draftPlanTools.includes(toolName) || toolName.toLowerCase() === "draft_plan";
}
