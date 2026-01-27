"use client";

/**
 * Agent Workflow View Component
 *
 * Main container that composes all agent workflow UI pieces:
 * - AgentWorkflowSidebar (left panel)
 *   - TaskPromptSection
 *   - AgentPhaseIndicator
 *   - PlanApprovalSection
 *   - ActiveToolCard
 *   - ToolCallTimeline
 *   - FileChangesSummary
 * - AgentExecutionPanel (right panel)
 *   - ActivityTab
 *   - LogsTab
 *   - DiffTab
 */

import { memo, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useWorkflowExecution } from "@/contexts/workflow-execution-context";
import { useWorkflow } from "@/hooks/use-workflows";

// Components
import { AgentPhaseIndicator, derivePhase } from "./agent-phase-indicator";
import { PlanApprovalSection } from "./plan-approval-section";
import { ActiveToolCard } from "./active-tool-card";
import { ToolCallTimelineCompact, extractToolHistory } from "./tool-call-timeline";
import { AgentActivityTab } from "./agent-activity-tab";
import { WorkflowLogs } from "@/components/workflow/workflow-logs";
import { DiffView } from "@/components/agent/views/diff-view";

interface AgentWorkflowViewProps {
  taskPrompt?: string | null;
  className?: string;
}

export const AgentWorkflowView = memo(function AgentWorkflowView({
  taskPrompt: externalTaskPrompt,
  className,
}: AgentWorkflowViewProps) {
  const {
    workflowId,
    taskPrompt: contextTaskPrompt,
    events,
    accumulatedText,
    latestToolCall,
    executionStatus,
    fileChanges,
    fileChangeArray,
    fileChangeStats,
    logs,
    isConnected,
  } = useWorkflowExecution();

  // Fetch workflow detail for plan information
  const { workflow } = useWorkflow(workflowId, 3000);

  // Derive agent-specific state
  const phase = useMemo(() => derivePhase(events), [events]);
  const toolHistory = useMemo(() => extractToolHistory(events), [events]);
  const isAwaitingApproval = phase === "approve";
  const isStreaming = executionStatus === "running" && accumulatedText.length > 0;

  const taskPrompt = externalTaskPrompt ?? contextTaskPrompt;

  return (
    <div className={cn("flex h-full", className)}>
      {/* Left: Sidebar */}
      <div className="w-[380px] flex-shrink-0 border-r border-zinc-800">
        <AgentWorkflowSidebar
          taskPrompt={taskPrompt}
          workflowId={workflowId}
          events={events}
          phase={phase}
          isAwaitingApproval={isAwaitingApproval}
          latestToolCall={latestToolCall}
          toolHistory={toolHistory}
          fileChanges={fileChangeArray}
          fileStats={fileChangeStats}
          plan={workflow?.plan}
          isConnected={isConnected}
          executionStatus={executionStatus}
        />
      </div>

      {/* Right: Execution Panel */}
      <div className="flex-1 overflow-hidden">
        <AgentExecutionPanel
          events={events}
          accumulatedText={accumulatedText}
          isStreaming={isStreaming}
          logs={logs}
          fileChanges={fileChanges}
          fileChangeArray={fileChangeArray}
          fileStats={fileChangeStats}
          isConnected={isConnected}
        />
      </div>
    </div>
  );
});

// ============================================================================
// Sidebar Component
// ============================================================================

interface AgentWorkflowSidebarProps {
  taskPrompt: string | null;
  workflowId: string | null;
  events: ReturnType<typeof useWorkflowExecution>["events"];
  phase: ReturnType<typeof derivePhase>;
  isAwaitingApproval: boolean;
  latestToolCall: ReturnType<typeof useWorkflowExecution>["latestToolCall"];
  toolHistory: ReturnType<typeof extractToolHistory>;
  fileChanges: ReturnType<typeof useWorkflowExecution>["fileChangeArray"];
  fileStats: ReturnType<typeof useWorkflowExecution>["fileChangeStats"];
  plan?: {
    id: string;
    title: string;
    summary: string;
    tasks: Array<{
      id: string;
      title: string;
      description?: string;
      status?: string;
    }>;
  } | null;
  isConnected: boolean;
  executionStatus: ReturnType<typeof useWorkflowExecution>["executionStatus"];
}

const AgentWorkflowSidebar = memo(function AgentWorkflowSidebar({
  taskPrompt,
  workflowId,
  events,
  phase,
  isAwaitingApproval,
  latestToolCall,
  toolHistory,
  fileChanges,
  fileStats,
  plan,
  isConnected,
  executionStatus,
}: AgentWorkflowSidebarProps) {
  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Task Prompt Section */}
      <TaskPromptSection prompt={taskPrompt} />

      {/* Divider */}
      <div className="border-b border-zinc-800" />

      {/* Phase Indicator */}
      <AgentPhaseIndicator events={events} workflowId={workflowId} />

      {/* Divider */}
      <div className="border-b border-zinc-800" />

      {/* Plan Approval Section (when awaiting approval) */}
      {isAwaitingApproval && (
        <PlanApprovalSection
          workflowId={workflowId}
          planTitle={plan?.title}
          planSummary={plan?.summary}
          planSteps={plan?.tasks}
        />
      )}

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto">
        {/* Current Tool */}
        {latestToolCall && executionStatus === "running" && (
          <div className="p-4 border-b border-zinc-800">
            <div className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wide">
              Current Tool
            </div>
            <ActiveToolCard
              toolCall={{
                toolName: latestToolCall.toolName,
                toolInput: latestToolCall.toolInput,
                status: "running",
              }}
            />
          </div>
        )}

        {/* Tool History */}
        {toolHistory.length > 0 && (
          <div className="p-4 border-b border-zinc-800">
            <div className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wide">
              Tool History
            </div>
            <ToolCallTimelineCompact events={events} maxItems={8} />
          </div>
        )}
      </div>

      {/* File Changes Summary (sticky bottom) */}
      {fileChanges.length > 0 && (
        <FileChangesSummary files={fileChanges} stats={fileStats} />
      )}

      {/* Connection Status */}
      <ConnectionStatusBar isConnected={isConnected} status={executionStatus} />
    </div>
  );
});

// ============================================================================
// Execution Panel Component
// ============================================================================

type TabType = "activity" | "logs" | "diff";

interface AgentExecutionPanelProps {
  events: ReturnType<typeof useWorkflowExecution>["events"];
  accumulatedText: string;
  isStreaming: boolean;
  logs: ReturnType<typeof useWorkflowExecution>["logs"];
  fileChanges: ReturnType<typeof useWorkflowExecution>["fileChanges"];
  fileChangeArray: ReturnType<typeof useWorkflowExecution>["fileChangeArray"];
  fileStats: ReturnType<typeof useWorkflowExecution>["fileChangeStats"];
  isConnected: boolean;
}

const AgentExecutionPanel = memo(function AgentExecutionPanel({
  events,
  accumulatedText,
  isStreaming,
  logs,
  fileChanges,
  fileChangeArray,
  fileStats,
  isConnected,
}: AgentExecutionPanelProps) {
  const [selectedTab, setSelectedTab] = useState<TabType>("activity");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full bg-zinc-900">
      {/* Tab Header */}
      <div className="flex items-center border-b border-zinc-800">
        <TabButton
          isActive={selectedTab === "activity"}
          onClick={() => setSelectedTab("activity")}
        >
          Activity
        </TabButton>

        <TabButton
          isActive={selectedTab === "logs"}
          onClick={() => setSelectedTab("logs")}
        >
          <span>Logs</span>
          {logs.length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-zinc-800 rounded">
              {logs.length}
            </span>
          )}
        </TabButton>

        <TabButton
          isActive={selectedTab === "diff"}
          onClick={() => setSelectedTab("diff")}
        >
          <span>Diffs</span>
          {fileChangeArray.length > 0 && (
            <span className="ml-1.5 text-xs font-mono tabular-nums">
              <span className="text-emerald-400">+{fileStats.additions}</span>
              <span className="text-zinc-600 mx-0.5">/</span>
              <span className="text-red-400">-{fileStats.deletions}</span>
            </span>
          )}
        </TabButton>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden relative">
        {selectedTab === "activity" && (
          <AgentActivityTab
            events={events}
            accumulatedText={accumulatedText}
            isStreaming={isStreaming}
          />
        )}
        {selectedTab === "logs" && (
          <WorkflowLogs logs={logs} isConnected={isConnected} />
        )}
        {selectedTab === "diff" && (
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

const TaskPromptSection = memo(function TaskPromptSection({
  prompt,
}: {
  prompt: string | null;
}) {
  if (!prompt) {
    return (
      <div className="p-4 text-zinc-500 text-sm italic">
        No task submitted yet
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wide">
        Task
      </div>
      <div className="bg-zinc-900 rounded-lg p-3 border border-zinc-800">
        <p className="text-sm text-zinc-200 whitespace-pre-wrap break-words">
          {prompt.length > 500 ? prompt.slice(0, 500) + "..." : prompt}
        </p>
      </div>
    </div>
  );
});

const FileChangesSummary = memo(function FileChangesSummary({
  files,
  stats,
}: {
  files: ReturnType<typeof useWorkflowExecution>["fileChangeArray"];
  stats: { additions: number; deletions: number };
}) {
  return (
    <div className="border-t border-zinc-800 p-4 bg-zinc-900/50">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-zinc-500 font-medium uppercase tracking-wide">
          Files Changed ({files.length})
        </span>
        <span className="text-xs font-mono tabular-nums">
          <span className="text-emerald-400">+{stats.additions}</span>
          <span className="text-zinc-600 mx-1">/</span>
          <span className="text-red-400">-{stats.deletions}</span>
        </span>
      </div>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {files.slice(0, 10).map((file) => (
          <FileChangeLine key={file.path} file={file} />
        ))}
        {files.length > 10 && (
          <p className="text-xs text-zinc-500 pt-1">
            +{files.length - 10} more files
          </p>
        )}
      </div>
    </div>
  );
});

const FileChangeLine = memo(function FileChangeLine({
  file,
}: {
  file: ReturnType<typeof useWorkflowExecution>["fileChangeArray"][0];
}) {
  const fileName = file.path.split("/").pop() || file.path;
  const dirPath = file.path.slice(0, -fileName.length - 1);

  return (
    <div className="flex items-center gap-2 text-xs group">
      <span
        className={cn(
          "w-1 h-1 rounded-full flex-shrink-0",
          file.isNew ? "bg-green-500" : "bg-yellow-500"
        )}
      />
      <span className="truncate flex-1 text-zinc-400" title={file.path}>
        {dirPath && (
          <span className="text-zinc-600">{dirPath}/</span>
        )}
        <span className="text-zinc-300">{fileName}</span>
      </span>
      <span className="flex-shrink-0 font-mono text-zinc-500 tabular-nums">
        <span className="text-emerald-500">+{file.additions}</span>
        {file.deletions > 0 && (
          <>
            <span className="text-zinc-600">/</span>
            <span className="text-red-500">-{file.deletions}</span>
          </>
        )}
      </span>
    </div>
  );
});

const ConnectionStatusBar = memo(function ConnectionStatusBar({
  isConnected,
  status,
}: {
  isConnected: boolean;
  status: string;
}) {
  return (
    <div className="px-4 py-2 border-t border-zinc-800 flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            isConnected ? "bg-green-500" : "bg-zinc-500"
          )}
        />
        <span className={isConnected ? "text-green-400" : "text-zinc-500"}>
          {isConnected ? "Connected" : "Disconnected"}
        </span>
      </span>
      <span className="text-zinc-500 capitalize">{status}</span>
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
