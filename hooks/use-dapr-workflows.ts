"use client";

/**
 * Dapr Workflow Data Hooks
 *
 * SWR-based hooks for fetching workflow data with UI-compatible transforms.
 */

import { useMemo } from "react";
import useSWR from "swr";
import type {
  WorkflowListResponse,
  WorkflowEntry,
} from "@/lib/types/workflow";
import type {
  WorkflowUIStatus,
  WorkflowListItem,
  WorkflowDetail,
  WorkflowFilters,
} from "@/lib/types/workflow-ui";
import {
  transformWorkflowListItem,
  toWorkflowDetail,
  applyWorkflowFilters,
} from "@/lib/transforms/workflow-ui";

// ============================================================================
// Fetcher
// ============================================================================

const fetcher = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Failed to fetch: ${response.statusText}`);
  }

  return response.json();
};

// ============================================================================
// useDaprWorkflows Hook
// ============================================================================

export interface UseDaprWorkflowsOptions {
  search?: string;
  status?: WorkflowUIStatus[];
  appId?: string;
}

export interface UseDaprWorkflowsReturn {
  workflows: WorkflowListItem[];
  total: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  mutate: () => void;
}

/**
 * Hook to fetch the list of all workflows with UI-compatible format
 *
 * @param options - Filter options
 * @param refreshInterval - Refresh interval in milliseconds (default: 5000)
 */
export function useDaprWorkflows(
  options?: UseDaprWorkflowsOptions,
  refreshInterval = 5000
): UseDaprWorkflowsReturn {
  const { data, error, isLoading, mutate } = useSWR<WorkflowListResponse>(
    "/api/workflows",
    fetcher,
    {
      refreshInterval,
      revalidateOnFocus: true,
      dedupingInterval: 2000,
    }
  );

  // Transform and filter workflows
  const { workflows, total } = useMemo(() => {
    if (!data?.workflows) {
      return { workflows: [], total: 0 };
    }

    // Transform to UI format
    const transformedWorkflows = data.workflows.map(transformWorkflowListItem);

    // Sort by start time descending (most recent first)
    transformedWorkflows.sort(
      (a, b) =>
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );

    // Apply filters
    const filters: WorkflowFilters = {
      search: options?.search,
      status: options?.status,
      appId: options?.appId,
    };

    const filtered = applyWorkflowFilters(transformedWorkflows, filters);

    return {
      workflows: filtered,
      total: filtered.length,
    };
  }, [data, options?.search, options?.status, options?.appId]);

  return {
    workflows,
    total,
    isLoading,
    isError: !!error,
    error: error ?? null,
    mutate,
  };
}

// ============================================================================
// useDaprWorkflow Hook
// ============================================================================

export interface UseDaprWorkflowReturn {
  workflow: WorkflowDetail | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  mutate: () => void;
}

/**
 * API response type for workflow detail
 */
interface WorkflowDetailAPIResponse {
  workflow: WorkflowEntry;
}

/**
 * Hook to fetch a single workflow by instance ID with UI-compatible format
 *
 * @param appId - The app ID (unused for now, but included for URL structure)
 * @param instanceId - The workflow instance ID
 * @param refreshInterval - Refresh interval in milliseconds (default: 3000)
 */
export function useDaprWorkflow(
  appId: string | null | undefined,
  instanceId: string | null | undefined,
  refreshInterval = 3000
): UseDaprWorkflowReturn {
  const { data, error, isLoading, mutate } = useSWR<WorkflowDetailAPIResponse>(
    instanceId ? `/api/workflows/${encodeURIComponent(instanceId)}` : null,
    fetcher,
    {
      refreshInterval,
      revalidateOnFocus: true,
      dedupingInterval: 1000,
    }
  );

  // Transform to UI format
  const workflow = useMemo(() => {
    if (!data?.workflow) return null;
    return toWorkflowDetail(data.workflow);
  }, [data]);

  return {
    workflow,
    isLoading,
    isError: !!error,
    error: error ?? null,
    mutate,
  };
}
