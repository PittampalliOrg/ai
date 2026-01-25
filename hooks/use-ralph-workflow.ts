"use client";

/**
 * Ralph Workflow Hook
 *
 * Client-side state management for Ralph Loop workflows.
 * Polls the workflow status and provides actions for user interaction.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  type TaskPlan,
  type TaskPlanStatus,
  type TaskPlanItem,
  getPlanStats,
} from "@/lib/types/ralph-plan";

// ============================================================================
// Types
// ============================================================================

export interface RalphWorkflowState {
  /** Whether the hook is loading initial data */
  isLoading: boolean;
  /** Whether a workflow is currently active */
  isActive: boolean;
  /** Error message if any */
  error: string | null;
  /** The current plan (if any) */
  plan: TaskPlan | null;
  /** Workflow runtime status from Dapr */
  workflowStatus: string | null;
  /** Plan statistics */
  stats: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
    inProgress: number;
    skipped: number;
    percentComplete: number;
  } | null;
}

export interface UseRalphWorkflowOptions {
  /** Session ID to monitor */
  sessionId: string;
  /** Polling interval in milliseconds (default: 2000) */
  pollInterval?: number;
  /** Whether to auto-start polling (default: true) */
  autoStart?: boolean;
  /** Callback when plan changes */
  onPlanChange?: (plan: TaskPlan | null) => void;
  /** Callback when workflow completes */
  onComplete?: (plan: TaskPlan) => void;
  /** Callback when workflow fails */
  onError?: (error: string) => void;
}

export interface UseRalphWorkflowReturn extends RalphWorkflowState {
  /** Start the workflow with a prompt */
  startWorkflow: (prompt: string, targetRepo: {
    owner: string;
    repo: string;
    branch: string;
    installationId?: string;
  }) => Promise<boolean>;
  /** Accept the current plan and start execution */
  acceptPlan: () => Promise<boolean>;
  /** Provide feedback to iterate on the plan */
  submitFeedback: (feedback: string) => Promise<boolean>;
  /** Refresh the workflow status */
  refresh: () => Promise<void>;
  /** Start polling */
  startPolling: () => void;
  /** Stop polling */
  stopPolling: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useRalphWorkflow(
  options: UseRalphWorkflowOptions
): UseRalphWorkflowReturn {
  const {
    sessionId,
    pollInterval = 2000,
    autoStart = true,
    onPlanChange,
    onComplete,
    onError,
  } = options;

  // State
  const [state, setState] = useState<RalphWorkflowState>({
    isLoading: true,
    isActive: false,
    error: null,
    plan: null,
    workflowStatus: null,
    stats: null,
  });

  // Refs for callbacks (to avoid stale closures)
  const onPlanChangeRef = useRef(onPlanChange);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const lastPlanStatusRef = useRef<TaskPlanStatus | null>(null);

  // Update refs when callbacks change
  useEffect(() => {
    onPlanChangeRef.current = onPlanChange;
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
  }, [onPlanChange, onComplete, onError]);

  // Fetch workflow status
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/ralph/status?sessionId=${encodeURIComponent(sessionId)}`
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to fetch workflow status");
      }

      const data = await response.json();

      setState((prev) => {
        const newPlan = data.plan || null;
        const newStatus = data.workflowStatus || null;
        const isActive =
          newStatus === "RUNNING" ||
          newStatus === "PENDING" ||
          (newPlan && !["completed", "failed"].includes(newPlan.status));

        // Trigger callbacks if plan status changed
        if (newPlan && newPlan.status !== lastPlanStatusRef.current) {
          lastPlanStatusRef.current = newPlan.status;
          onPlanChangeRef.current?.(newPlan);

          if (newPlan.status === "completed") {
            onCompleteRef.current?.(newPlan);
          } else if (newPlan.status === "failed") {
            onErrorRef.current?.("Plan execution failed");
          }
        }

        return {
          isLoading: false,
          isActive,
          error: null,
          plan: newPlan,
          workflowStatus: newStatus,
          stats: data.stats || null,
        };
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }));
    }
  }, [sessionId]);

  // Start polling
  const startPolling = useCallback(() => {
    if (pollingRef.current) return;

    pollingRef.current = setInterval(() => {
      fetchStatus();
    }, pollInterval);
  }, [fetchStatus, pollInterval]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Start workflow
  const startWorkflow = useCallback(
    async (
      prompt: string,
      targetRepo: {
        owner: string;
        repo: string;
        branch: string;
        installationId?: string;
      }
    ): Promise<boolean> => {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        const response = await fetch("/api/ralph/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            prompt,
            targetRepository: targetRepo,
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to start workflow");
        }

        setState((prev) => ({
          ...prev,
          isLoading: false,
          isActive: true,
          workflowStatus: "RUNNING",
        }));

        // Start polling for updates
        startPolling();

        return true;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : "Unknown error",
        }));
        return false;
      }
    },
    [sessionId, startPolling]
  );

  // Accept plan
  const acceptPlan = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/ralph/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          accepted: true,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to accept plan");
      }

      // Refresh status immediately
      await fetchStatus();
      return true;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Unknown error",
      }));
      return false;
    }
  }, [sessionId, fetchStatus]);

  // Submit feedback
  const submitFeedback = useCallback(
    async (feedback: string): Promise<boolean> => {
      try {
        const response = await fetch("/api/ralph/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            accepted: false,
            feedback,
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to submit feedback");
        }

        // Refresh status immediately
        await fetchStatus();
        return true;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : "Unknown error",
        }));
        return false;
      }
    },
    [sessionId, fetchStatus]
  );

  // Initial fetch and auto-polling
  useEffect(() => {
    fetchStatus();

    if (autoStart) {
      startPolling();
    }

    return () => {
      stopPolling();
    };
  }, [fetchStatus, autoStart, startPolling, stopPolling]);

  // Stop polling when workflow is no longer active
  useEffect(() => {
    if (!state.isActive && pollingRef.current) {
      stopPolling();
    }
  }, [state.isActive, stopPolling]);

  return {
    ...state,
    startWorkflow,
    acceptPlan,
    submitFeedback,
    refresh: fetchStatus,
    startPolling,
    stopPolling,
  };
}

// ============================================================================
// Helper Components/Hooks
// ============================================================================

/**
 * Get a display-friendly status label
 */
export function getPlanStatusLabel(status: TaskPlanStatus): string {
  switch (status) {
    case "draft":
      return "Planning";
    case "iterating":
      return "Iterating";
    case "accepted":
      return "Accepted";
    case "executing":
      return "Executing";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "paused":
      return "Paused";
    default:
      return "Unknown";
  }
}

/**
 * Get a display-friendly item status label
 */
export function getItemStatusLabel(
  status: TaskPlanItem["status"]
): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "in_progress":
      return "In Progress";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
    default:
      return "Unknown";
  }
}

/**
 * Get status color class
 */
export function getStatusColor(
  status: TaskPlanStatus | TaskPlanItem["status"]
): string {
  switch (status) {
    case "completed":
      return "text-green-600 dark:text-green-400";
    case "failed":
      return "text-red-600 dark:text-red-400";
    case "in_progress":
    case "executing":
      return "text-blue-600 dark:text-blue-400";
    case "pending":
    case "draft":
    case "iterating":
      return "text-yellow-600 dark:text-yellow-400";
    case "skipped":
    case "paused":
      return "text-gray-500 dark:text-gray-400";
    default:
      return "text-gray-600 dark:text-gray-400";
  }
}
