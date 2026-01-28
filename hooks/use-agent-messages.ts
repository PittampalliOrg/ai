"use client";

/**
 * useAgentMessages Hook
 *
 * Transforms workflow stream events into chat-style messages.
 * Groups consecutive LLM chunks, summarizes tool calls, and handles plan approval events.
 */

import { useMemo } from "react";
import type { WorkflowStreamEvent } from "@/hooks/use-workflow-stream";

// ============================================================================
// Types
// ============================================================================

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  type: "text" | "tool-summary" | "plan-approval" | "thinking";
  toolName?: string;
  toolCount?: number;
  isStreaming?: boolean;
}

interface UseAgentMessagesOptions {
  taskPrompt: string | null;
  events: WorkflowStreamEvent[];
  accumulatedText: string;
  isStreaming: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format a timestamp for display
 */
function formatTimestamp(timestamp: string | Date): string {
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Get a human-readable summary of a tool call
 */
function getToolSummary(toolName: string, toolInput?: unknown): string {
  const input = toolInput as Record<string, unknown> | undefined;

  switch (toolName.toLowerCase()) {
    case "read":
    case "readfile":
      return `Read ${input?.file_path || input?.path || "file"}`;
    case "write":
    case "writefile":
      return `Write to ${input?.file_path || input?.path || "file"}`;
    case "edit":
    case "str_replace_based_edit_tool":
      return `Edit ${input?.file_path || input?.path || "file"}`;
    case "glob":
      return `Search files: ${input?.pattern || ""}`;
    case "grep":
      return `Search content: ${input?.pattern || ""}`;
    case "bash":
      const cmd = (input?.command as string) || "";
      return `Run: ${cmd.length > 40 ? cmd.slice(0, 40) + "..." : cmd}`;
    case "task":
      return `Spawned sub-agent`;
    default:
      return `${toolName}`;
  }
}

/**
 * Check if an event indicates plan is ready for approval
 */
function isPlanReadyEvent(event: WorkflowStreamEvent): boolean {
  if (event.type === "task_progress") {
    const status = (event.data.status || "").toLowerCase();
    return (
      status.includes("waiting for plan approval") ||
      status.includes("plan ready for approval") ||
      status.includes("awaiting approval")
    );
  }
  return false;
}

// ============================================================================
// Main Hook
// ============================================================================

export function useAgentMessages({
  taskPrompt,
  events,
  accumulatedText,
  isStreaming,
}: UseAgentMessagesOptions): AgentMessage[] {
  return useMemo(() => {
    const messages: AgentMessage[] = [];

    // 1. Add initial user message from task prompt
    if (taskPrompt) {
      messages.push({
        id: "user-task-prompt",
        role: "user",
        content: taskPrompt,
        timestamp: events[0]?.timestamp || new Date().toISOString(),
        type: "text",
      });
    }

    // 2. Process events into messages
    let currentLlmText = "";
    let currentLlmStartTime: string | null = null;
    let pendingToolCalls: Array<{ name: string; input?: unknown; time: string }> = [];

    const flushLlmText = () => {
      if (currentLlmText.trim()) {
        messages.push({
          id: `llm-${messages.length}`,
          role: "assistant",
          content: currentLlmText.trim(),
          timestamp: currentLlmStartTime || new Date().toISOString(),
          type: "text",
        });
        currentLlmText = "";
        currentLlmStartTime = null;
      }
    };

    const flushToolCalls = () => {
      if (pendingToolCalls.length === 0) return;

      // Group consecutive tool calls into a single summary
      const summary =
        pendingToolCalls.length === 1
          ? getToolSummary(pendingToolCalls[0].name, pendingToolCalls[0].input)
          : `${pendingToolCalls.length} tool calls`;

      const toolNames = pendingToolCalls.map((t) => t.name);
      const uniqueTools = [...new Set(toolNames)];

      messages.push({
        id: `tools-${messages.length}`,
        role: "assistant",
        content: summary,
        timestamp: pendingToolCalls[0].time,
        type: "tool-summary",
        toolName: uniqueTools.join(", "),
        toolCount: pendingToolCalls.length,
      });

      pendingToolCalls = [];
    };

    for (const event of events) {
      switch (event.type) {
        case "llm_chunk":
          // Accumulate LLM text
          if (event.data.content) {
            if (!currentLlmStartTime) {
              currentLlmStartTime = event.timestamp;
            }
            currentLlmText += event.data.content;
          }
          break;

        case "tool_call":
          // Flush any pending LLM text before tool calls
          flushLlmText();

          // Add to pending tool calls (will be grouped)
          pendingToolCalls.push({
            name: event.data.toolName || "unknown",
            input: event.data.toolInput,
            time: event.timestamp,
          });
          break;

        case "tool_result":
          // Tool results complete the tool call group
          // Don't flush yet - wait for more tool calls or LLM text
          break;

        case "task_progress":
          // Check for plan approval event
          if (isPlanReadyEvent(event)) {
            flushLlmText();
            flushToolCalls();

            messages.push({
              id: `plan-${event.id}`,
              role: "assistant",
              content: "Implementation plan ready for your review.",
              timestamp: event.timestamp,
              type: "plan-approval",
            });
          }
          break;
      }
    }

    // 3. Flush any remaining content
    flushToolCalls();

    // 4. Handle streaming state
    if (isStreaming && accumulatedText) {
      // Check if we have pending LLM text that hasn't been flushed
      if (currentLlmText.trim()) {
        messages.push({
          id: `llm-streaming`,
          role: "assistant",
          content: currentLlmText.trim(),
          timestamp: currentLlmStartTime || new Date().toISOString(),
          type: "text",
          isStreaming: true,
        });
      } else if (accumulatedText.trim() && messages.length > 0) {
        // Update the last assistant message if it exists and is text
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.role === "assistant" && lastMsg.type === "text") {
          lastMsg.isStreaming = true;
        }
      }
    } else {
      // Not streaming - flush final LLM text
      flushLlmText();
    }

    // 5. Add thinking indicator if streaming but no text yet
    if (
      isStreaming &&
      !accumulatedText &&
      messages.length > 0 &&
      messages[messages.length - 1].role === "user"
    ) {
      messages.push({
        id: "thinking",
        role: "assistant",
        content: "",
        timestamp: new Date().toISOString(),
        type: "thinking",
        isStreaming: true,
      });
    }

    return messages;
  }, [taskPrompt, events, accumulatedText, isStreaming]);
}

/**
 * Simplified hook that just gets the message count and latest message type
 * Useful for status indicators
 */
export function useAgentMessageStats({
  taskPrompt,
  events,
}: {
  taskPrompt: string | null;
  events: WorkflowStreamEvent[];
}) {
  return useMemo(() => {
    const hasUserMessage = !!taskPrompt;
    const toolCallCount = events.filter((e) => e.type === "tool_call").length;
    const hasLlmText = events.some(
      (e) => e.type === "llm_chunk" && e.data.content
    );
    const hasPlanReady = events.some(isPlanReadyEvent);

    return {
      hasUserMessage,
      toolCallCount,
      hasLlmText,
      hasPlanReady,
    };
  }, [taskPrompt, events]);
}
