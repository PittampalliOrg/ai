"use client";

/**
 * Start Workflow Hook
 *
 * Hook for starting a Dapr workflow and linking it to an agent session.
 * Handles the API call and session update.
 */

import { useState, useCallback } from "react";

interface StartWorkflowOptions {
  autoApprove?: boolean;
  workingDirectory?: string;
}

interface StartWorkflowResult {
  success: boolean;
  workflowId?: string;
  error?: string;
}

interface UseStartWorkflowReturn {
  startWorkflow: (
    task: string,
    sessionId: string,
    options?: StartWorkflowOptions
  ) => Promise<StartWorkflowResult>;
  isStarting: boolean;
  error: string | null;
}

/**
 * Hook for starting a workflow and linking it to a session
 */
export function useStartWorkflow(): UseStartWorkflowReturn {
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startWorkflow = useCallback(
    async (
      task: string,
      sessionId: string,
      options?: StartWorkflowOptions
    ): Promise<StartWorkflowResult> => {
      setIsStarting(true);
      setError(null);

      try {
        // 1. Start the workflow
        const workflowResponse = await fetch("/api/workflows/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task, options }),
        });

        if (!workflowResponse.ok) {
          const data = await workflowResponse.json();
          const errorMsg = data.error || "Failed to start workflow";
          setError(errorMsg);
          return { success: false, error: errorMsg };
        }

        const workflowData = await workflowResponse.json();
        const workflowId = workflowData.workflowId;

        if (!workflowId) {
          const errorMsg = "No workflow ID returned from server";
          setError(errorMsg);
          return { success: false, error: errorMsg };
        }

        // 2. Link the workflow to the session
        const linkResponse = await fetch(`/api/agent/sessions/${sessionId}/workflow`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workflowId,
            workflowStatus: "pending",
          }),
        });

        if (!linkResponse.ok) {
          console.warn("Failed to link workflow to session, but workflow was started");
        }

        return { success: true, workflowId };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsStarting(false);
      }
    },
    []
  );

  return {
    startWorkflow,
    isStarting,
    error,
  };
}

/**
 * Start a workflow directly (non-hook version)
 * Useful for server actions or one-off calls
 */
export async function startWorkflowDirect(
  task: string,
  options?: StartWorkflowOptions
): Promise<StartWorkflowResult> {
  try {
    const response = await fetch("/api/workflows/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, options }),
    });

    if (!response.ok) {
      const data = await response.json();
      return { success: false, error: data.error || "Failed to start workflow" };
    }

    const data = await response.json();
    return { success: true, workflowId: data.workflowId };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
