"use client";

/**
 * useWorkflowNames Hook
 *
 * Aggregates workflow data by workflow type (name) and appId,
 * providing summary statistics for the "Workflow names" tab.
 */

import { useMemo } from "react";
import { useDaprWorkflows } from "./use-dapr-workflows";
import type { WorkflowNameStats } from "@/lib/types/workflow-ui";

// ============================================================================
// Types
// ============================================================================

export interface UseWorkflowNamesOptions {
  search?: string;
}

export interface UseWorkflowNamesReturn {
  workflowNames: WorkflowNameStats[];
  total: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  mutate: () => void;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to get aggregated workflow statistics by name
 *
 * @param options - Filter options
 * @param refreshInterval - Refresh interval in milliseconds (default: 5000)
 */
export function useWorkflowNames(
  options?: UseWorkflowNamesOptions,
  refreshInterval = 5000
): UseWorkflowNamesReturn {
  // Get all workflows using existing hook
  const { workflows, isLoading, isError, error, mutate } = useDaprWorkflows(
    undefined, // Don't filter yet, we need all workflows for aggregation
    refreshInterval
  );

  // Aggregate by workflowType + appId
  const { workflowNames, total } = useMemo(() => {
    if (!workflows.length) {
      return { workflowNames: [], total: 0 };
    }

    // Group by workflowType + appId
    const statsMap = new Map<string, WorkflowNameStats>();

    for (const workflow of workflows) {
      const key = `${workflow.workflowType}:${workflow.appId}`;

      if (!statsMap.has(key)) {
        statsMap.set(key, {
          name: workflow.workflowType,
          appId: workflow.appId,
          totalExecutions: 0,
          runningCount: 0,
          successCount: 0,
          failedCount: 0,
        });
      }

      const stats = statsMap.get(key)!;
      stats.totalExecutions++;

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

    // Convert to array and sort by total executions (descending)
    let result = Array.from(statsMap.values()).sort(
      (a, b) => b.totalExecutions - a.totalExecutions
    );

    // Apply search filter if provided
    if (options?.search) {
      const searchLower = options.search.toLowerCase();
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(searchLower) ||
          item.appId.toLowerCase().includes(searchLower)
      );
    }

    return {
      workflowNames: result,
      total: result.length,
    };
  }, [workflows, options?.search]);

  return {
    workflowNames,
    total,
    isLoading,
    isError,
    error,
    mutate,
  };
}
