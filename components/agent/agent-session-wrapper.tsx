"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AgentSessionHeader } from "./agent-session-header";
import { CreatePRDialog } from "./create-pr-dialog";
import { toast } from "sonner";
import { useAgentExecutionContextOptional } from "@/contexts/agent-execution-context";
import { useWorkflowExecutionOptional } from "@/contexts/workflow-execution-context";
import { useWorkflowStatus } from "@/hooks/use-workflows";

interface AgentSessionWrapperProps {
  sessionId: string;
  title: string;
  status: "idle" | "running" | "completed" | "error";
  createdAt: Date;
  repositoryOwner?: string;
  repositoryName?: string;
  branchName?: string;
  additions?: number;
  deletions?: number;
  children: React.ReactNode;
}

export function AgentSessionWrapper({
  sessionId,
  title,
  status: initialStatus,
  createdAt,
  repositoryOwner,
  repositoryName,
  branchName,
  additions: initialAdditions = 0,
  deletions: initialDeletions = 0,
  children,
}: AgentSessionWrapperProps) {
  const router = useRouter();
  const [showPRDialog, setShowPRDialog] = useState(false);

  // Support both legacy AgentExecutionContext and new WorkflowExecutionContext
  const agentContext = useAgentExecutionContextOptional();
  const workflowContext = useWorkflowExecutionOptional();

  // Fetch workflow status from backend (deterministic source of truth)
  const { phase: statusPhase, runtimeStatus } = useWorkflowStatus(
    workflowContext?.workflowId,
    2000
  );

  // Derive execution status from backend status (more reliable than SSE-only)
  const derivedStatus = useMemo(() => {
    const normalizedStatusPhase = statusPhase?.toLowerCase() || "";
    const normalizedRuntimeStatus = runtimeStatus?.toUpperCase() || "";

    // Check if workflow is complete based on backend status
    const isWorkflowComplete =
      normalizedRuntimeStatus === "COMPLETED" ||
      normalizedRuntimeStatus === "FAILED" ||
      normalizedRuntimeStatus === "REJECTED" ||
      normalizedStatusPhase === "completed" ||
      normalizedStatusPhase === "failed" ||
      normalizedStatusPhase === "tests_failed" ||
      normalizedStatusPhase === "rejected";

    if (isWorkflowComplete) {
      // Map to error status for failed/rejected states
      if (
        normalizedRuntimeStatus === "FAILED" ||
        normalizedRuntimeStatus === "REJECTED" ||
        normalizedStatusPhase === "failed" ||
        normalizedStatusPhase === "tests_failed" ||
        normalizedStatusPhase === "rejected"
      ) {
        return "error" as const;
      }
      return "completed" as const;
    }

    // Check if awaiting approval - show "idle" instead of "running" since nothing is actively processing
    const isAwaitingApproval = normalizedStatusPhase === "awaiting_approval" ||
      normalizedRuntimeStatus === "AWAITING_APPROVAL";
    if (isAwaitingApproval) {
      return "idle" as const;
    }

    // Fall back to context execution status
    return workflowContext?.executionStatus ?? ("idle" as const);
  }, [statusPhase, runtimeStatus, workflowContext?.executionStatus]);

  // Get stats from whichever context is available
  const agentStats = agentContext?.stats;
  const workflowStats = workflowContext
    ? {
        additions: workflowContext.fileChangeStats.additions,
        deletions: workflowContext.fileChangeStats.deletions,
        status: derivedStatus,
      }
    : null;

  const stats = workflowStats || agentStats || { additions: 0, deletions: 0, status: "idle" as const };

  // Use context stats if available, otherwise fall back to props
  const additions = stats.additions > 0 ? stats.additions : initialAdditions;
  const deletions = stats.deletions > 0 ? stats.deletions : initialDeletions;
  const status = stats.status !== "idle" ? stats.status : initialStatus;

  const handleCreatePR = async (data: {
    title: string;
    body: string;
    baseBranch: string;
  }) => {
    // TODO: Implement actual PR creation via API
    // For now, show a toast indicating this feature is coming soon
    try {
      const response = await fetch("/api/agent/create-pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          repositoryOwner,
          repositoryName,
          branchName,
          ...data,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create pull request");
      }

      const result = await response.json();
      toast.success("Pull request created!", {
        description: `PR #${result.number} has been created`,
        action: {
          label: "View",
          onClick: () => window.open(result.url, "_blank"),
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("not implemented")) {
        toast.info("Coming soon", {
          description: "Pull request creation is not yet implemented",
        });
        return;
      }
      throw error;
    }
  };

  const handleArchive = async () => {
    // TODO: Implement archive functionality
    toast.info("Coming soon", {
      description: "Archive functionality is not yet implemented",
    });
  };

  const handleShare = async () => {
    // Copy the current URL to clipboard
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied!", {
        description: "Task URL copied to clipboard",
      });
    } catch {
      toast.error("Failed to copy link");
    }
  };

  return (
    <>
      <AgentSessionHeader
        title={title}
        status={status}
        createdAt={createdAt}
        repositoryOwner={repositoryOwner}
        repositoryName={repositoryName}
        branchName={branchName}
        additions={additions}
        deletions={deletions}
        onCreatePR={() => setShowPRDialog(true)}
        onArchive={handleArchive}
        onShare={handleShare}
      />

      {children}

      <CreatePRDialog
        open={showPRDialog}
        onOpenChange={setShowPRDialog}
        repositoryOwner={repositoryOwner}
        repositoryName={repositoryName}
        branchName={branchName}
        defaultTitle={title}
        defaultBody={`## Summary\n\nChanges made by AI agent.\n\n## Changes\n\n- ${title}`}
        onSubmit={handleCreatePR}
      />
    </>
  );
}
