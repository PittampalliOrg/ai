"use client";

/**
 * Agent Plan Card Component
 *
 * Renders an aggregated plan view using AI Elements Plan component.
 * Shows plan title, description, list of tasks, and approval actions.
 */

import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ListTodoIcon,
} from "lucide-react";
import {
  Plan,
  PlanHeader,
  PlanTitle,
  PlanDescription,
  PlanAction,
  PlanContent,
  PlanFooter,
  PlanTrigger,
} from "@/components/ai-elements/plan";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AgentTaskCard } from "./agent-task-card";
import type { TaskData } from "@/hooks/use-workflow-stream";
import type { PlanStatus } from "@/hooks/use-task-aggregation";

export type { PlanStatus };

export interface AgentPlanCardProps {
  title?: string;
  description?: string;
  tasks: TaskData[];
  status: PlanStatus;
  onApprove?: () => void;
  onReject?: () => void;
  isStreaming?: boolean;
  className?: string;
}

/**
 * Get status badge variant and label
 */
function getStatusInfo(status: PlanStatus): { variant: "default" | "secondary" | "destructive" | "outline"; label: string } {
  switch (status) {
    case "planning":
      return { variant: "secondary", label: "Planning..." };
    case "awaiting_approval":
      return { variant: "outline", label: "Awaiting Approval" };
    case "approved":
      return { variant: "default", label: "Approved" };
    case "rejected":
      return { variant: "destructive", label: "Rejected" };
    case "executing":
      return { variant: "default", label: "Executing" };
    default:
      return { variant: "secondary", label: "Unknown" };
  }
}

/**
 * Calculate plan progress from task statuses
 */
function calculateProgress(tasks: TaskData[]): { completed: number; total: number; percentage: number } {
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === "completed").length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { completed, total, percentage };
}

export const AgentPlanCard = memo(function AgentPlanCard({
  title = "Implementation Plan",
  description,
  tasks,
  status,
  onApprove,
  onReject,
  isStreaming = false,
  className,
}: AgentPlanCardProps) {
  const statusInfo = getStatusInfo(status);
  const progress = useMemo(() => calculateProgress(tasks), [tasks]);

  // Sort tasks: in_progress first, then pending, then completed
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const order = { in_progress: 0, pending: 1, completed: 2 };
      return (order[a.status] ?? 1) - (order[b.status] ?? 1);
    });
  }, [tasks]);

  // Auto-generate description if not provided
  const displayDescription = description || (
    status === "planning"
      ? "Creating implementation tasks..."
      : status === "awaiting_approval"
      ? `${tasks.length} task${tasks.length !== 1 ? "s" : ""} planned. Review and approve to continue.`
      : status === "executing"
      ? `Executing ${progress.completed}/${progress.total} tasks (${progress.percentage}%)`
      : `${tasks.length} task${tasks.length !== 1 ? "s" : ""} in plan`
  );

  return (
    <Plan
      isStreaming={isStreaming}
      defaultOpen={true}
      className={cn(
        "border-2",
        status === "awaiting_approval" && "border-amber-500/50",
        status === "approved" && "border-green-500/50",
        status === "rejected" && "border-destructive/50",
        status === "executing" && "border-primary/50",
        className
      )}
    >
      <PlanHeader>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <ListTodoIcon className="size-5 text-muted-foreground" />
            <PlanTitle>{title}</PlanTitle>
          </div>
          <PlanDescription>{displayDescription}</PlanDescription>
        </div>
        <PlanAction className="flex items-center gap-2">
          <Badge variant={statusInfo.variant}>
            {statusInfo.label}
          </Badge>
          <PlanTrigger />
        </PlanAction>
      </PlanHeader>

      <PlanContent className="space-y-3 pt-4">
        {/* Progress bar for executing status */}
        {status === "executing" && tasks.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Progress</span>
              <span>{progress.completed}/{progress.total} tasks</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
          </div>
        )}

        {/* Task list */}
        {sortedTasks.length > 0 ? (
          <div className="space-y-2">
            {sortedTasks.map((task, index) => (
              <AgentTaskCard
                key={`${task.id}-${index}`}
                task={task}
                isStreaming={isStreaming && task.status === "in_progress"}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <ClockIcon className="size-4 mr-2" />
            <span className="text-sm">Waiting for tasks...</span>
          </div>
        )}
      </PlanContent>

      {/* Approval actions - show when awaiting approval */}
      {status === "awaiting_approval" && (
        <PlanFooter className="flex items-center justify-end gap-2 pt-4 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={onReject}
            disabled={!onReject}
            className="gap-1.5"
          >
            <XCircleIcon className="size-4" />
            Reject
          </Button>
          <Button
            size="sm"
            onClick={onApprove}
            disabled={!onApprove}
            className="gap-1.5"
          >
            <CheckCircleIcon className="size-4" />
            Approve Plan
          </Button>
        </PlanFooter>
      )}
    </Plan>
  );
});

export default AgentPlanCard;
