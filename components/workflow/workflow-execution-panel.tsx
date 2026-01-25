"use client";

/**
 * Workflow Execution Panel Component
 *
 * Right panel with tab system:
 * - Logs: Stream events with agent badges
 * - Diffs: File changes with diff view
 */

import { memo, useState, useEffect, useRef } from "react";
import { useWorkflowExecution } from "@/contexts/workflow-execution-context";
import { WorkflowLogs } from "./workflow-logs";
import { DiffView } from "@/components/agent/views/diff-view";
import { cn } from "@/lib/utils";

type TabType = "logs" | "diff";

interface WorkflowExecutionPanelProps {
  className?: string;
  defaultTab?: TabType;
}

export const WorkflowExecutionPanel = memo(function WorkflowExecutionPanel({
  className,
  defaultTab = "logs",
}: WorkflowExecutionPanelProps) {
  const [selectedTab, setSelectedTab] = useState<TabType>(defaultTab);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const hasAutoSwitchedRef = useRef(false);

  const {
    logs,
    fileChanges,
    fileChangeArray,
    fileChangeStats,
    executionStatus,
    isConnected,
  } = useWorkflowExecution();

  // Auto-switch to diff tab when files are changed and execution completes
  useEffect(() => {
    if (
      fileChangeArray.length > 0 &&
      executionStatus === "completed" &&
      !hasAutoSwitchedRef.current
    ) {
      hasAutoSwitchedRef.current = true;
      setSelectedTab("diff");
    }
  }, [fileChangeArray.length, executionStatus]);

  return (
    <div className={cn("flex flex-col h-full bg-zinc-900", className)}>
      {/* Tab Header */}
      <TabHeader
        selectedTab={selectedTab}
        onTabChange={setSelectedTab}
        logCount={logs.length}
        fileCount={fileChangeArray.length}
        fileStats={fileChangeStats}
      />

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {selectedTab === "logs" ? (
          <WorkflowLogs logs={logs} isConnected={isConnected} />
        ) : (
          <DiffView
            fileChanges={fileChanges}
            fileChangeArray={fileChangeArray}
            selectedFile={selectedFile}
            onFileSelect={setSelectedFile}
          />
        )}
      </div>
    </div>
  );
});

// ============================================================================
// Sub-components
// ============================================================================

interface TabHeaderProps {
  selectedTab: TabType;
  onTabChange: (tab: TabType) => void;
  logCount: number;
  fileCount: number;
  fileStats: { additions: number; deletions: number };
}

const TabHeader = memo(function TabHeader({
  selectedTab,
  onTabChange,
  logCount,
  fileCount,
  fileStats,
}: TabHeaderProps) {
  return (
    <div className="flex items-center border-b border-zinc-800">
      <TabButton
        isActive={selectedTab === "logs"}
        onClick={() => onTabChange("logs")}
      >
        <span>Logs</span>
        {logCount > 0 && (
          <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-zinc-800 rounded">
            {logCount}
          </span>
        )}
      </TabButton>

      <TabButton
        isActive={selectedTab === "diff"}
        onClick={() => onTabChange("diff")}
      >
        <span>Diffs</span>
        {fileCount > 0 && (
          <span className="ml-1.5 text-xs font-mono tabular-nums">
            <span className="text-emerald-400">+{fileStats.additions}</span>
            <span className="text-zinc-600 mx-0.5">/</span>
            <span className="text-red-400">-{fileStats.deletions}</span>
          </span>
        )}
      </TabButton>
    </div>
  );
});

interface TabButtonProps {
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const TabButton = memo(function TabButton({
  isActive,
  onClick,
  children,
}: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center px-4 py-3 text-sm font-medium border-b-2 transition-colors",
        isActive
          ? "border-blue-500 text-zinc-200"
          : "border-transparent text-zinc-500 hover:text-zinc-400"
      )}
    >
      {children}
    </button>
  );
});
