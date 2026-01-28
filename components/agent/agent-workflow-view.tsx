"use client";

/**
 * Agent Workflow View Component
 *
 * Main container that composes all agent workflow UI pieces:
 * - AgentSummaryPanel (left panel) - Structured summaries using AI Elements
 * - AgentDetailPanel (right panel, toggleable) - Diff/Logs tabs
 *
 * Layout matches Codex UI pattern:
 * - Left panel (400px): Request, Time, Plan, Summary, Files, Input
 * - Right panel (flex-1, toggleable): Diff | Logs
 */

import { memo, useMemo, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useWorkflowExecution } from "@/contexts/workflow-execution-context";
import { useWorkflow } from "@/hooks/use-workflows";
import { useAgentSummary } from "@/hooks/use-agent-summary";

// Components
import { derivePhase } from "./agent-phase-indicator";
import { AgentSummaryPanel } from "./agent-summary-panel";
import { AgentDetailPanel, type DetailTabType } from "./agent-detail-panel";

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
    fileChangeStats,
    logs,
    isConnected,
  } = useWorkflowExecution();

  // Fetch workflow detail for plan information
  const { workflow } = useWorkflow(workflowId, 3000);

  // Derive agent-specific state
  const phase = useMemo(() => derivePhase(events), [events]);
  const isAwaitingApproval = phase === "approve";
  const isStreaming = executionStatus === "running" && accumulatedText.length > 0;

  const taskPrompt = externalTaskPrompt ?? contextTaskPrompt;

  // Use the agent summary hook
  const summary = useAgentSummary({
    events,
    fileChangeArray,
    plan: workflow?.plan,
    isStreaming,
    taskPrompt,
  });

  // Right panel state
  const [isDetailPanelOpen, setDetailPanelOpen] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTabType>("diff");

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

  return (
    <div className={cn("flex h-full", className)}>
      {/* Left: Summary Panel (400px fixed) */}
      <div className="w-[400px] flex-shrink-0 border-r border-border">
        <AgentSummaryPanel
          summary={summary}
          workflowId={workflowId}
          isAwaitingApproval={isAwaitingApproval}
          isConnected={isConnected}
          executionStatus={executionStatus}
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
            fileChanges={fileChanges}
            fileChangeArray={fileChangeArray}
            fileStats={fileChangeStats}
            events={events}
            logs={logs}
            accumulatedText={accumulatedText}
            isStreaming={isStreaming}
            isConnected={isConnected}
          />
        </div>
      )}

      {/* Empty state when panel is closed but has content */}
      {!isDetailPanelOpen && (fileChangeArray.length > 0 || events.length > 0) && (
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
