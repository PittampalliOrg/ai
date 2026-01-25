"use client";

/**
 * useWorkflowsByName Hook
 *
 * Fetches workflows filtered by appId and workflowName,
 * providing stats and execution lists for the workflow name detail page.
 */

import { useMemo } from "react";
import { useDaprWorkflows } from "./use-dapr-workflows";
import type { WorkflowNameStats, WorkflowListItem } from "@/lib/types/workflow-ui";

// ============================================================================
// Types
// ============================================================================

export interface UseWorkflowsByNameOptions {
  appId: string;
  workflowName: string;
  latestCount?: number;
}

export interface UseWorkflowsByNameReturn {
  stats: WorkflowNameStats | null;
  executions: WorkflowListItem[];
  latestExecutions: WorkflowListItem[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  mutate: () => void;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to get workflows filtered by appId and workflowName
 *
 * @param options - Filter options including appId and workflowName
 * @param refreshInterval - Refresh interval in milliseconds (default: 5000)
 */
export function useWorkflowsByName(
  options: UseWorkflowsByNameOptions,
  refreshInterval = 5000
): UseWorkflowsByNameReturn {
  const { appId, workflowName, latestCount = 5 } = options;

  // Get all workflows using existing hook
  const { workflows, isLoading, isError, error, mutate } = useDaprWorkflows(
    undefined, // Don't filter yet, we need to filter by name ourselves
    refreshInterval
  );

  // Filter by workflowType (name) and appId, calculate stats
  const { stats, executions, latestExecutions } = useMemo(() => {
    if (!workflows.length || !workflowName || !appId) {
      return { stats: null, executions: [], latestExecutions: [] };
    }

    // Filter workflows by workflowType and appId
    const filtered = workflows.filter(
      (w) => w.workflowType === workflowName && w.appId === appId
    );

    if (!filtered.length) {
      return { stats: null, executions: [], latestExecutions: [] };
    }

    // Calculate stats
    const stats: WorkflowNameStats = {
      name: workflowName,
      appId,
      totalExecutions: filtered.length,
      runningCount: 0,
      successCount: 0,
      failedCount: 0,
    };

    for (const workflow of filtered) {
      switch (workflow.status) {
        case "RUNNING":
          stats.runningCount++;
          break;
        case "COMPLETED":
          stats.successCount++;
          break;
        case "FAILED":
        case "TERMINATED":
          stats.failedCount++;
          break;
      }
    }

    // Sort by start time descending (most recent first) - already sorted from hook
    // Get latest N executions
    const latestExecutions = filtered.slice(0, latestCount);

    return {
      stats,
      executions: filtered,
      latestExecutions,
    };
  }, [workflows, workflowName, appId, latestCount]);

  return {
    stats,
    executions,
    latestExecutions,
    isLoading,
    isError,
    error,
    mutate,
  };
}
