"use client";

/**
 * Agent Detail Panel Component
 *
 * Right panel showing Diff and Logs tabs for workflow execution details.
 * Uses AgentActivityTab for rich AI Elements rendering of workflow events.
 */

import { memo, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { XIcon } from "@/components/icons";
import type { WorkflowStreamEvent } from "@/hooks/use-workflow-stream";
import type { WorkflowLogEntry, FileChange } from "@/contexts/workflow-execution-context";
import { DiffView } from "./views/diff-view";
import type { WorkflowEntry } from "@/lib/types/workflow";
import { PlanApprovalSection } from "./plan-approval-section";
import { AgentActivityTab } from "./agent-activity-tab";
import { useTaskAggregation, type PlanStatus } from "@/hooks/use-task-aggregation";
import type { UseAgentStreamReturn } from "@/hooks/use-agent-stream";

// Export Workflow type alias for other components
export type Workflow = WorkflowEntry | null;

export type DetailTabType = "diff" | "logs";

interface AgentDetailPanelProps {
  activeTab: DetailTabType;
  onTabChange: (tab: DetailTabType) => void;
  onClose: () => void;
  fileChanges: Map<string, FileChange>;
  fileChangeArray: FileChange[];
  fileStats: { additions: number; deletions: number };
  events: WorkflowStreamEvent[];
  logs: WorkflowLogEntry[];
  accumulatedText: string;
  isStreaming: boolean;
  isConnected: boolean;
  workflowId: string | null;
  isWorkflowActive: boolean;
  isAwaitingApproval: boolean;
  workflow: Workflow;
  statusMessage: string | null;
  progress: number | null;
  /** Callback when user approves the plan */
  onPlanApprove?: () => void;
  /** Callback when user rejects the plan */
  onPlanReject?: () => void;
  /** Real-time agent activity stream data */
  agentStream?: UseAgentStreamReturn;
}

export const AgentDetailPanel = memo(function AgentDetailPanel({
  activeTab,
  onTabChange,
  onClose,
  fileChanges,
  fileChangeArray,
  fileStats,
  events,
  logs,
  accumulatedText,
  isStreaming,
  isConnected,
  workflowId,
  isWorkflowActive,
  isAwaitingApproval,
  workflow,
  statusMessage,
  progress,
  onPlanApprove,
  onPlanReject,
  agentStream,
}: AgentDetailPanelProps) {
  // Use task aggregation to determine plan status for the activity tab
  const { planStatus } = useTaskAggregation(events);

  // State for selected file in diff view
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Tab Header */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex gap-1">
          <TabButton
            active={activeTab === "logs"}
            onClick={() => onTabChange("logs")}
            count={logs.length}
          >
            Logs
          </TabButton>
          <TabButton
            active={activeTab === "diff"}
            onClick={() => onTabChange("diff")}
            count={fileChangeArray.length}
          >
            Diff
          </TabButton>
        </div>
        <div className="flex items-center gap-2">
          {(isConnected || agentStream?.isConnected) && (
            <span className="flex items-center gap-1.5 text-xs text-green-500">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              {agentStream?.isConnected ? "Live" : "Connected"}
            </span>
          )}
          {agentStream?.activeToolName && (
            <span className="text-xs text-muted-foreground font-mono">
              {agentStream.activeToolName}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onClose}
          >
            <XIcon size={16} />
          </Button>
        </div>
      </div>

      {/* Approval Banner - shown at top when awaiting approval */}
      {isAwaitingApproval && (
        <div className="border-b border-amber-500/30">
          <PlanApprovalSection
            workflowId={workflowId}
            planTitle={workflow?.plan?.title}
            planSummary={workflow?.plan?.summary}
            planSteps={workflow?.plan?.tasks?.map((t: { id: string; title: string; description?: string }) => ({
              id: t.id,
              title: t.title,
              description: t.description,
            }))}
            onApprove={onPlanApprove}
            onReject={onPlanReject}
          />
        </div>
      )}

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "logs" ? (
          <AgentActivityTab
            events={events}
            accumulatedText={accumulatedText}
            isStreaming={isStreaming}
            planStatus={planStatus}
            isAwaitingApproval={isAwaitingApproval}
            onPlanApprove={onPlanApprove}
            onPlanReject={onPlanReject}
            className="h-full"
            agentStream={agentStream}
          />
        ) : (
          <ScrollArea className="h-full">
            <DiffView
              fileChanges={fileChanges}
              fileChangeArray={fileChangeArray}
              selectedFile={selectedFile}
              onFileSelect={setSelectedFile}
            />
          </ScrollArea>
        )}
      </div>
    </div>
  );
});

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}

const TabButton = memo(function TabButton({ active, onClick, children, count }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      )}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span className="ml-1.5 text-xs text-muted-foreground">({count})</span>
      )}
    </button>
  );
});
