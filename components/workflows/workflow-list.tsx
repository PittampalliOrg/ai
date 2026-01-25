"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { WorkflowStatusBadge } from "./workflow-status-badge";
import type { WorkflowListItem } from "@/lib/types/workflow";
import { formatDistanceToNow } from "date-fns";

// ============================================================================
// Helpers
// ============================================================================

function safeFormatTimeAgo(dateString: string | undefined): string | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  return formatDistanceToNow(date, { addSuffix: true });
}

// ============================================================================
// WorkflowCard
// ============================================================================

interface WorkflowCardProps {
  workflow: WorkflowListItem;
}

/**
 * Card component displaying a single workflow summary
 */
function WorkflowCard({ workflow }: WorkflowCardProps) {
  const progress =
    (workflow.planStepsCount ?? 0) > 0
      ? Math.round(
          ((workflow.planStepsCompleted ?? 0) / (workflow.planStepsCount ?? 1)) * 100
        )
      : 0;

  const timeAgo = safeFormatTimeAgo(workflow.updatedAt) ?? safeFormatTimeAgo(workflow.createdAt);

  const cardContent = (
    <Card className={workflow.instanceId ? "hover:bg-muted/50 transition-colors cursor-pointer" : "opacity-60"}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-medium line-clamp-1">
            {workflow.topic || workflow.instanceId || "Unknown Workflow"}
          </CardTitle>
          <WorkflowStatusBadge status={workflow.status} size="sm" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground font-mono truncate">
          {workflow.instanceId || "No ID"}
        </p>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Plan Progress</span>
            <span>
              {workflow.planStepsCompleted} / {workflow.planStepsCount} steps
            </span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>

        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{workflow.taskCount} tasks</span>
          {timeAgo && <span>{timeAgo}</span>}
        </div>
      </CardContent>
    </Card>
  );

  if (!workflow.instanceId) {
    return cardContent;
  }

  return (
    <Link href={`/workflows/${encodeURIComponent(workflow.instanceId)}`}>
      {cardContent}
    </Link>
  );
}

// ============================================================================
// WorkflowList
// ============================================================================

interface WorkflowListProps {
  workflows: WorkflowListItem[];
  isLoading?: boolean;
}

/**
 * Grid component displaying a list of workflow cards
 */
export function WorkflowList({ workflows, isLoading }: WorkflowListProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <WorkflowCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (workflows.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No workflows found</p>
        <p className="text-sm text-muted-foreground mt-1">
          Workflows will appear here when they are started
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {workflows.map((workflow, index) => (
        <WorkflowCard key={workflow.instanceId ?? `workflow-${index}`} workflow={workflow} />
      ))}
    </div>
  );
}

// ============================================================================
// Skeleton
// ============================================================================

function WorkflowCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="h-5 w-3/4 bg-muted animate-pulse rounded" />
          <div className="h-5 w-20 bg-muted animate-pulse rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-4 w-full bg-muted animate-pulse rounded" />
        <div className="space-y-1">
          <div className="flex justify-between">
            <div className="h-3 w-24 bg-muted animate-pulse rounded" />
            <div className="h-3 w-16 bg-muted animate-pulse rounded" />
          </div>
          <div className="h-1.5 w-full bg-muted animate-pulse rounded" />
        </div>
        <div className="flex justify-between">
          <div className="h-3 w-16 bg-muted animate-pulse rounded" />
          <div className="h-3 w-20 bg-muted animate-pulse rounded" />
        </div>
      </CardContent>
    </Card>
  );
}
