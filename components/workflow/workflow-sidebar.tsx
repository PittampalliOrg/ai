"use client";

/**
 * Workflow Sidebar Component
 *
 * Left panel showing:
 * 1. Task prompt display
 * 2. Live LLM response (streaming text with cursor)
 * 3. Current tool execution card
 * 4. Task progress indicator
 * 5. File changes summary
 * 6. Approval section (when awaiting approval)
 */

import { memo, useMemo, useState, useCallback } from "react";
import { useWorkflowExecution } from "@/contexts/workflow-execution-context";
import { useWorkflowApproval } from "@/hooks/use-workflow-approval";
import { useWorkflow } from "@/hooks/use-workflows";
import { StreamingText } from "./streaming-text";
import { ToolCallCard } from "./tool-call-card";
import { AgentBadge } from "./agent-badge";
import { cn } from "@/lib/utils";
import type { FileChange, TaskProgress } from "@/contexts/workflow-execution-context";
import type { PlanTask } from "@/lib/types/workflow";

interface WorkflowSidebarProps {
  className?: string;
  taskPrompt?: string | null;
}

export const WorkflowSidebar = memo(function WorkflowSidebar({
  className,
  taskPrompt: externalTaskPrompt,
}: WorkflowSidebarProps) {
  const {
    workflowId,
    taskPrompt: contextTaskPrompt,
    accumulatedText,
    latestToolCall,
    activeAgent,
    taskProgress,
    executionStatus,
    fileChangeArray,
    fileChangeStats,
    isConnected,
    events,
  } = useWorkflowExecution();

  // Fetch workflow detail for plan information (refreshes every 3s)
  const { workflow } = useWorkflow(workflowId, 3000);

  const { approve, reject, isApproving, error: approvalError } = useWorkflowApproval(workflowId);
  const [approvalHandled, setApprovalHandled] = useState(false);

  const taskPrompt = externalTaskPrompt ?? contextTaskPrompt;
  const isStreaming = executionStatus === "running" && accumulatedText.length > 0;

  // Detect if workflow is awaiting approval from events
  const isAwaitingApproval = useMemo(() => {
    if (approvalHandled) return false;

    // Check initial event for AWAITING_APPROVAL status
    const initialEvent = events.find((e) => e.type === "initial");
    if (initialEvent?.data?.status === "AWAITING_APPROVAL") {
      // Make sure execution hasn't started
      const hasExecutionStarted = events.some(
        (e) => e.data?.status?.includes("execution") ||
               e.data?.metadata?.progressType === "status_change" && e.data?.status?.includes("Execution")
      );
      if (!hasExecutionStarted) return true;
    }

    // Check for "Plan ready for approval" in progress events
    const hasApprovalNeeded = events.some(
      (e) =>
        e.data?.status?.includes("Plan ready for approval") ||
        e.data?.content?.includes("Plan ready for approval")
    );

    if (hasApprovalNeeded) {
      // Make sure execution hasn't started after the approval request
      const hasExecutionStarted = events.some(
        (e) => e.data?.status?.includes("execution started") ||
               e.data?.status?.includes("Execution started")
      );
      return !hasExecutionStarted;
    }

    return false;
  }, [events, approvalHandled]);

  // Get plan title from events
  const planTitle = useMemo(() => {
    const approvalEvent = events.find(
      (e) => e.data?.status?.includes("Plan ready for approval") ||
             e.data?.content?.includes("Plan ready for approval")
    );
    const content = approvalEvent?.data?.status || approvalEvent?.data?.content || "";
    // Extract title after "Plan ready for approval: "
    const match = content.match(/Plan ready for approval:\s*(.+)/);
    return match ? match[1] : null;
  }, [events]);

  const handleApprove = useCallback(async () => {
    const result = await approve();
    if (result.success) {
      setApprovalHandled(true);
    }
  }, [approve]);

  const handleReject = useCallback(async () => {
    const result = await reject("Rejected by user");
    if (result.success) {
      setApprovalHandled(true);
    }
  }, [reject]);

  return (
    <div className={cn("flex flex-col h-full bg-zinc-950", className)}>
      {/* Task Prompt Section */}
      <TaskPromptSection prompt={taskPrompt} />

      {/* Divider */}
      <div className="border-b border-zinc-800" />

      {/* Approval Section (when awaiting approval) */}
      {isAwaitingApproval && (
        <ApprovalSection
          planTitle={planTitle}
          onApprove={handleApprove}
          onReject={handleReject}
          isApproving={isApproving}
          error={approvalError}
        />
      )}

      {/* Plan Display Section (when plan is available) */}
      {workflow?.plan && (
        <PlanDisplaySection
          plan={workflow.plan}
          isApproved={approvalHandled || !isAwaitingApproval}
        />
      )}

      {/* Live Response Section */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          {/* Agent + Streaming Text */}
          {(accumulatedText || executionStatus === "running") && (
            <StreamingTextSection
              text={accumulatedText}
              agentId={activeAgent}
              isStreaming={isStreaming}
            />
          )}

          {/* Current Tool */}
          {latestToolCall && (
            <CurrentToolSection
              toolName={latestToolCall.toolName}
              toolInput={latestToolCall.toolInput}
              isRunning={executionStatus === "running"}
            />
          )}

          {/* Task Progress */}
          {taskProgress && taskProgress.total > 0 && (
            <TaskProgressSection progress={taskProgress} />
          )}
        </div>
      </div>

      {/* File Changes Summary (sticky bottom) */}
      {fileChangeArray.length > 0 && (
        <FileChangesSummary
          files={fileChangeArray}
          stats={fileChangeStats}
        />
      )}

      {/* Connection Status */}
      <ConnectionStatusBar isConnected={isConnected} status={executionStatus} />
    </div>
  );
});

// ============================================================================
// Sub-components
// ============================================================================

const TaskPromptSection = memo(function TaskPromptSection({
  prompt,
}: {
  prompt: string | null;
}) {
  if (!prompt) {
    return (
      <div className="p-4 text-zinc-500 text-sm italic">
        No task submitted yet
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="text-xs text-zinc-500 mb-2 font-medium">Task</div>
      <div className="bg-zinc-900 rounded-lg p-3 border border-zinc-800">
        <p className="text-sm text-zinc-200 whitespace-pre-wrap break-words">
          {prompt.length > 500 ? prompt.slice(0, 500) + "..." : prompt}
        </p>
      </div>
    </div>
  );
});

const ApprovalSection = memo(function ApprovalSection({
  planTitle,
  onApprove,
  onReject,
  isApproving,
  error,
}: {
  planTitle: string | null;
  onApprove: () => void;
  onReject: () => void;
  isApproving: boolean;
  error: string | null;
}) {
  return (
    <div className="p-4 border-b border-zinc-800 bg-amber-950/20">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <span className="text-xs text-amber-300 font-medium uppercase tracking-wide">
          Awaiting Approval
        </span>
      </div>
      {planTitle && (
        <p className="text-sm text-zinc-200 mb-4 font-medium">{planTitle}</p>
      )}
      {error && (
        <p className="text-xs text-red-400 mb-3">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={onApprove}
          disabled={isApproving}
          className={cn(
            "flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
            "bg-green-600 text-white hover:bg-green-500",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {isApproving ? "Processing..." : "Approve & Execute"}
        </button>
        <button
          onClick={onReject}
          disabled={isApproving}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
            "border border-red-700 text-red-400 hover:bg-red-950/50",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          Reject
        </button>
      </div>
    </div>
  );
});

const PlanDisplaySection = memo(function PlanDisplaySection({
  plan,
  isApproved,
}: {
  plan: {
    id: string;
    title: string;
    summary: string;
    tasks: PlanTask[];
  };
  isApproved: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="p-4 border-b border-zinc-800 bg-blue-950/20">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={cn(
            "w-2 h-2 rounded-full",
            isApproved ? "bg-green-500" : "bg-blue-400"
          )} />
          <span className="text-xs text-blue-300 font-medium uppercase tracking-wide">
            Implementation Plan
          </span>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {isExpanded ? "Collapse" : "Expand"}
        </button>
      </div>

      <h4 className="text-sm font-medium text-zinc-200 mb-2">{plan.title}</h4>

      {isExpanded && (
        <>
          <p className="text-xs text-zinc-400 mb-3">{plan.summary}</p>

          {plan.tasks.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs text-zinc-500 font-medium">
                Steps ({plan.tasks.length})
              </span>
              <div className="space-y-1.5">
                {plan.tasks.map((task, index) => (
                  <div
                    key={task.id}
                    className={cn(
                      "flex items-start gap-2 text-xs p-2 rounded",
                      task.status === "completed"
                        ? "bg-green-950/30"
                        : task.status === "in_progress"
                        ? "bg-blue-950/30"
                        : task.status === "failed"
                        ? "bg-red-950/30"
                        : "bg-zinc-900/50"
                    )}
                  >
                    <span className="text-zinc-500 font-mono flex-shrink-0">
                      {index + 1}.
                    </span>
                    <div className="min-w-0">
                      <p className="text-zinc-300 font-medium">{task.title}</p>
                      {task.description && (
                        <p className="text-zinc-500 mt-0.5 line-clamp-2">
                          {task.description}
                        </p>
                      )}
                    </div>
                    <span
                      className={cn(
                        "flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1.5",
                        task.status === "completed"
                          ? "bg-green-500"
                          : task.status === "in_progress"
                          ? "bg-blue-500 animate-pulse"
                          : task.status === "failed"
                          ? "bg-red-500"
                          : "bg-zinc-600"
                      )}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
});

const StreamingTextSection = memo(function StreamingTextSection({
  text,
  agentId,
  isStreaming,
}: {
  text: string;
  agentId: ReturnType<typeof useWorkflowExecution>["activeAgent"];
  isStreaming: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <AgentBadge agentId={agentId} size="sm" />
        {isStreaming && (
          <span className="text-xs text-zinc-500 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            responding
          </span>
        )}
      </div>
      <StreamingText
        text={text}
        agentId={agentId}
        isStreaming={isStreaming}
        maxHeight="max-h-48"
      />
    </div>
  );
});

const CurrentToolSection = memo(function CurrentToolSection({
  toolName,
  toolInput,
  isRunning,
}: {
  toolName: string;
  toolInput?: unknown;
  isRunning: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-zinc-500 mb-2 font-medium flex items-center gap-2">
        <span className="w-3 h-0.5 bg-zinc-700 rounded" />
        Current Tool
      </div>
      <ToolCallCard
        toolName={toolName}
        toolInput={toolInput}
        status={isRunning ? "running" : "success"}
      />
    </div>
  );
});

const TaskProgressSection = memo(function TaskProgressSection({
  progress,
}: {
  progress: TaskProgress;
}) {
  const percentage = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <div>
      <div className="text-xs text-zinc-500 mb-2 font-medium flex items-center gap-2">
        <span className="w-3 h-0.5 bg-zinc-700 rounded" />
        Progress
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-300">
            Task {progress.current}/{progress.total}
          </span>
          <span className="text-zinc-500">{percentage}%</span>
        </div>
        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
        {progress.currentTaskTitle && (
          <p className="text-xs text-zinc-500 truncate">
            {progress.currentTaskTitle}
          </p>
        )}
      </div>
    </div>
  );
});

const FileChangesSummary = memo(function FileChangesSummary({
  files,
  stats,
}: {
  files: FileChange[];
  stats: { additions: number; deletions: number };
}) {
  return (
    <div className="border-t border-zinc-800 p-4 bg-zinc-900/50">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-zinc-500 font-medium">
          Files Changed ({files.length})
        </span>
        <span className="text-xs font-mono tabular-nums">
          <span className="text-emerald-400">+{stats.additions}</span>
          <span className="text-zinc-600 mx-1">/</span>
          <span className="text-red-400">-{stats.deletions}</span>
        </span>
      </div>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {files.slice(0, 10).map((file) => (
          <FileChangeLine key={file.path} file={file} />
        ))}
        {files.length > 10 && (
          <p className="text-xs text-zinc-500 pt-1">
            +{files.length - 10} more files
          </p>
        )}
      </div>
    </div>
  );
});

const FileChangeLine = memo(function FileChangeLine({
  file,
}: {
  file: FileChange;
}) {
  const fileName = file.path.split("/").pop() || file.path;
  const dirPath = file.path.slice(0, -fileName.length - 1);

  return (
    <div className="flex items-center gap-2 text-xs group">
      <span
        className={cn(
          "w-1 h-1 rounded-full flex-shrink-0",
          file.isNew ? "bg-green-500" : "bg-yellow-500"
        )}
      />
      <span className="truncate flex-1 text-zinc-400" title={file.path}>
        {dirPath && (
          <span className="text-zinc-600">{dirPath}/</span>
        )}
        <span className="text-zinc-300">{fileName}</span>
      </span>
      <span className="flex-shrink-0 font-mono text-zinc-500 tabular-nums">
        <span className="text-emerald-500">+{file.additions}</span>
        {file.deletions > 0 && (
          <>
            <span className="text-zinc-600">/</span>
            <span className="text-red-500">-{file.deletions}</span>
          </>
        )}
      </span>
    </div>
  );
});

const ConnectionStatusBar = memo(function ConnectionStatusBar({
  isConnected,
  status,
}: {
  isConnected: boolean;
  status: string;
}) {
  return (
    <div className="px-4 py-2 border-t border-zinc-800 flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            isConnected ? "bg-green-500" : "bg-zinc-500"
          )}
        />
        <span className={isConnected ? "text-green-400" : "text-zinc-500"}>
          {isConnected ? "Connected" : "Disconnected"}
        </span>
      </span>
      <span className="text-zinc-500 capitalize">{status}</span>
    </div>
  );
});
