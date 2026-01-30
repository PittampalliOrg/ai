"use client";

/**
 * Agent Task Queue Component
 *
 * Compact, collapsible task progress tracker using AI Elements Queue component.
 * Shows consolidated task status at a glance with expand/collapse functionality.
 */

import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  CheckCircle2Icon,
  CircleIcon,
  Loader2Icon,
  ListTodoIcon,
  AlertCircleIcon,
} from "lucide-react";
import {
  Queue,
  QueueSection,
  QueueSectionTrigger,
  QueueSectionLabel,
  QueueSectionContent,
  QueueList,
  QueueItem,
  QueueItemIndicator,
  QueueItemContent,
  QueueItemDescription,
} from "@/components/ai-elements/queue";
import type { TaskData } from "@/hooks/use-workflow-stream";

// ============================================================================
// Types
// ============================================================================

export interface AgentTaskQueueProps {
  tasks: TaskData[];
  isStreaming?: boolean;
  defaultOpen?: boolean;
  showDescriptions?: boolean;
  maxVisibleTasks?: number;
  className?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Sort tasks by status: in_progress first, then pending, then completed
 */
function sortTasks(tasks: TaskData[]): TaskData[] {
  const order: Record<string, number> = {
    in_progress: 0,
    pending: 1,
    completed: 2,
  };
  return [...tasks].sort((a, b) => {
    return (order[a.status] ?? 1) - (order[b.status] ?? 1);
  });
}

/**
 * Calculate progress stats
 */
function calculateProgress(tasks: TaskData[]) {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "completed").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const pending = tasks.filter((t) => t.status === "pending").length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, inProgress, pending, percentage };
}

// ============================================================================
// Sub-components
// ============================================================================

/**
 * Task status indicator with appropriate icon
 */
const TaskStatusIndicator = memo(function TaskStatusIndicator({
  status,
  className,
}: {
  status: TaskData["status"];
  className?: string;
}) {
  switch (status) {
    case "completed":
      return (
        <CheckCircle2Icon
          className={cn("size-3.5 text-green-500", className)}
        />
      );
    case "in_progress":
      return (
        <Loader2Icon
          className={cn("size-3.5 text-blue-500 animate-spin", className)}
        />
      );
    case "pending":
    default:
      return (
        <CircleIcon
          className={cn("size-3.5 text-muted-foreground/50", className)}
        />
      );
  }
});

/**
 * Individual task row in the queue
 */
const TaskQueueItem = memo(function TaskQueueItem({
  task,
  showDescription = false,
}: {
  task: TaskData;
  showDescription?: boolean;
}) {
  const isCompleted = task.status === "completed";
  const isBlocked = task.blockedBy && task.blockedBy.length > 0;

  return (
    <QueueItem className={cn(isBlocked && task.status === "pending" && "opacity-60")}>
      <div className="flex items-center gap-2">
        <TaskStatusIndicator status={task.status} />
        <QueueItemContent completed={isCompleted}>
          {task.subject}
        </QueueItemContent>
      </div>
      {showDescription && task.description && (
        <QueueItemDescription completed={isCompleted}>
          {task.description}
        </QueueItemDescription>
      )}
      {isBlocked && task.status === "pending" && (
        <div className="ml-6 flex items-center gap-1 text-xs text-amber-500">
          <AlertCircleIcon className="size-3" />
          <span>Blocked</span>
        </div>
      )}
    </QueueItem>
  );
});

/**
 * Progress bar for visual progress indication
 */
const ProgressBar = memo(function ProgressBar({
  percentage,
  className,
}: {
  percentage: number;
  className?: string;
}) {
  return (
    <div className={cn("h-1 w-full bg-muted rounded-full overflow-hidden", className)}>
      <div
        className="h-full bg-primary transition-all duration-300"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
});

// ============================================================================
// Main Component
// ============================================================================

export const AgentTaskQueue = memo(function AgentTaskQueue({
  tasks,
  isStreaming = false,
  defaultOpen = true,
  showDescriptions = false,
  maxVisibleTasks = 10,
  className,
}: AgentTaskQueueProps) {
  const sortedTasks = useMemo(() => sortTasks(tasks), [tasks]);
  const progress = useMemo(() => calculateProgress(tasks), [tasks]);

  // Don't render if no tasks
  if (tasks.length === 0) {
    return null;
  }

  // Determine section label based on progress
  const sectionLabel = progress.completed === progress.total
    ? "Tasks Complete"
    : progress.inProgress > 0
    ? "Tasks In Progress"
    : "Tasks Pending";

  return (
    <Queue className={cn("shadow-none", className)}>
      <QueueSection defaultOpen={defaultOpen}>
        <QueueSectionTrigger>
          <QueueSectionLabel
            count={progress.completed}
            label={`of ${progress.total} ${sectionLabel.toLowerCase()}`}
            icon={<ListTodoIcon className="size-4 text-muted-foreground" />}
          />
          {/* Inline progress indicator */}
          <div className="flex items-center gap-2">
            {progress.inProgress > 0 && (
              <Loader2Icon className="size-3.5 text-blue-500 animate-spin" />
            )}
            <span className="text-xs text-muted-foreground tabular-nums">
              {progress.percentage}%
            </span>
          </div>
        </QueueSectionTrigger>

        <QueueSectionContent>
          {/* Progress bar */}
          <ProgressBar percentage={progress.percentage} className="mt-2 mb-1" />

          {/* Task list */}
          <QueueList>
            {sortedTasks.slice(0, maxVisibleTasks).map((task, index) => (
              <TaskQueueItem
                key={`${task.id}-${index}`}
                task={task}
                showDescription={showDescriptions}
              />
            ))}
            {tasks.length > maxVisibleTasks && (
              <QueueItem className="text-xs text-muted-foreground italic">
                + {tasks.length - maxVisibleTasks} more tasks...
              </QueueItem>
            )}
          </QueueList>
        </QueueSectionContent>
      </QueueSection>
    </Queue>
  );
});

export default AgentTaskQueue;
