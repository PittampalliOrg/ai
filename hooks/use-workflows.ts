"use client";

/**
 * Workflow Data Hooks
 *
 * SWR-based hooks for fetching workflow data with automatic refresh.
 */

import useSWR from "swr";
import type {
  WorkflowListResponse,
  WorkflowListItem,
  WorkflowEntry,
} from "@/lib/types/workflow";

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
// useWorkflows Hook
// ============================================================================

export interface UseWorkflowsReturn {
  workflows: WorkflowListItem[];
  total: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  mutate: () => void;
}

/**
 * Hook to fetch the list of all workflows
 *
 * @param refreshInterval - Refresh interval in milliseconds (default: 5000)
 */
export function useWorkflows(refreshInterval = 5000): UseWorkflowsReturn {
  const { data, error, isLoading, mutate } = useSWR<WorkflowListResponse>(
    "/api/workflows",
    fetcher,
    {
      refreshInterval,
      revalidateOnFocus: true,
      dedupingInterval: 2000,
    }
  );

  return {
    workflows: data?.workflows ?? [],
    total: data?.total ?? 0,
    isLoading,
    isError: !!error,
    error: error ?? null,
    mutate,
  };
}

// ============================================================================
// useWorkflow Hook
// ============================================================================

export interface UseWorkflowReturn {
  workflow: WorkflowEntry | null;
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
 * Hook to fetch a single workflow by instance ID
 *
 * @param instanceId - The workflow instance ID
 * @param refreshInterval - Refresh interval in milliseconds (default: 3000)
 */
export function useWorkflow(
  instanceId: string | null | undefined,
  refreshInterval = 3000
): UseWorkflowReturn {
  const { data, error, isLoading, mutate } = useSWR<WorkflowDetailAPIResponse>(
    instanceId ? `/api/workflows/${encodeURIComponent(instanceId)}` : null,
    fetcher,
    {
      refreshInterval,
      revalidateOnFocus: true,
      dedupingInterval: 1000,
    }
  );

  return {
    workflow: data?.workflow ?? null,
    isLoading,
    isError: !!error,
    error: error ?? null,
    mutate,
  };
}

// ============================================================================
// useWorkflowStatus Hook
// ============================================================================

/**
 * Workflow status response from planner-agent
 */
export interface WorkflowStatus {
  success: boolean;
  instance_id: string;
  runtime_status: string | null;
  custom_status: {
    phase?: string;
    progress?: number;
    message?: string;
    plan_id?: string;
    tasks_completed?: number;
    tasks_total?: number;
    [key: string]: unknown;
  } | null;
  created_at: string | null;
  last_updated_at: string | null;
  error: string | null;
}

export interface UseWorkflowStatusReturn {
  status: WorkflowStatus | null;
  phase: string | null;
  progress: number | null;
  message: string | null;
  runtimeStatus: string | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  mutate: () => void;
}

/**
 * Hook to fetch deterministic workflow status from the planner-agent
 *
 * This provides the custom_status set via ctx.set_custom_status() in the workflow,
 * which includes phase, progress, and message fields.
 *
 * @param instanceId - The workflow instance ID
 * @param refreshInterval - Refresh interval in milliseconds (default: 2000)
 */
export function useWorkflowStatus(
  instanceId: string | null | undefined,
  refreshInterval = 2000
): UseWorkflowStatusReturn {
  const { data, error, isLoading, mutate } = useSWR<WorkflowStatus>(
    instanceId ? `/api/workflows/${encodeURIComponent(instanceId)}/status` : null,
    fetcher,
    {
      refreshInterval,
      revalidateOnFocus: false,
      dedupingInterval: 1000,
      // Don't retry on error - status endpoint may not be available
      errorRetryCount: 1,
      errorRetryInterval: 5000,
    }
  );

  // Extract commonly used fields
  const customStatus = data?.custom_status;

  return {
    status: data ?? null,
    phase: customStatus?.phase ?? null,
    progress: customStatus?.progress ?? null,
    message: customStatus?.message ?? null,
    runtimeStatus: data?.runtime_status ?? null,
    isLoading,
    isError: !!error || (data?.success === false && !!data?.error),
    error: error ?? (data?.success === false && data?.error ? new Error(data.error) : null),
    mutate,
  };
}
