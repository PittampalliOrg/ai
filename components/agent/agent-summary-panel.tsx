"use client";

/**
 * Agent Summary Panel Component
 *
 * Left panel that displays structured summaries:
 * - Request Message (user's task prompt as a message)
 * - Execution Time badge
 * - Plan Section (only when plan with tasks exists)
 * - Summary Section (bullet points of accomplishments)
 * - Files Section (clickable file list)
 * - Chat Input at bottom
 */

import { memo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  FileText,
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
  ChevronRight,
  ChevronDown,
  ListChecks,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

// Local imports
import { AgentChatInput } from "./agent-chat-input";
import { PlanApprovalSection } from "./plan-approval-section";
import { AgentTaskQueue } from "./agent-task-queue";
import type { AgentSummary, AgentTask, AgentFileSummary } from "@/hooks/use-agent-summary";
import type { TaskData } from "@/hooks/use-workflow-stream";

// ============================================================================
// Types
// ============================================================================

interface AgentSummaryPanelProps {
  summary: AgentSummary;
  workflowId: string | null;
  isAwaitingApproval: boolean;
  isConnected: boolean;
  executionStatus: string;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  onFilesClick: () => void;
  /** Aggregated tasks from workflow events for the task queue */
  tasks?: TaskData[];
  className?: string;
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * User Request Card - simple muted box like Codex
 */
const UserRequestCard = memo(function UserRequestCard({
  content,
}: {
  content: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const shouldTruncate = content.length > 180;

  return (
    <div
      className={cn(
        "bg-muted/50 border border-border rounded-lg p-4",
        shouldTruncate && !isExpanded && "cursor-pointer hover:bg-muted/70 transition-colors"
      )}
      onClick={() => shouldTruncate && setIsExpanded(!isExpanded)}
    >
      <p className={cn(
        "text-[14px] text-muted-foreground leading-[1.75]",
        !isExpanded && shouldTruncate && "line-clamp-3"
      )}>
        {content}
        {shouldTruncate && !isExpanded && (
          <span className="text-muted-foreground/60"> ...</span>
        )}
      </p>
    </div>
  );
});

/**
 * Execution Time Line - simple "Worked for Xm Xs >"
 */
const ExecutionTimeLine = memo(function ExecutionTimeLine({
  time,
  isStreaming,
}: {
  time: { seconds: number; formatted: string };
  isStreaming: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-[14px] text-muted-foreground">
      {isStreaming && (
        <Loader2 className="size-4 text-muted-foreground animate-spin" />
      )}
      <span>
        {isStreaming ? "Working" : "Worked"} for {time.formatted}
      </span>
      <ChevronRight className="size-4 text-muted-foreground/70" />
    </div>
  );
});

/**
 * Task Status Icon - Codex style
 */
const TaskStatusIcon = memo(function TaskStatusIcon({
  status,
}: {
  status: AgentTask["status"];
}) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="size-4 text-green-600 dark:text-green-500" />;
    case "in_progress":
      return <Loader2 className="size-4 text-blue-600 dark:text-blue-400 animate-spin" />;
    case "failed":
      return <XCircle className="size-4 text-red-600 dark:text-red-500" />;
    default:
      return <Circle className="size-4 text-muted-foreground/50" />;
  }
});

/**
 * Plan Task Item - Codex-style bullet with status
 */
const PlanTaskItem = memo(function PlanTaskItem({ task }: { task: AgentTask }) {
  return (
    <div className="flex items-start gap-3 py-1">
      <div className="mt-[3px] flex-shrink-0">
        <TaskStatusIcon status={task.status} />
      </div>
      <span
        className={cn(
          "text-[14px] leading-[1.7]",
          task.status === "completed" ? "text-muted-foreground/70" : "text-muted-foreground"
        )}
      >
        {task.title}
      </span>
    </div>
  );
});

/**
 * Plan Section - Codex-style collapsible with tasks
 * Only renders when there are actual plan tasks
 */
const PlanSection = memo(function PlanSection({
  plan,
  isStreaming,
}: {
  plan: AgentSummary["plan"];
  isStreaming: boolean;
}) {
  // Only show if we have actual tasks
  if (!plan || plan.tasks.length === 0) return null;

  const completedCount = plan.tasks.filter((t) => t.status === "completed").length;
  const totalCount = plan.tasks.length;

  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="w-full flex items-center justify-between mb-4 group">
        <h3 className="text-[15px] font-semibold text-foreground flex items-center gap-2">
          <ListChecks className="size-4 text-muted-foreground" />
          {plan.title || "Plan"}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-muted-foreground tabular-nums">
            {completedCount}/{totalCount}
          </span>
          <ChevronDown className="size-4 text-muted-foreground/70 transition-transform group-data-[state=open]:rotate-180" />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2">
          {plan.description && (
            <p className="text-[13px] text-muted-foreground mb-4 leading-[1.65]">
              {plan.description}
            </p>
          )}
          {plan.tasks.map((task, index) => (
            <PlanTaskItem key={`${task.id}-${index}`} task={task} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
});

/**
 * Summary Section (bullet points) - Codex-style with bold header
 */
const SummarySection = memo(function SummarySection({
  bullets,
}: {
  bullets: string[];
}) {
  if (bullets.length === 0) return null;

  return (
    <div>
      <h3 className="text-[15px] font-semibold text-foreground mb-4">
        Summary
      </h3>
      <ul className="space-y-3">
        {bullets.map((bullet, idx) => (
          <li
            key={idx}
            className="flex items-start gap-3 text-[14px] text-muted-foreground leading-[1.7]"
          >
            <span className="text-muted-foreground/50 select-none mt-[6px] text-[8px]">●</span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </div>
  );
});

/**
 * File Change Item - Codex-style with mono filename
 */
const FileChangeItem = memo(function FileChangeItem({
  file,
  onClick,
}: {
  file: AgentFileSummary;
  onClick?: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between py-2 px-2.5 hover:bg-muted/60 rounded-md transition-colors cursor-pointer -mx-1"
      onClick={onClick}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <FileText className="size-4 text-muted-foreground flex-shrink-0" />
        <span className="text-[13px] text-foreground truncate font-mono tracking-tight" title={file.path}>
          {file.fileName}
        </span>
        {file.status === "created" && (
          <span className="text-[10px] px-1.5 py-0.5 bg-green-500/15 text-green-600 dark:text-green-500 rounded font-medium">
            new
          </span>
        )}
      </div>
      <div className="flex items-center gap-2.5 text-[12px] font-mono tabular-nums">
        {file.additions > 0 && (
          <span className="text-green-600 dark:text-green-500">+{file.additions}</span>
        )}
        {file.deletions > 0 && (
          <span className="text-red-600 dark:text-red-500">-{file.deletions}</span>
        )}
      </div>
    </div>
  );
});

/**
 * Files Section - Codex-style collapsible with chevron
 */
const FilesSection = memo(function FilesSection({
  files,
  onClick,
}: {
  files: AgentFileSummary[];
  onClick: () => void;
}) {
  if (files.length === 0) return null;

  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger className="w-full flex items-center justify-between mb-4 group">
        <h3 className="text-[15px] font-semibold text-foreground flex items-center gap-2">
          Files
          <span className="text-muted-foreground font-normal text-[14px]">({files.length})</span>
        </h3>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-[12px] font-mono">
            <span className="text-green-600 dark:text-green-500">+{totalAdditions}</span>
            <span className="text-red-600 dark:text-red-500">-{totalDeletions}</span>
          </div>
          <ChevronDown className="size-4 text-muted-foreground/70 transition-transform group-data-[state=open]:rotate-180" />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-1">
          {files.slice(0, 5).map((file) => (
            <FileChangeItem key={file.path} file={file} onClick={onClick} />
          ))}
          {files.length > 5 && (
            <button
              onClick={onClick}
              className="w-full text-[13px] text-muted-foreground hover:text-foreground text-left py-2 transition-colors"
            >
              + {files.length - 5} more files...
            </button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
});

// ============================================================================
// Main Component
// ============================================================================

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
  tasks = [],
  className,
}: AgentSummaryPanelProps) {
  const { taskPrompt, executionTime, plan, files, isStreaming } = summary;

  // Check if plan has actual implementation tasks (not just echoing the task prompt)
  const hasRealPlan = plan && plan.tasks.length > 0;

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto px-5 py-6">
        {/* Header: Request + Time */}
        <div className="space-y-4 mb-8">
          {taskPrompt && <UserRequestCard content={taskPrompt} />}
          <ExecutionTimeLine time={executionTime} isStreaming={isStreaming} />
        </div>

        {/* Task Queue - pinned progress tracker */}
        {tasks.length > 0 && (
          <AgentTaskQueue
            tasks={tasks}
            isStreaming={isStreaming}
            defaultOpen={true}
            showDescriptions={false}
            maxVisibleTasks={8}
            className="mb-6"
          />
        )}

        {/* Content sections */}
        <div className="space-y-6">
          {/* Summary Section */}
          {summary.summary.length > 0 && (
            <SummarySection bullets={summary.summary} />
          )}

          {/* Plan Section - only when we have actual plan tasks (skip if task queue is shown) */}
          {hasRealPlan && tasks.length === 0 && (
            <PlanSection plan={plan} isStreaming={isStreaming} />
          )}

          {/* Files Section */}
          {files.length > 0 && (
            <FilesSection files={files} onClick={onFilesClick} />
          )}
        </div>
      </div>

      {/* Plan approval section (when awaiting) */}
      {isAwaitingApproval && (
        <PlanApprovalSection
          workflowId={workflowId}
          planTitle={plan?.title}
          planSummary={plan?.description}
          planSteps={plan?.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            description: t.description,
          }))}
          className="border-t"
        />
      )}

      {/* Fixed Input at Bottom */}
      <div className="border-t border-border px-5 py-4 bg-background">
        <AgentChatInput
          value={inputValue}
          onChange={onInputChange}
          onSubmit={onSubmit}
          onStop={onStop}
          isStreaming={isStreaming}
          isDisabled={isAwaitingApproval}
          placeholder={
            isAwaitingApproval
              ? "Approve or reject the plan above..."
              : "Send a follow-up message..."
          }
        />
      </div>
    </div>
  );
});
