"use client";

/**
 * Workflow Stream Hook
 *
 * React hook for consuming real-time workflow streaming events via SSE.
 * Provides live updates of LLM responses, tool calls, and agent progress.
 */

import { useState, useEffect, useCallback, useRef } from "react";

// ============================================================================
// Types
// ============================================================================

/**
 * Types of streaming events from workflow agents
 */
export type WorkflowStreamEventType =
  | "initial"
  | "llm_chunk"
  | "thinking"  // Claude's extended thinking (internal reasoning)
  | "tool_call"
  | "tool_result"
  | "file_changed"
  | "task_progress"
  | "task_completed"
  | "heartbeat"
  | "stream_timeout"
  | "error";

/**
 * Agent identifiers for multi-agent streaming
 */
export type AgentId = "claude-planner" | "claude-code-agent";

/**
 * Data payload for different event types
 */
export interface WorkflowStreamEventData {
  /** Text content for llm_chunk events */
  content?: string;
  /** Text content for llm_chunk events (alternate field from backend) */
  text?: string;
  /** Tool name for tool_call/tool_result events */
  toolName?: string;
  /** Tool input for tool_call events */
  toolInput?: unknown;
  /** Tool output for tool_result events (legacy field) */
  toolOutput?: string;
  /** Tool result for tool_result events (from planner-agent backend) */
  result?: string;
  /** Call ID for correlating tool_call with tool_result */
  callId?: string;
  /** Whether the tool result is an error */
  isError?: boolean;
  /** Full length of result before truncation */
  fullLength?: number;
  /** File path for file_changed events */
  filePath?: string;
  /** Operation type for file_changed events (create, modify, delete) */
  operation?: string;
  /** Status message for task_progress events */
  status?: string;
  /** Progress percentage (0-100) */
  progress?: number;
  /** Error message for error events */
  error?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
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

  // Update status and call callback
  const updateStatus = useCallback(
    (newStatus: StreamConnectionStatus) => {
      setStatus(newStatus);
      onStatusChange?.(newStatus);
    },
    [onStatusChange]
  );

  // Add event to state (with deduplication)
  const addEvent = useCallback(
    (event: WorkflowStreamEvent) => {
      const eventWithReceiveTime: WorkflowStreamEvent = {
        ...event,
        receivedAt: new Date().toISOString(),
      };

      setEvents((prev) => {
        // Deduplicate by event ID
        if (event.id && prev.some((e) => e.id === event.id)) {
          return prev; // Skip duplicate event
        }

        const newEvents = [...prev, eventWithReceiveTime];
        // Trim to max size
        if (newEvents.length > maxEvents) {
          return newEvents.slice(-maxEvents);
        }
        return newEvents;
      });

      // Update specific state based on event type
      // Backend sends llm_chunk with "text" field, but also support "content" for compatibility
      if (event.type === "llm_chunk" && (event.data.text || event.data.content)) {
        const chunkText = event.data.text || event.data.content || "";
        setLatestChunk(chunkText);
        setAccumulatedText((prev) => prev + chunkText);
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
    case "stream_timeout":
      return "Stream Timeout";
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
    case "stream_timeout":
      return "text-orange-500";
    case "error":
      return "text-red-600";
    default:
      return "text-gray-600";
  }
}
