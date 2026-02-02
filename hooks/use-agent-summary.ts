"use client";

/**
 * Agent Summary Hook
 *
 * Derives summary information from workflow events and state.
 * Used by AgentSummaryPanel to display workflow progress.
 */

import { useMemo } from "react";
import type { WorkflowStreamEvent } from "@/hooks/use-workflow-stream";
import type { FileChange } from "@/contexts/workflow-execution-context";

export interface AgentSummary {
  taskPrompt: string | null;
  startTime: Date | null;
  endTime: Date | null;
  duration: string | null;
  planTitle: string | null;
  planSummary: string | null;
  taskCount: number;
  completedTasks: number;
  fileCount: number;
  additions: number;
  deletions: number;
  summaryPoints: string[];
}

interface Plan {
  title?: string;
  summary?: string;
  tasks?: Array<{
    id: string;
    subject?: string;
    title?: string;
    description?: string;
    status?: string;
  }>;
}

interface UseAgentSummaryOptions {
  events: WorkflowStreamEvent[];
  fileChangeArray: FileChange[];
  plan?: Plan | null;
  isStreaming: boolean;
  taskPrompt?: string | null;
}

export function useAgentSummary({
  events,
  fileChangeArray,
  plan,
  isStreaming,
  taskPrompt,
}: UseAgentSummaryOptions): AgentSummary {
  return useMemo(() => {
    // Find start time from first event
    const firstEvent = events[0];
    const startTime = firstEvent ? new Date(firstEvent.timestamp) : null;

    // Find end time from last event if not streaming
    const lastEvent = events[events.length - 1];
    const endTime =
      !isStreaming && lastEvent ? new Date(lastEvent.timestamp) : null;

    // Calculate duration
    let duration: string | null = null;
    if (startTime) {
      const end = endTime || new Date();
      const diffMs = end.getTime() - startTime.getTime();
      const seconds = Math.floor(diffMs / 1000);
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;

      if (minutes > 0) {
        duration = `${minutes}m ${remainingSeconds}s`;
      } else {
        duration = `${seconds}s`;
      }
    }

    // Plan info
    const planTitle = plan?.title || null;
    const planSummary = plan?.summary || null;
    const tasks = plan?.tasks || [];
    const taskCount = tasks.length;
    const completedTasks = tasks.filter(
      (t) => t.status === "completed"
    ).length;

    // File changes
    const fileCount = fileChangeArray.length;
    let additions = 0;
    let deletions = 0;
    fileChangeArray.forEach((change) => {
      additions += change.additions;
      deletions += change.deletions;
    });

    // Extract summary points from events
    const summaryPoints = extractSummaryPoints(events);

    return {
      taskPrompt: taskPrompt || null,
      startTime,
      endTime,
      duration,
      planTitle,
      planSummary,
      taskCount,
      completedTasks,
      fileCount,
      additions,
      deletions,
      summaryPoints,
    };
  }, [events, fileChangeArray, plan, isStreaming, taskPrompt]);
}

/**
 * Extract key summary points from workflow events
 */
function extractSummaryPoints(events: WorkflowStreamEvent[]): string[] {
  const points: string[] = [];
  const seenToolNames = new Set<string>();

  events.forEach((event) => {
    // Add unique tool calls as summary points
    if (event.type === "tool_call" && event.data.toolName) {
      const toolName = event.data.toolName;
      if (!seenToolNames.has(toolName)) {
        seenToolNames.add(toolName);

        // Create human-readable description
        const description = getToolDescription(toolName, event.data.toolInput);
        if (description) {
          points.push(description);
        }
      }
    }

    // Add progress/status messages as summary points
    if (event.type === "task_progress" || event.type === "task_completed") {
      const status = event.data.status;
      if (status && !points.includes(status) && status.length < 100) {
        points.push(status);
      }
    }
  });

  // Limit to 5 points
  return points.slice(0, 5);
}

/**
 * Get human-readable description for a tool call
 */
function getToolDescription(
  toolName: string,
  toolInput: unknown
): string | null {
  const input = toolInput as Record<string, unknown> | undefined;

  switch (toolName.toLowerCase()) {
    case "read":
    case "read_file":
      return input?.path
        ? `Read ${getFileName(input.path as string)}`
        : "Read file";

    case "write":
    case "write_file":
      return input?.path
        ? `Created ${getFileName(input.path as string)}`
        : "Created file";

    case "edit":
    case "str_replace_based_edit_tool":
      return input?.path
        ? `Edited ${getFileName(input.path as string)}`
        : "Edited file";

    case "bash":
    case "shell":
      return "Ran shell command";

    case "grep":
    case "search":
      return "Searched codebase";

    case "glob":
      return "Found files";

    default:
      return null;
  }
}

/**
 * Extract filename from path
 */
function getFileName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}
