"use client";

/**
 * useAgentSummary Hook
 *
 * Transforms workflow events and state into a structured summary
 * for display in the AgentSummaryPanel (Codex UI pattern).
 */

import { useMemo } from "react";
import type { WorkflowStreamEvent } from "@/hooks/use-workflow-stream";
import type { FileChange } from "@/contexts/workflow-execution-context";

// ============================================================================
// Types
// ============================================================================

export interface AgentTask {
  id: string;
  title: string;
  description?: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  files?: string[];
}

export interface AgentPlan {
  id: string;
  title: string;
  description?: string;
  tasks: AgentTask[];
}

export interface AgentFileSummary {
  path: string;
  fileName: string;
  additions: number;
  deletions: number;
  status: "created" | "modified" | "deleted";
}

export interface AgentSummary {
  executionTime: {
    seconds: number;
    formatted: string;
  };
  plan: AgentPlan | null;
  summary: string[]; // bullet points
  files: AgentFileSummary[];
  isStreaming: boolean;
  taskPrompt: string | null;
}

interface PlanInfo {
  id?: string;
  title?: string;
  summary?: string;
  tasks?: Array<{
    id: string;
    title: string;
    description?: string;
    status?: string;
  }>;
}

interface UseAgentSummaryOptions {
  events: WorkflowStreamEvent[];
  fileChangeArray: FileChange[];
  plan?: PlanInfo | null;
  isStreaming: boolean;
  taskPrompt: string | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate execution time from events
 * Uses the time span between the first event and either:
 * - The last event (if not streaming)
 * - Current time (if streaming)
 *
 * Also includes a sanity check to handle edge cases where
 * events might have stale timestamps.
 */
function calculateExecutionTime(
  events: WorkflowStreamEvent[],
  isStreaming: boolean = false
): {
  seconds: number;
  formatted: string;
} {
  if (events.length === 0) {
    return { seconds: 0, formatted: "0s" };
  }

  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];

  const startTime = new Date(firstEvent.timestamp).getTime();
  // Use current time when streaming, otherwise use last event time
  const endTime = isStreaming ? Date.now() : new Date(lastEvent.timestamp).getTime();

  let diffMs = endTime - startTime;

  // Sanity check: if the diff is negative or unreasonably large (> 1 hour),
  // calculate based on the span of the last 10 events or use 0
  const ONE_HOUR_MS = 60 * 60 * 1000;
  if (diffMs < 0 || diffMs > ONE_HOUR_MS) {
    // Try calculating from recent events only
    const recentEvents = events.slice(-10);
    if (recentEvents.length >= 2) {
      const recentStart = new Date(recentEvents[0].timestamp).getTime();
      const recentEnd = isStreaming ? Date.now() : new Date(recentEvents[recentEvents.length - 1].timestamp).getTime();
      diffMs = recentEnd - recentStart;

      // If still unreasonable, just use time since last event
      if (diffMs < 0 || diffMs > ONE_HOUR_MS) {
        diffMs = isStreaming ? Date.now() - new Date(lastEvent.timestamp).getTime() : 0;
      }
    } else {
      diffMs = 0;
    }
  }

  const seconds = Math.max(0, Math.floor(diffMs / 1000));

  // Format: "Xm Ys" or "Ys"
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return {
      seconds,
      formatted: `${minutes}m ${remainingSeconds}s`,
    };
  }

  return {
    seconds,
    formatted: `${seconds}s`,
  };
}

/**
 * Convert plan info to AgentPlan format
 */
function convertPlan(plan: PlanInfo | null | undefined): AgentPlan | null {
  if (!plan || !plan.tasks || plan.tasks.length === 0) {
    return null;
  }

  return {
    id: plan.id || "plan-1",
    title: plan.title || "Implementation Plan",
    description: plan.summary,
    tasks: plan.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      status: mapTaskStatus(task.status),
      files: [], // Could be extracted from task if available
    })),
  };
}

/**
 * Map task status string to typed status
 */
function mapTaskStatus(status?: string): AgentTask["status"] {
  if (!status) return "pending";
  const lowerStatus = status.toLowerCase();

  if (lowerStatus === "completed" || lowerStatus === "done") return "completed";
  if (lowerStatus === "in_progress" || lowerStatus === "running") return "in_progress";
  if (lowerStatus === "failed" || lowerStatus === "error") return "failed";
  return "pending";
}

/**
 * Generate summary bullets from events and file changes
 */
function generateSummaryBullets(
  events: WorkflowStreamEvent[],
  fileChangeArray: FileChange[],
  plan: AgentPlan | null
): string[] {
  const bullets: string[] = [];

  // Count completed tasks from plan
  if (plan) {
    const completedCount = plan.tasks.filter((t) => t.status === "completed").length;
    const totalCount = plan.tasks.length;
    if (completedCount > 0) {
      bullets.push(`Completed ${completedCount} of ${totalCount} tasks`);
    }
  }

  // File changes summary
  const newFiles = fileChangeArray.filter((f) => f.isNew);
  const modifiedFiles = fileChangeArray.filter((f) => !f.isNew);

  if (newFiles.length > 0) {
    bullets.push(`Created ${newFiles.length} new file${newFiles.length > 1 ? "s" : ""}`);
  }
  if (modifiedFiles.length > 0) {
    bullets.push(`Modified ${modifiedFiles.length} existing file${modifiedFiles.length > 1 ? "s" : ""}`);
  }

  // Tool usage summary
  const toolCalls = events.filter((e) => e.type === "tool_call");
  const toolTypes = new Map<string, number>();
  toolCalls.forEach((e) => {
    const toolName = e.data.toolName || "unknown";
    toolTypes.set(toolName, (toolTypes.get(toolName) || 0) + 1);
  });

  // Add notable tool usages
  const bashCount = toolTypes.get("bash") || toolTypes.get("Bash") || 0;
  if (bashCount > 0) {
    bullets.push(`Executed ${bashCount} shell command${bashCount > 1 ? "s" : ""}`);
  }

  const taskCount = toolTypes.get("task") || toolTypes.get("Task") || 0;
  if (taskCount > 0) {
    bullets.push(`Spawned ${taskCount} sub-agent${taskCount > 1 ? "s" : ""}`);
  }

  // If no bullets, add a default
  if (bullets.length === 0 && events.length > 0) {
    bullets.push("Processing your request...");
  }

  return bullets;
}

/**
 * Convert file changes to summary format
 */
function convertFileChanges(fileChangeArray: FileChange[]): AgentFileSummary[] {
  return fileChangeArray.map((file) => ({
    path: file.path,
    fileName: file.path.split("/").pop() || file.path,
    additions: file.additions,
    deletions: file.deletions,
    status: file.isNew ? "created" : "modified",
  }));
}

// ============================================================================
// Main Hook
// ============================================================================

export function useAgentSummary({
  events,
  fileChangeArray,
  plan,
  isStreaming,
  taskPrompt,
}: UseAgentSummaryOptions): AgentSummary {
  return useMemo(() => {
    const executionTime = calculateExecutionTime(events, isStreaming);
    const convertedPlan = convertPlan(plan);
    const summary = generateSummaryBullets(events, fileChangeArray, convertedPlan);
    const files = convertFileChanges(fileChangeArray);

    return {
      executionTime,
      plan: convertedPlan,
      summary,
      files,
      isStreaming,
      taskPrompt,
    };
  }, [events, fileChangeArray, plan, isStreaming, taskPrompt]);
}

/**
 * Hook for just the execution time (for separate display)
 */
export function useExecutionTime(events: WorkflowStreamEvent[], isStreaming: boolean = false) {
  return useMemo(() => calculateExecutionTime(events, isStreaming), [events, isStreaming]);
}
