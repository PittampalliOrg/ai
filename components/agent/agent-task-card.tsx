"use client";

/**
 * Agent Task Card Component
 *
 * Renders a task from Claude Code's native task system using AI Elements Task component.
 * Shows task subject, description, status, and dependency information.
 */

import { memo } from "react";
import { cn } from "@/lib/utils";
import {
  CircleIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
} from "lucide-react";
import {
  Task,
  TaskTrigger,
  TaskContent,
  TaskItem,
} from "@/components/ai-elements/task";
import { Loader } from "@/components/ai-elements/loader";
import { Shimmer } from "@/components/ai-elements/shimmer";
import type { TaskData } from "@/hooks/use-workflow-stream";

export interface AgentTaskCardProps {
  task: TaskData;
  isStreaming?: boolean;
  className?: string;
}

/**
 * Status indicator icon based on task status
 */
function TaskStatusIcon({ status }: { status: TaskData["status"] }) {
  switch (status) {
    case "pending":
      return <CircleIcon className="size-4 text-muted-foreground" />;
    case "in_progress":
      return <Loader className="size-4" />;
    case "completed":
      return <CheckCircle2Icon className="size-4 text-green-500" />;
    default:
      return <AlertCircleIcon className="size-4 text-amber-500" />;
  }
}

/**
 * Get status label text
 */
function getStatusLabel(status: TaskData["status"]): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "in_progress":
      return "In Progress";
    case "completed":
      return "Completed";
    default:
      return "Unknown";
  }
}

export const AgentTaskCard = memo(function AgentTaskCard({
  task,
  isStreaming = false,
  className,
}: AgentTaskCardProps) {
  const isActive = task.status === "in_progress";
  const isBlocked = task.blockedBy && task.blockedBy.length > 0;

  return (
    <Task
      defaultOpen={isActive}
      className={cn(
        "border rounded-lg p-2",
        isActive && "border-primary/50 bg-primary/5",
        task.status === "completed" && "opacity-75",
        isBlocked && task.status === "pending" && "opacity-60",
        className
      )}
    >
      <TaskTrigger title={task.subject}>
        <div className="flex w-full cursor-pointer items-center gap-2 text-sm transition-colors hover:text-foreground">
          <TaskStatusIcon status={task.status} />
          <span className={cn(
            "flex-1",
            isStreaming && "animate-pulse"
          )}>
            {isStreaming ? (
              <Shimmer>{task.subject}</Shimmer>
            ) : (
              task.subject
            )}
          </span>
          {task.activeForm && isActive && (
            <span className="text-xs text-muted-foreground italic">
              {task.activeForm}
            </span>
          )}
        </div>
      </TaskTrigger>
      <TaskContent>
        {/* Description */}
        {task.description && (
          <TaskItem className="text-muted-foreground">
            {task.description}
          </TaskItem>
        )}

        {/* Status */}
        <TaskItem className="flex items-center gap-2 text-xs">
          <span className="font-medium">Status:</span>
          <span className={cn(
            task.status === "completed" && "text-green-600",
            task.status === "in_progress" && "text-blue-600",
            task.status === "pending" && "text-muted-foreground"
          )}>
            {getStatusLabel(task.status)}
          </span>
        </TaskItem>

        {/* Dependencies - blocked by */}
        {task.blockedBy && task.blockedBy.length > 0 && (
          <TaskItem className="flex items-center gap-2 text-xs text-amber-600">
            <AlertCircleIcon className="size-3" />
            <span>Blocked by: {task.blockedBy.join(", ")}</span>
          </TaskItem>
        )}

        {/* Dependencies - blocks */}
        {task.blocks && task.blocks.length > 0 && (
          <TaskItem className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Blocks: {task.blocks.join(", ")}</span>
          </TaskItem>
        )}

        {/* Task ID */}
        <TaskItem className="text-xs text-muted-foreground/60">
          Task #{task.id}
        </TaskItem>
      </TaskContent>
    </Task>
  );
});

export default AgentTaskCard;
