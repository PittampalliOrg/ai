"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  SplitViewIcon,
  UnifiedViewIcon,
  IncrementalIcon,
  FullContentIcon,
} from "@/components/icons";
import type { DiffViewMode, DiffContentMode } from "@/lib/diff/types";
import { cn } from "@/lib/utils";

interface DiffToolbarProps {
  viewMode: DiffViewMode;
  contentMode: DiffContentMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  onContentModeChange: (mode: DiffContentMode) => void;
  className?: string;
}

export function DiffToolbar({
  viewMode,
  contentMode,
  onViewModeChange,
  onContentModeChange,
  className,
}: DiffToolbarProps) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {/* View Mode Toggle Group */}
      <TooltipProvider delayDuration={300}>
        <div className="flex items-center rounded-md border border-border bg-muted">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onViewModeChange("unified")}
                className={cn(
                  "h-7 px-2 rounded-none rounded-l-md",
                  viewMode === "unified"
                    ? "bg-primary/20 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
                )}
              >
                <UnifiedViewIcon size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Unified view</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onViewModeChange("split")}
                className={cn(
                  "h-7 px-2 rounded-none rounded-r-md border-l border-border",
                  viewMode === "split"
                    ? "bg-primary/20 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
                )}
              >
                <SplitViewIcon size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Split view</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      {/* Separator */}
      <div className="w-px h-5 bg-border mx-1" />

      {/* Content Mode Toggle Group */}
      <TooltipProvider delayDuration={300}>
        <div className="flex items-center rounded-md border border-border bg-muted">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onContentModeChange("incremental")}
                className={cn(
                  "h-7 px-2 rounded-none rounded-l-md",
                  contentMode === "incremental"
                    ? "bg-primary/20 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
                )}
              >
                <IncrementalIcon size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Changes only</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onContentModeChange("full")}
                className={cn(
                  "h-7 px-2 rounded-none rounded-r-md border-l border-border",
                  contentMode === "full"
                    ? "bg-primary/20 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
                )}
              >
                <FullContentIcon size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Full file</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  );
}
