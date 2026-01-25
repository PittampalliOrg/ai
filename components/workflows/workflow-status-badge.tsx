"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { WorkflowStatus, PlanStepStatus, PlanTaskStatus } from "@/lib/types/workflow";
import {
  getWorkflowStatusLabel,
  getPlanStepStatusLabel,
  getPlanTaskStatusLabel,
} from "@/lib/types/workflow";

// ============================================================================
// Status Color Mapping
// ============================================================================

const workflowStatusColors: Record<WorkflowStatus, string> = {
  // New orchestrator statuses
  IDLE: "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600",
  PLANNING: "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900 dark:text-purple-300 dark:border-purple-700",
  AWAITING_APPROVAL: "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900 dark:text-yellow-300 dark:border-yellow-700",
  EXECUTING: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-700",
  COMPLETED: "bg-green-100 text-green-700 border-green-300 dark:bg-green-900 dark:text-green-300 dark:border-green-700",
  REJECTED: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900 dark:text-orange-300 dark:border-orange-700",
  FAILED: "bg-red-100 text-red-700 border-red-300 dark:bg-red-900 dark:text-red-300 dark:border-red-700",
  // Legacy statuses
  not_started: "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600",
  in_progress: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-700",
  completed: "bg-green-100 text-green-700 border-green-300 dark:bg-green-900 dark:text-green-300 dark:border-green-700",
  blocked: "bg-red-100 text-red-700 border-red-300 dark:bg-red-900 dark:text-red-300 dark:border-red-700",
  failed: "bg-red-100 text-red-700 border-red-300 dark:bg-red-900 dark:text-red-300 dark:border-red-700",
};

const planStepStatusColors: Record<PlanStepStatus, string> = {
  not_started: "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600",
  in_progress: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-700",
  completed: "bg-green-100 text-green-700 border-green-300 dark:bg-green-900 dark:text-green-300 dark:border-green-700",
  blocked: "bg-red-100 text-red-700 border-red-300 dark:bg-red-900 dark:text-red-300 dark:border-red-700",
};

// ============================================================================
// WorkflowStatusBadge
// ============================================================================

interface WorkflowStatusBadgeProps {
  status: WorkflowStatus;
  className?: string;
  size?: "sm" | "default";
}

/**
 * Badge component for displaying workflow status with appropriate colors
 */
export function WorkflowStatusBadge({
  status,
  className,
  size = "default",
}: WorkflowStatusBadgeProps) {
  const colorClass = workflowStatusColors[status] || workflowStatusColors.not_started;
  const label = getWorkflowStatusLabel(status);

  return (
    <Badge
      variant="outline"
      className={cn(
        colorClass,
        size === "sm" && "text-xs px-1.5 py-0",
        className
      )}
    >
      {label}
    </Badge>
  );
}

// ============================================================================
// PlanStepStatusBadge
// ============================================================================

interface PlanStepStatusBadgeProps {
  status: PlanStepStatus;
  className?: string;
  size?: "sm" | "default";
}

/**
 * Badge component for displaying plan step status with appropriate colors
 */
export function PlanStepStatusBadge({
  status,
  className,
  size = "default",
}: PlanStepStatusBadgeProps) {
  const colorClass = planStepStatusColors[status] || planStepStatusColors.not_started;
  const label = getPlanStepStatusLabel(status);

  return (
    <Badge
      variant="outline"
      className={cn(
        colorClass,
        size === "sm" && "text-xs px-1.5 py-0",
        className
      )}
    >
      {label}
    </Badge>
  );
}

// ============================================================================
// TaskStatusBadge
// ============================================================================

type TaskStatus = "success" | "failure" | "pending";

const taskStatusColors: Record<TaskStatus, string> = {
  pending: "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900 dark:text-yellow-300 dark:border-yellow-700",
  success: "bg-green-100 text-green-700 border-green-300 dark:bg-green-900 dark:text-green-300 dark:border-green-700",
  failure: "bg-red-100 text-red-700 border-red-300 dark:bg-red-900 dark:text-red-300 dark:border-red-700",
};

const taskStatusLabels: Record<TaskStatus, string> = {
  pending: "Pending",
  success: "Success",
  failure: "Failed",
};

interface TaskStatusBadgeProps {
  status: TaskStatus;
  className?: string;
  size?: "sm" | "default";
}

/**
 * Badge component for displaying task status with appropriate colors
 */
export function TaskStatusBadge({
  status,
  className,
  size = "default",
}: TaskStatusBadgeProps) {
  const colorClass = taskStatusColors[status] || taskStatusColors.pending;
  const label = taskStatusLabels[status] || "Unknown";

  return (
    <Badge
      variant="outline"
      className={cn(
        colorClass,
        size === "sm" && "text-xs px-1.5 py-0",
        className
      )}
    >
      {label}
    </Badge>
  );
}

// ============================================================================
// PlanTaskStatusBadge (New Orchestrator Format)
// ============================================================================

const planTaskStatusColors: Record<PlanTaskStatus, string> = {
  pending: "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600",
  in_progress: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-700",
  completed: "bg-green-100 text-green-700 border-green-300 dark:bg-green-900 dark:text-green-300 dark:border-green-700",
  failed: "bg-red-100 text-red-700 border-red-300 dark:bg-red-900 dark:text-red-300 dark:border-red-700",
  skipped: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900 dark:text-orange-300 dark:border-orange-700",
};

interface PlanTaskStatusBadgeProps {
  status: PlanTaskStatus;
  className?: string;
  size?: "sm" | "default";
}

/**
 * Badge component for displaying plan task status (new orchestrator format)
 */
export function PlanTaskStatusBadge({
  status,
  className,
  size = "default",
}: PlanTaskStatusBadgeProps) {
  const colorClass = planTaskStatusColors[status] || planTaskStatusColors.pending;
  const label = getPlanTaskStatusLabel(status);

  return (
    <Badge
      variant="outline"
      className={cn(
        colorClass,
        size === "sm" && "text-xs px-1.5 py-0",
        className
      )}
    >
      {label}
    </Badge>
  );
}

// ============================================================================
// ExecutionLogEventBadge
// ============================================================================

type ExecutionLogEvent = "started" | "completed" | "failed" | "skipped";

const executionLogEventColors: Record<ExecutionLogEvent, string> = {
  started: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-700",
  completed: "bg-green-100 text-green-700 border-green-300 dark:bg-green-900 dark:text-green-300 dark:border-green-700",
  failed: "bg-red-100 text-red-700 border-red-300 dark:bg-red-900 dark:text-red-300 dark:border-red-700",
  skipped: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900 dark:text-orange-300 dark:border-orange-700",
};

const executionLogEventLabels: Record<ExecutionLogEvent, string> = {
  started: "Started",
  completed: "Completed",
  failed: "Failed",
  skipped: "Skipped",
};

interface ExecutionLogEventBadgeProps {
  event: ExecutionLogEvent;
  className?: string;
  size?: "sm" | "default";
}

/**
 * Badge component for displaying execution log events
 */
export function ExecutionLogEventBadge({
  event,
  className,
  size = "default",
}: ExecutionLogEventBadgeProps) {
  const colorClass = executionLogEventColors[event] || executionLogEventColors.started;
  const label = executionLogEventLabels[event] || "Unknown";

  return (
    <Badge
      variant="outline"
      className={cn(
        colorClass,
        size === "sm" && "text-xs px-1.5 py-0",
        className
      )}
    >
      {label}
    </Badge>
  );
}
