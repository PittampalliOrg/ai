"use client";

/**
 * Ralph Plan View Component
 *
 * Displays the current plan with item status, progress, and details.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  FileCode,
  GitBranch,
  SkipForward,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  type TaskPlan,
  type TaskPlanItem,
  getPlanStats,
} from "@/lib/types/ralph-plan";
import {
  getPlanStatusLabel,
  getItemStatusLabel,
  getStatusColor,
} from "@/hooks/use-ralph-workflow";

// ============================================================================
// Types
// ============================================================================

interface RalphPlanViewProps {
  plan: TaskPlan;
  /** Whether to show compact view */
  compact?: boolean;
  /** Callback when an item is selected */
  onItemSelect?: (item: TaskPlanItem) => void;
  /** Currently selected item ID */
  selectedItemId?: string;
}

// ============================================================================
// Sub-components
// ============================================================================

function ItemStatusIcon({ status }: { status: TaskPlanItem["status"] }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "failed":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case "in_progress":
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case "skipped":
      return <SkipForward className="h-4 w-4 text-gray-400" />;
    case "pending":
    default:
      return <Circle className="h-4 w-4 text-gray-400" />;
  }
}

function PlanItemCard({
  item,
  index,
  isSelected,
  onSelect,
}: {
  item: TaskPlanItem;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className={cn(
        "border rounded-lg p-3 cursor-pointer transition-colors",
        isSelected
          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
      )}
      onClick={onSelect}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <ItemStatusIcon status={item.status} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{item.title}</span>
            <Badge
              variant="outline"
              className={cn("text-xs", getStatusColor(item.status))}
            >
              {getItemStatusLabel(item.status)}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {item.description}
          </p>
        </div>
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
        </Collapsible>
      </div>

      {/* Expandable Details */}
      <Collapsible open={isExpanded}>
        <CollapsibleContent>
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            {/* Files */}
            {item.files.length > 0 && (
              <div className="mb-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                  <FileCode className="h-3 w-3" />
                  <span>Files</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {item.files.map((file) => (
                    <Badge
                      key={file}
                      variant="secondary"
                      className="text-xs font-mono"
                    >
                      {file}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Dependencies */}
            {item.dependencies.length > 0 && (
              <div className="mb-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                  <GitBranch className="h-3 w-3" />
                  <span>Depends on</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {item.dependencies.map((dep) => (
                    <Badge key={dep} variant="outline" className="text-xs">
                      {dep}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Acceptance Criteria */}
            {item.acceptanceCriteria && item.acceptanceCriteria.length > 0 && (
              <div className="mb-2">
                <div className="text-xs text-muted-foreground mb-1">
                  Acceptance Criteria
                </div>
                <ul className="text-xs space-y-1">
                  {item.acceptanceCriteria.map((criterion, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-gray-400">•</span>
                      <span>{criterion}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Result (if completed or failed) */}
            {item.result && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Result</div>
                <div
                  className={cn(
                    "text-xs p-2 rounded",
                    item.result.success
                      ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300"
                      : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300"
                  )}
                >
                  {item.result.message || item.result.error || "Completed"}
                  {item.result.filesModified &&
                    item.result.filesModified.length > 0 && (
                      <div className="mt-1">
                        <span className="font-medium">Modified: </span>
                        {item.result.filesModified.join(", ")}
                      </div>
                    )}
                  {item.result.duration && (
                    <div className="mt-1 text-gray-500">
                      Duration: {(item.result.duration / 1000).toFixed(1)}s
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </motion.div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function RalphPlanView({
  plan,
  compact = false,
  onItemSelect,
  selectedItemId,
}: RalphPlanViewProps) {
  const stats = getPlanStats(plan);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-lg truncate">{plan.title}</h2>
          <Badge
            variant="outline"
            className={cn("ml-2 shrink-0", getStatusColor(plan.status))}
          >
            {getPlanStatusLabel(plan.status)}
          </Badge>
        </div>
        {!compact && (
          <p className="text-sm text-muted-foreground">{plan.objective}</p>
        )}

        {/* Progress */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>
              {stats.completed + stats.skipped} of {stats.total} items
            </span>
            <span>{stats.percentComplete}%</span>
          </div>
          <Progress value={stats.percentComplete} className="h-2" />
        </div>

        {/* Stats badges */}
        <div className="flex flex-wrap gap-2 mt-2">
          {stats.inProgress > 0 && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {stats.inProgress} in progress
            </Badge>
          )}
          {stats.completed > 0 && (
            <Badge
              variant="secondary"
              className="text-xs gap-1 text-green-600 dark:text-green-400"
            >
              <CheckCircle2 className="h-3 w-3" />
              {stats.completed} completed
            </Badge>
          )}
          {stats.failed > 0 && (
            <Badge
              variant="secondary"
              className="text-xs gap-1 text-red-600 dark:text-red-400"
            >
              <AlertCircle className="h-3 w-3" />
              {stats.failed} failed
            </Badge>
          )}
          {stats.pending > 0 && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Clock className="h-3 w-3" />
              {stats.pending} pending
            </Badge>
          )}
        </div>

        {/* Iteration info */}
        {plan.iteration > 1 && (
          <div className="text-xs text-muted-foreground mt-2">
            Iteration {plan.iteration}
          </div>
        )}
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {plan.items.map((item, index) => (
              <PlanItemCard
                key={item.id}
                item={item}
                index={index}
                isSelected={selectedItemId === item.id}
                onSelect={() => onItemSelect?.(item)}
              />
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Footer with PR info */}
      {plan.prInfo && (
        <div className="p-4 border-t bg-green-50 dark:bg-green-950/30">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <div>
              <p className="font-medium text-sm text-green-700 dark:text-green-300">
                Pull Request Created
              </p>
              <a
                href={plan.prInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                #{plan.prInfo.number} - View PR
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RalphPlanView;
