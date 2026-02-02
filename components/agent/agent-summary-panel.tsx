"use client";

/**
 * Agent Summary Panel Component
 *
 * Left panel showing structured workflow summary:
 * - Request/Task prompt
 * - Execution time
 * - Plan summary
 * - Files changed
 * - Input for follow-up messages
 */

import { memo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Clock,
  FileText,
  CheckCircle,
  AlertCircle,
  Loader2,
  Send,
  Square,
  GitBranch,
} from "lucide-react";
import type { ExecutionStatus } from "@/contexts/workflow-execution-context";
import type { AgentSummary } from "@/hooks/use-agent-summary";

interface AgentSummaryPanelProps {
  summary: AgentSummary;
  workflowId: string | null;
  isAwaitingApproval: boolean;
  isConnected: boolean;
  executionStatus: ExecutionStatus;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onFilesClick: () => void;
}

export const AgentSummaryPanel = memo(function AgentSummaryPanel({
  summary,
  workflowId,
  isAwaitingApproval,
  isConnected,
  executionStatus,
  inputValue,
  onInputChange,
  onSubmit,
  onStop,
  onFilesClick,
}: AgentSummaryPanelProps) {
  const isRunning = executionStatus === "running";
  const isCompleted = executionStatus === "completed";
  const isError = executionStatus === "error";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Workflow Summary</h2>
          <StatusBadge status={executionStatus} isConnected={isConnected} />
        </div>
        {workflowId && (
          <p className="text-xs text-muted-foreground font-mono mt-1 truncate">
            {workflowId}
          </p>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Request Section */}
        {summary.taskPrompt && (
          <SummarySection title="Request" icon={<FileText className="w-4 h-4" />}>
            <p className="text-sm text-foreground line-clamp-3">{summary.taskPrompt}</p>
          </SummarySection>
        )}

        {/* Time Section */}
        {summary.startTime && (
          <SummarySection title="Time" icon={<Clock className="w-4 h-4" />}>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Started:</span>
              <span className="text-foreground">
                {summary.startTime.toLocaleTimeString()}
              </span>
            </div>
            {summary.duration && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Duration:</span>
                <span className="text-foreground">{summary.duration}</span>
              </div>
            )}
          </SummarySection>
        )}

        {/* Plan Section */}
        {summary.planTitle && (
          <SummarySection title="Plan" icon={<GitBranch className="w-4 h-4" />}>
            <p className="text-sm font-medium text-foreground">{summary.planTitle}</p>
            {summary.planSummary && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {summary.planSummary}
              </p>
            )}
            {summary.taskCount > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {summary.completedTasks}/{summary.taskCount} tasks
              </p>
            )}
          </SummarySection>
        )}

        {/* Files Section */}
        {summary.fileCount > 0 && (
          <SummarySection title="Files Changed" icon={<FileText className="w-4 h-4" />}>
            <button
              onClick={onFilesClick}
              className="flex items-center gap-3 w-full p-2 -m-2 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <span className="text-sm font-medium text-foreground">
                {summary.fileCount} file{summary.fileCount !== 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-2 text-xs ml-auto">
                {summary.additions > 0 && (
                  <span className="text-green-500">+{summary.additions}</span>
                )}
                {summary.deletions > 0 && (
                  <span className="text-red-500">-{summary.deletions}</span>
                )}
              </span>
            </button>
          </SummarySection>
        )}

        {/* Awaiting Approval Banner */}
        {isAwaitingApproval && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm font-medium">Awaiting Approval</span>
            </div>
            <p className="text-xs text-amber-400/80 mt-1">
              Review the plan and approve to continue execution.
            </p>
          </div>
        )}

        {/* Summary Points */}
        {summary.summaryPoints.length > 0 && (
          <SummarySection title="Summary" icon={<CheckCircle className="w-4 h-4" />}>
            <ul className="space-y-1">
              {summary.summaryPoints.map((point, index) => (
                <li key={index} className="text-sm text-foreground flex items-start gap-2">
                  <span className="text-muted-foreground mt-0.5">-</span>
                  {point}
                </li>
              ))}
            </ul>
          </SummarySection>
        )}
      </div>

      {/* Input Section */}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            placeholder={isRunning ? "Agent is working..." : "Send a follow-up message..."}
            disabled={isRunning}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            className="flex-1"
          />
          {isRunning ? (
            <Button variant="destructive" size="icon" onClick={onStop}>
              <Square className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              variant="default"
              size="icon"
              onClick={onSubmit}
              disabled={!inputValue.trim()}
            >
              <Send className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});

interface SummarySectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

const SummarySection = memo(function SummarySection({
  title,
  icon,
  children,
}: SummarySectionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium uppercase tracking-wide">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
});

interface StatusBadgeProps {
  status: ExecutionStatus;
  isConnected: boolean;
}

const StatusBadge = memo(function StatusBadge({ status, isConnected }: StatusBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case "running":
        return {
          icon: <Loader2 className="w-3 h-3 animate-spin" />,
          label: "Running",
          className: "bg-blue-500/20 text-blue-400",
        };
      case "completed":
        return {
          icon: <CheckCircle className="w-3 h-3" />,
          label: "Completed",
          className: "bg-green-500/20 text-green-400",
        };
      case "error":
        return {
          icon: <AlertCircle className="w-3 h-3" />,
          label: "Error",
          className: "bg-red-500/20 text-red-400",
        };
      default:
        return {
          icon: null,
          label: "Idle",
          className: "bg-muted text-muted-foreground",
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
        config.className
      )}
    >
      {config.icon}
      {config.label}
    </div>
  );
});
