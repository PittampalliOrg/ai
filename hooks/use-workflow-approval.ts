"use client";

/**
 * Hook for workflow approval operations
 */

import { useState, useCallback } from "react";

interface ApprovalResult {
  success: boolean;
  workflowId: string;
  status?: string;
  message?: string;
  error?: string;
}

interface UseWorkflowApprovalReturn {
  approve: (comments?: string) => Promise<ApprovalResult>;
  reject: (comments?: string) => Promise<ApprovalResult>;
  isApproving: boolean;
  error: string | null;
}

/**
 * Hook for approving or rejecting workflows
 *
 * @param workflowId - The workflow instance ID
 * @returns Approval functions and state
 */
export function useWorkflowApproval(
  workflowId: string | null
): UseWorkflowApprovalReturn {
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendApproval = useCallback(
    async (approved: boolean, comments?: string): Promise<ApprovalResult> => {
      if (!workflowId) {
        return {
          success: false,
          workflowId: "",
          error: "No workflow ID provided",
        };
      }

      setIsApproving(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/workflows/${encodeURIComponent(workflowId)}/approve`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              approved,
              comments,
            }),
          }
        );

        const result = await response.json();

        if (!response.ok) {
          const errorMessage = result.error || `Request failed: ${response.status}`;
          setError(errorMessage);
          return {
            success: false,
            workflowId,
            error: errorMessage,
          };
        }

        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        return {
          success: false,
          workflowId,
          error: errorMessage,
        };
      } finally {
        setIsApproving(false);
      }
    },
    [workflowId]
  );

  const approve = useCallback(
    (comments?: string) => sendApproval(true, comments),
    [sendApproval]
  );

  const reject = useCallback(
    (comments?: string) => sendApproval(false, comments),
    [sendApproval]
  );

  return {
    approve,
    reject,
    isApproving,
    error,
  };
}
