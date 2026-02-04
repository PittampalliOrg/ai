"use client";

import { memo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  WrenchIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
  ChevronDownIcon,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Loader } from "@/components/ai-elements/loader";
import type { TaskData } from "@/hooks/use-workflow-stream";

// Generic activity item type - uses unknown for flexibility
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ActivityItem = any;

// ToolGroup interface for the component props
interface ToolGroup {
  toolName: string;
  items: ActivityItem[];
  firstTimestamp: Date;
  lastTimestamp: Date;
  completedCount: number;
  runningCount: number;
  errorCount: number;
}

interface ToolGroupCardProps {
  group: ToolGroup;
  tasks?: TaskData[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderToolCard: (item: any, tasks: TaskData[]) => React.ReactNode;
}

const TOOL_LABELS: Record<string, string> = {
  read: "Read File",
  write: "Write File",
  edit: "Edit File",
  create: "Create File",
  str_replace_based_edit_tool: "Edit File",
  shell: "Shell Command",
  bash: "Bash Command",
  grep: "Search Content",
  glob: "Find Files",
  search: "Search",
  task: "Agent Task",
  file_change: "File Changed",
  modify: "File Modified",
  delete: "File Deleted",
};

/**
 * Get display label for a tool
 */
function getToolLabel(toolName: string): string {
  const normalizedName = toolName.toLowerCase();
  return TOOL_LABELS[normalizedName] || toolName;
}

/**
 * ToolGroupCard - Displays a group of consecutive tool calls collapsed by default
 * Uses QueueSection pattern for consistent collapsible styling
 */
export const ToolGroupCard = memo(function ToolGroupCard({
  group,
  tasks = [],
  renderToolCard,
}: ToolGroupCardProps) {
  const { toolName, items, completedCount, runningCount, errorCount } = group;
  const hasRunning = runningCount > 0;
  const hasErrors = errorCount > 0;

  // Auto-expand if there are running items
  const [isOpen, setIsOpen] = useState(hasRunning);

  const label = getToolLabel(toolName);
  const count = items.length;

  // Determine status badge
  const StatusBadge = () => {
    if (hasRunning) {
      return (
        <Badge
          variant="secondary"
          className="gap-1 bg-blue-500/10 text-blue-600 dark:text-blue-400"
        >
          <Loader className="size-3" />
          Running
        </Badge>
      );
    }
    if (hasErrors) {
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircleIcon className="size-3" />
          {errorCount} error{errorCount > 1 ? "s" : ""}
        </Badge>
      );
    }
    return (
      <Badge
        variant="secondary"
        className="gap-1 bg-green-500/10 text-green-600 dark:text-green-400"
      >
        <CheckCircle2Icon className="size-3" />
        Done
      </Badge>
    );
  };

  return (
    <div className="ml-11">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              "group flex w-full items-center justify-between rounded-lg bg-muted/40 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted",
              "border border-transparent hover:border-border/50"
            )}
            type="button"
          >
            <span className="flex items-center gap-2 text-muted-foreground">
              <ChevronDownIcon
                className={cn(
                  "size-4 transition-transform duration-200",
                  !isOpen && "-rotate-90"
                )}
              />
              <WrenchIcon className="size-4" />
              <span className="font-medium">
                {count}x {label}
              </span>
              {completedCount > 0 && runningCount > 0 && (
                <span className="text-xs text-muted-foreground/70">
                  ({completedCount} done, {runningCount} running)
                </span>
              )}
            </span>
            <StatusBadge />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 space-y-2 border-l-2 border-muted pl-4 ml-2">
            {items.map((item) => (
              <div key={item.id} className="relative tool-group-item">
                {/* Connection dot */}
                <div className="absolute -left-[21px] top-3 size-2 rounded-full bg-muted-foreground/30" />
                {/* Remove nested ml-11 margins for grouped items */}
                <div className="[&>div]:ml-0">
                  {renderToolCard(item, tasks)}
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
});

export type { ToolGroup };
