"use client";

/**
 * Agent Workflow View Component
 *
 * Main container that composes all agent workflow UI pieces:
 * - AgentSummaryPanel (left panel) - Structured summaries using AI Elements
 * - AgentDetailPanel (right panel, toggleable) - Diff/Logs tabs
 * - WorkflowActivityPanel (right panel fallback) - Phase progress, approval, status
 *
 * Layout matches Codex UI pattern:
 * - Left panel (400px): Request, Time, Plan, Summary, Files, Input
 * - Right panel (flex-1): Workflow activity or Diff/Logs tabs
 */

import { memo, useMemo, useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useWorkflowExecution } from "@/contexts/workflow-execution-context";
import { useWorkflow, useWorkflowStatus } from "@/hooks/use-workflows";
import { useAgentSummary } from "@/hooks/use-agent-summary";
import { useAgentStream } from "@/hooks/use-agent-stream";
import { useExecutionChanges } from "@/hooks/use-execution-changes";

// Components
import { derivePhase, AgentPhaseIndicator } from "./agent-phase-indicator";
import { AgentSummaryPanel } from "./agent-summary-panel";
import { AgentDetailPanel, type DetailTabType } from "./agent-detail-panel";
import { PlanApprovalSection } from "./plan-approval-section";

interface AgentWorkflowViewProps {
  taskPrompt?: string | null;
  className?: string;
}

export const AgentWorkflowView = memo(function AgentWorkflowView({
  taskPrompt: externalTaskPrompt,
  className,
}: AgentWorkflowViewProps) {
  const {
    workflowId,
    taskPrompt: contextTaskPrompt,
    events,
    accumulatedText,
    executionStatus,
    fileChanges,
    fileChangeArray,
    logs,
    isConnected,
  } = useWorkflowExecution();

  // Fetch workflow detail for plan information
  const { workflow, mutate: mutateWorkflow } = useWorkflow(workflowId, 3000);

  // Fetch workflow status via REST polling (deterministic source of truth)
  const {
    phase: statusPhase,
    progress,
    message: statusMessage,
    runtimeStatus,
    mutate: mutateWorkflowStatus,
  } = useWorkflowStatus(workflowId, 2000);

  // Derive agent-specific state
  // Use REST-polled status as primary source, fall back to SSE events
  const phase = useMemo(() => derivePhase(events), [events]);
  const normalizedStatusPhase = statusPhase?.toLowerCase() || "";
  const normalizedRuntimeStatus = runtimeStatus?.toUpperCase() || "";
  const hasBackendWorkflowState = Boolean(normalizedStatusPhase || normalizedRuntimeStatus);
  const isBackendAwaitingApproval =
    normalizedStatusPhase === "awaiting_approval" ||
    normalizedRuntimeStatus === "AWAITING_APPROVAL";
  const [approvalTransitionPending, setApprovalTransitionPending] = useState(false);
  const isAwaitingApproval = approvalTransitionPending
    ? false
    : hasBackendWorkflowState
      ? isBackendAwaitingApproval
      : phase === "approve";

  // Workflow is complete when runtimeStatus is COMPLETED/FAILED/REJECTED, or phase indicates completion
  const isWorkflowComplete =
    normalizedRuntimeStatus === "COMPLETED" ||
    normalizedRuntimeStatus === "FAILED" ||
    normalizedRuntimeStatus === "REJECTED" ||
    normalizedStatusPhase === "completed" ||
    normalizedStatusPhase === "failed" ||
    normalizedStatusPhase === "tests_failed" ||
    normalizedStatusPhase === "rejected";

  useEffect(() => {
    if (!approvalTransitionPending) {
      return;
    }

    if (!isBackendAwaitingApproval || isWorkflowComplete) {
      setApprovalTransitionPending(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setApprovalTransitionPending(false);
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [approvalTransitionPending, isBackendAwaitingApproval, isWorkflowComplete]);

  const isWorkflowActive = !!statusPhase && !isWorkflowComplete;
  const isStreaming = executionStatus === "running" && accumulatedText.length > 0;

  // Real-time agent activity stream (LLM tokens, tool calls, sandbox output)
  const agentStream = useAgentStream({
    executionId: workflowId,
    enabled: !!workflowId,
  });
  const durableExecutionChanges = useExecutionChanges({
    executionId: workflowId,
    refreshInterval: isWorkflowComplete ? 0 : 3000,
  });

  // Override executionStatus based on backend status (more reliable)
  const derivedExecutionStatus = useMemo(() => {
    if (isWorkflowComplete) {
      // Check if it's an error state
      if (normalizedRuntimeStatus === "FAILED" ||
          normalizedStatusPhase === "failed" ||
          normalizedStatusPhase === "tests_failed") {
        return "error" as const;
      }
      if (normalizedRuntimeStatus === "REJECTED" || normalizedStatusPhase === "rejected") {
        return "error" as const;
      }
      return "completed" as const;
    }
    // Check if awaiting approval - show "idle" instead of "running" since nothing is actively processing
    if (isAwaitingApproval) {
      return "idle" as const;
    }
    // Fall back to stream-derived status
    return executionStatus;
  }, [isWorkflowComplete, normalizedRuntimeStatus, normalizedStatusPhase, executionStatus, isAwaitingApproval]);

  const taskPrompt = externalTaskPrompt ?? contextTaskPrompt;
  const effectiveFileChanges =
    durableExecutionChanges.hasLoaded && durableExecutionChanges.fileChangeArray.length > 0
      ? durableExecutionChanges.fileChanges
      : fileChanges;
  const effectiveFileChangeArray =
    durableExecutionChanges.hasLoaded && durableExecutionChanges.fileChangeArray.length > 0
      ? durableExecutionChanges.fileChangeArray
      : fileChangeArray;

  // Use the agent summary hook
  const summary = useAgentSummary({
    events,
    fileChangeArray: effectiveFileChangeArray,
    plan: workflow?.plan,
    isStreaming,
    taskPrompt,
  });

  // Right panel state
  const [isDetailPanelOpen, setDetailPanelOpen] = useState(true);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTabType>("logs");

  // Chat input state
  const [inputValue, setInputValue] = useState("");

  // Handlers
  const handleFilesClick = useCallback(() => {
    setDetailPanelOpen(true);
    setActiveDetailTab("diff");
  }, []);

  const handleFollowUp = useCallback((message: string) => {
    console.log("Follow-up message:", message);
    // TODO: Integrate with workflow API to send follow-up messages
  }, []);

  const handleSubmit = useCallback(() => {
    if (!inputValue.trim()) return;
    handleFollowUp(inputValue.trim());
    setInputValue("");
  }, [inputValue, handleFollowUp]);

  const handleStop = useCallback(() => {
    console.log("Stop requested");
    // TODO: Integrate with workflow API to stop the current execution
  }, []);

  const handleCloseDetailPanel = useCallback(() => {
    setDetailPanelOpen(false);
  }, []);

  // Plan approval handlers
  const handlePlanApprove = useCallback(async () => {
    if (!workflowId) return;
    try {
      const response = await fetch(`/api/workflows/${workflowId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: true }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to approve plan");
      }

      setApprovalTransitionPending(true);
      await Promise.all([mutateWorkflow(), mutateWorkflowStatus()]);
    } catch (error) {
      console.error("Failed to approve plan:", error);
      throw error;
    }
  }, [mutateWorkflow, mutateWorkflowStatus, workflowId]);

  const handlePlanReject = useCallback(async () => {
    if (!workflowId) return;
    try {
      const response = await fetch(`/api/workflows/${workflowId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: false }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to reject plan");
      }

      setApprovalTransitionPending(true);
      await Promise.all([mutateWorkflow(), mutateWorkflowStatus()]);
    } catch (error) {
      console.error("Failed to reject plan:", error);
      throw error;
    }
  }, [mutateWorkflow, mutateWorkflowStatus, workflowId]);

  return (
    <div className={cn("flex h-full", className)}>
      {/* Left: Summary Panel (400px fixed) */}
      <div className="w-[400px] flex-shrink-0 border-r border-border">
        <AgentSummaryPanel
          summary={summary}
          workflowId={workflowId}
          isAwaitingApproval={isAwaitingApproval}
          isConnected={isConnected}
          executionStatus={derivedExecutionStatus}
          inputValue={inputValue}
          onInputChange={setInputValue}
          onSubmit={handleSubmit}
          onStop={handleStop}
          onFilesClick={handleFilesClick}
        />
      </div>

      {/* Right: Detail Panel (toggleable) */}
      {isDetailPanelOpen && (
        <div className="flex-1 overflow-hidden">
          <AgentDetailPanel
            activeTab={activeDetailTab}
            onTabChange={setActiveDetailTab}
            onClose={handleCloseDetailPanel}
            fileChanges={effectiveFileChanges}
            fileChangeArray={effectiveFileChangeArray}
            events={events}
            logs={logs}
            accumulatedText={accumulatedText}
            isStreaming={isStreaming}
            isConnected={isConnected}
            workflowId={workflowId}
            isWorkflowActive={isWorkflowActive}
            isAwaitingApproval={isAwaitingApproval}
            isDiffLoading={durableExecutionChanges.isLoading}
            hasDurableDiffs={durableExecutionChanges.hasLoaded}
            workflow={workflow}
            statusMessage={statusMessage}
            progress={progress}
            onPlanApprove={handlePlanApprove}
            onPlanReject={handlePlanReject}
            agentStream={agentStream}
          />
        </div>
      )}

      {/* Workflow Activity Panel - shows when detail panel is closed and workflow is active */}
      {!isDetailPanelOpen && isWorkflowActive && (
        <div className="flex-1 overflow-y-auto bg-background">
          <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
            {/* Phase Progress Indicator */}
            <div className="border border-border rounded-lg overflow-hidden">
              <AgentPhaseIndicator
                events={events}
                workflowId={workflowId}
              />
            </div>

            {/* Status Message */}
            {statusMessage && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-muted/30 border border-border">
                <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
                <p className="text-sm text-muted-foreground">{statusMessage}</p>
              </div>
            )}

            {/* Plan Approval Section (when awaiting approval) */}
            {isAwaitingApproval && (
              <div className="rounded-lg overflow-hidden border border-amber-500/30">
                <PlanApprovalSection
                  workflowId={workflowId}
                  planTitle={workflow?.plan?.title}
                  planSummary={workflow?.plan?.summary}
                  planSteps={workflow?.plan?.tasks?.map((t) => ({
                    id: t.id,
                    title: t.title,
                    description: t.description,
                  }))}
                  onApprove={handlePlanApprove}
                  onReject={handlePlanReject}
                />
              </div>
            )}

            {/* Workflow Info */}
            {workflow && (
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Workflow ID</span>
                  <span className="font-mono text-xs">{workflowId}</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Status</span>
                  <span className="capitalize">{workflow.status?.toLowerCase().replace(/_/g, " ")}</span>
                </div>
                {progress !== null && (
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Progress</span>
                    <span>{progress}%</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state when panel is closed, workflow inactive, but has content */}
      {!isDetailPanelOpen && !isWorkflowActive && (effectiveFileChangeArray.length > 0 || events.length > 0) && (
        <div className="flex-1 flex items-center justify-center bg-muted/30">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Click on "Files Changed" to view diffs
            </p>
            <p className="text-xs text-muted-foreground/70">
              or press <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">D</kbd> for diffs,{" "}
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">L</kbd> for logs
            </p>
          </div>
        </div>
      )}
    </div>
  );
});
