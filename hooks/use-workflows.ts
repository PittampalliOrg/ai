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

export interface WorkflowStatusResponse {
  phase: string | null;
  progress: number | null;
  message: string | null;
  runtimeStatus: string | null;
}

export interface UseWorkflowStatusReturn extends WorkflowStatusResponse {
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  mutate: () => void;
}

/**
 * API response from status endpoint has nested structure
 */
interface WorkflowStatusAPIResponse {
  success: boolean;
  instance_id: string;
  runtime_status: string | null;
  custom_status: {
    phase?: string;
    progress?: number;
    message?: string;
    [key: string]: unknown;
  } | null;
  created_at: string | null;
  last_updated_at: string | null;
  error: string | null;
}

/**
 * Custom fetcher that transforms nested API response to flat format
 */
const statusFetcher = async (url: string): Promise<WorkflowStatusResponse> => {
  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Failed to fetch: ${response.statusText}`);
  }

  const data: WorkflowStatusAPIResponse = await response.json();

  // Transform nested structure to flat format expected by hook consumers
  return {
    phase: data.custom_status?.phase ?? null,
    progress: data.custom_status?.progress ?? null,
    message: data.custom_status?.message ?? null,
    runtimeStatus: data.runtime_status ?? null,
  };
};

/**
 * Hook to fetch workflow status by instance ID
 * Returns phase, progress, message, and runtime status
 *
 * @param instanceId - The workflow instance ID
 * @param refreshInterval - Refresh interval in milliseconds (default: 2000)
 */
export function useWorkflowStatus(
  instanceId: string | null | undefined,
  refreshInterval = 2000
): UseWorkflowStatusReturn {
  const { data, error, isLoading, mutate } = useSWR<WorkflowStatusResponse>(
    instanceId ? `/api/workflows/${encodeURIComponent(instanceId)}/status` : null,
    statusFetcher,
    {
      refreshInterval,
      revalidateOnFocus: true,
      dedupingInterval: 1000,
    }
  );

  return {
    phase: data?.phase ?? null,
    progress: data?.progress ?? null,
    message: data?.message ?? null,
    runtimeStatus: data?.runtimeStatus ?? null,
    isLoading,
    isError: !!error,
    error: error ?? null,
    mutate,
  };
}
