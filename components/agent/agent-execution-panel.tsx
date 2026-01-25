"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { XIcon, FullscreenIcon, MinimizeIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { TabType, FileChange, LogEntry } from "@/hooks/use-agent-execution";
import { DiffView } from "./views/diff-view";
import { LogsView } from "./views/logs-view";

interface AgentExecutionPanelProps {
  selectedTab: TabType;
  onTabChange: (tab: TabType) => void;
  fileChanges: Map<string, FileChange>;
  fileChangeArray: FileChange[]; // Stable array from hook
  logs: LogEntry[];
  selectedFile: string | null;
  onFileSelect: (path: string | null) => void;
  onClose?: () => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
}

export const AgentExecutionPanel = memo(function AgentExecutionPanel({
  selectedTab,
  onTabChange,
  fileChanges,
  fileChangeArray,
  logs,
  selectedFile,
  onFileSelect,
  onClose,
  isMaximized = false,
  onToggleMaximize,
}: AgentExecutionPanelProps) {
  return (
    <div className={cn(
      "flex h-full flex-col border-l bg-background transition-all duration-200",
      isMaximized ? "absolute inset-0 z-50" : "flex-1 min-w-0"
    )}>
      {/* Tab Header */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex gap-1">
          <TabButton
            active={selectedTab === "diff"}
            onClick={() => onTabChange("diff")}
            count={fileChanges.size}
          >
            Diff
          </TabButton>
          <TabButton
            active={selectedTab === "logs"}
            onClick={() => onTabChange("logs")}
          >
            Logs
          </TabButton>
        </div>
        <div className="flex items-center gap-1">
          {onToggleMaximize && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={onToggleMaximize}
                  >
                    {isMaximized ? <MinimizeIcon size={16} /> : <FullscreenIcon size={16} />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">{isMaximized ? "Restore" : "Maximize"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {onClose && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={onClose}
                  >
                    <XIcon size={16} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">Close panel</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Tab Content */}
      <ScrollArea className="flex-1">
        {selectedTab === "diff" ? (
          <DiffView
            fileChanges={fileChanges}
            fileChangeArray={fileChangeArray}
            selectedFile={selectedFile}
            onFileSelect={onFileSelect}
          />
        ) : (
          <LogsView logs={logs} />
        )}
      </ScrollArea>
    </div>
  );
});

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}

const TabButton = memo(function TabButton({ active, onClick, children, count }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      )}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span className="ml-1.5 text-xs text-muted-foreground">({count})</span>
      )}
    </button>
  );
});
