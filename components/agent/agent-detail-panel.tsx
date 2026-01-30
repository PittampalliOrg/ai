"use client";

/**
 * Agent Detail Panel Component
 *
 * Right panel with toggleable tabs:
 * - Diff: Existing DiffView component
 * - Logs: Merged activity + logs content
 *
 * Events from server.ts are emitted in AI SDK-compatible format:
 * - type: "part" with data matching TextUIPart, ReasoningUIPart, or DynamicToolUIPart
 *
 * For backward compatibility, legacy event types are also supported.
 */

import { memo, useMemo, useRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { X, ArrowDownIcon, ChevronRight, ListTodoIcon, PlayCircleIcon, CheckCircle2Icon } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { WorkflowStreamEvent, TaskData } from "@/hooks/use-workflow-stream";
import { isTaskTool, isPlanTool } from "@/hooks/use-workflow-stream";
import { useTaskAggregation } from "@/hooks/use-task-aggregation";
import type { FileChange, WorkflowLogEntry } from "@/contexts/workflow-execution-context";
import type { TextUIPart, ReasoningUIPart, DynamicToolUIPart } from "ai";

// Existing components
import { DiffView } from "@/components/agent/views/diff-view";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";

// Task/Plan components
import { AgentTaskCard } from "./agent-task-card";
import { AgentPlanCard, type PlanStatus } from "./agent-plan-card";

// AI Elements for activity display
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from "@/components/ai-elements/reasoning";

// ============================================================================
// Types
// ============================================================================

export type DetailTabType = "diff" | "logs";

interface AgentDetailPanelProps {
  activeTab: DetailTabType;
  onTabChange: (tab: DetailTabType) => void;
  onClose: () => void;
  // Diff props
  fileChanges: Map<string, FileChange>;
  fileChangeArray: FileChange[];
  fileStats: { additions: number; deletions: number };
  // Logs props
  events: WorkflowStreamEvent[];
  logs: WorkflowLogEntry[];
  accumulatedText: string;
  isStreaming: boolean;
  isConnected: boolean;
  // Plan approval handlers
  onPlanApprove?: () => void;
  onPlanReject?: () => void;
  className?: string;
}

// ============================================================================
// Tab Button Component
// ============================================================================

const TabButton = memo(function TabButton({
  isActive,
  onClick,
  children,
}: {
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center px-4 py-3 text-sm font-medium border-b-2 transition-colors",
        isActive
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
});

// ============================================================================
// Merged Logs View (Activity + Logs combined)
// ============================================================================

interface MergedLogsViewProps {
  events: WorkflowStreamEvent[];
  logs: WorkflowLogEntry[];
  accumulatedText: string;
  isStreaming: boolean;
  isConnected: boolean;
  onPlanApprove?: () => void;
  onPlanReject?: () => void;
}

// useTaskAggregation is now imported from "@/hooks/use-task-aggregation"

const MergedLogsView = memo(function MergedLogsView({
  events,
  logs,
  accumulatedText,
  isStreaming,
  isConnected,
  onPlanApprove,
  onPlanReject,
}: MergedLogsViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs.length, events.length, accumulatedText, autoScroll]);

  // Detect manual scroll
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  // Convert events to activity items for display
  const activityItems = useMemo(() => {
    return eventsToActivityItems(events);
  }, [events]);

  // Aggregate tasks for plan card
  const { tasks, planStatus, hasActivePlan } = useTaskAggregation(events);

  const isEmpty = activityItems.length === 0 && logs.length === 0 && !accumulatedText;

  return (
    <div className="flex flex-col h-full relative">
      {/* Connection status */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-sm text-muted-foreground">
          {activityItems.length + logs.length} entries
        </span>
        <span className="flex items-center gap-1.5 text-xs">
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              isConnected ? "bg-green-500" : "bg-muted-foreground"
            )}
          />
          <span className={isConnected ? "text-green-400" : "text-muted-foreground"}>
            {isConnected ? "Connected" : "Disconnected"}
          </span>
        </span>
      </div>

      {/* Scrollable content */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">No activity yet</p>
            <p className="text-xs">Logs will appear here as the agent works</p>
          </div>
        ) : (
          <>
            {/* Aggregated Plan Card at top when tasks exist */}
            {hasActivePlan && tasks.length > 0 && (
              <AgentPlanCard
                title="Implementation Plan"
                tasks={tasks}
                status={planStatus}
                isStreaming={isStreaming && planStatus === "planning"}
                onApprove={onPlanApprove}
                onReject={onPlanReject}
                className="mb-4"
              />
            )}

            {/* Activity items (filtered to avoid duplicate task displays) */}
            {activityItems
              .filter((item) => {
                // Skip task_created events when we have plan card (they're shown there)
                if (hasActivePlan && tasks.length > 0 && item.type === "task_created") {
                  return false;
                }
                // Skip TaskCreate tool parts when we have plan card
                if (hasActivePlan && tasks.length > 0 && item.type === "part" && item.part) {
                  const part = item.part;
                  if (isDynamicToolPart(part) && part.toolName === "TaskCreate") {
                    return false;
                  }
                }
                return true;
              })
              .map((item) => (
                <ActivityEntry key={item.id} item={item} allTasks={tasks} />
              ))}

            {/* Streaming text */}
            {isStreaming && accumulatedText && (
              <StreamingEntry content={accumulatedText} />
            )}
          </>
        )}
      </div>

      {/* Jump to bottom button */}
      {!autoScroll && (
        <div className="absolute bottom-4 right-4">
          <Button
            size="sm"
            variant="secondary"
            className="shadow-lg gap-1.5"
            onClick={() => {
              setAutoScroll(true);
              scrollRef.current?.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: "smooth",
              });
            }}
          >
            <ArrowDownIcon className="size-3.5" />
            Jump to latest
          </Button>
        </div>
      )}
    </div>
  );
});

// ============================================================================
// Activity Entry Types and Components
// ============================================================================

// Union type for AI SDK UI parts we handle
type AgentUIPart = TextUIPart | ReasoningUIPart | DynamicToolUIPart;

// Activity item types - supports both new AI SDK format and legacy format
type ActivityType = "part" | "thinking" | "text" | "tool_call" | "tool_result" | "progress" | "error" | "task_created" | "task_updated" | "plan_created" | "plan_complete";

interface ActivityItem {
  id: string;
  type: ActivityType;
  timestamp: Date;
  // For new AI SDK part format
  part?: AgentUIPart;
  // Legacy format fields
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  content?: string;
  status?: "running" | "success" | "error";
  agentId?: string;
  // Task-related fields
  task?: TaskData;
  taskId?: string;
  taskStatus?: "pending" | "in_progress" | "completed";
}

/**
 * Type guards for AI SDK UI parts
 */
function isTextPart(part: AgentUIPart): part is TextUIPart {
  return part.type === "text";
}

function isReasoningPart(part: AgentUIPart): part is ReasoningUIPart {
  return part.type === "reasoning";
}

function isDynamicToolPart(part: AgentUIPart): part is DynamicToolUIPart {
  return part.type === "dynamic-tool";
}

/**
 * Convert events to activity items
 *
 * Supports two event formats:
 * 1. NEW: AI SDK-compatible "part" events with data matching TextUIPart, ReasoningUIPart, DynamicToolUIPart
 * 2. LEGACY: Individual event types (thinking, llm_chunk, tool_call, tool_result)
 */
function eventsToActivityItems(events: WorkflowStreamEvent[]): ActivityItem[] {
  const items: ActivityItem[] = [];
  const pendingToolCalls = new Map<string, ActivityItem>();

  for (const event of events) {
    switch (event.type) {
      // NEW: AI SDK-compatible part events
      case "part": {
        const part = event.data as AgentUIPart;
        items.push({
          id: event.id,
          type: "part",
          timestamp: new Date(event.timestamp),
          part,
          agentId: event.agentId,
        });
        break;
      }

      // LEGACY: thinking events
      case "thinking":
        if (event.data.content || event.data.text) {
          const content = (event.data.content || event.data.text || "") as string;
          if (content.trim()) {
            items.push({
              id: `thinking-${event.id}`,
              type: "thinking",
              timestamp: new Date(event.timestamp),
              content,
              agentId: event.agentId,
            });
          }
        }
        break;

      // LEGACY: llm_chunk events
      case "llm_chunk":
        if (event.data.content || event.data.text) {
          const content = (event.data.content || event.data.text || "") as string;
          if (content.trim()) {
            // Accumulate into a single text entry per agent
            const existingText = items.find(
              (i) => i.type === "text" && i.agentId === event.agentId
            );
            if (existingText) {
              existingText.content = (existingText.content || "") + content;
            } else {
              items.push({
                id: `text-${event.id}`,
                type: "text",
                timestamp: new Date(event.timestamp),
                content,
                agentId: event.agentId,
              });
            }
          }
        }
        break;

      // LEGACY: tool_call events
      case "tool_call": {
        const callId = event.data.callId as string | undefined;
        const toolItem: ActivityItem = {
          id: event.id,
          type: "tool_call",
          timestamp: new Date(event.timestamp),
          toolName: event.data.toolName as string,
          toolInput: event.data.toolInput as Record<string, unknown>,
          status: "running",
          agentId: event.agentId,
        };
        items.push(toolItem);
        if (callId) {
          pendingToolCalls.set(callId, toolItem);
        }
        break;
      }

      // LEGACY: tool_result events
      case "tool_result": {
        const callId = event.data.callId as string | undefined;
        const resultOutput = ((event.data.result || event.data.toolOutput) as string) || "";
        const isError = Boolean(event.data.isError);

        // Try to match with pending call
        let matched = callId ? pendingToolCalls.get(callId) : null;
        if (!matched) {
          matched = items.find(
            (i) => i.type === "tool_call" && i.status === "running"
          ) || null;
        }

        if (matched) {
          matched.status = isError ? "error" : "success";
          matched.toolOutput = resultOutput;
          if (callId) pendingToolCalls.delete(callId);
        } else {
          items.push({
            id: event.id,
            type: "tool_result",
            timestamp: new Date(event.timestamp),
            toolName: event.data.toolName as string,
            toolOutput: resultOutput,
            status: isError ? "error" : "success",
            agentId: event.agentId,
          });
        }
        break;
      }

      case "task_progress":
        items.push({
          id: event.id,
          type: "progress",
          timestamp: new Date(event.timestamp),
          content: (event.data.status as string) || "Progress update",
        });
        break;

      case "error":
        items.push({
          id: event.id,
          type: "error",
          timestamp: new Date(event.timestamp),
          content: (event.data.error as string) || "An error occurred",
          status: "error",
        });
        break;

      // NEW: Semantic task and plan events
      case "task_created":
        items.push({
          id: event.id,
          type: "task_created",
          timestamp: new Date(event.timestamp),
          task: event.data.task as TaskData,
          agentId: event.agentId,
        });
        break;

      case "task_updated":
        items.push({
          id: event.id,
          type: "task_updated",
          timestamp: new Date(event.timestamp),
          taskId: event.data.taskId as string,
          taskStatus: event.data.taskStatus as "pending" | "in_progress" | "completed",
          agentId: event.agentId,
        });
        break;

      case "plan_created":
        items.push({
          id: event.id,
          type: "plan_created",
          timestamp: new Date(event.timestamp),
          agentId: event.agentId,
        });
        break;

      case "plan_complete":
        items.push({
          id: event.id,
          type: "plan_complete",
          timestamp: new Date(event.timestamp),
          agentId: event.agentId,
        });
        break;
    }
  }

  return items;
}

const TOOL_LABELS: Record<string, string> = {
  read: "Read File",
  write: "Write File",
  edit: "Edit File",
  bash: "Shell Command",
  grep: "Search Content",
  glob: "Find Files",
  task: "Agent Task",
};

const ActivityEntry = memo(function ActivityEntry({ item, allTasks }: { item: ActivityItem; allTasks?: TaskData[] }) {
  // Handle new AI SDK part format
  if (item.type === "part" && item.part) {
    // Check if this is a TaskCreate/TaskUpdate tool - render as task card
    if (isDynamicToolPart(item.part) && isTaskTool(item.part.toolName)) {
      const part = item.part;
      if (part.toolName === "TaskCreate" && part.state === "output-available") {
        // Parse the task from output
        const taskData = typeof part.output === "string"
          ? JSON.parse(part.output)
          : part.output;
        return <AgentTaskCard task={taskData} isStreaming={false} />;
      }
      if (part.toolName === "TaskUpdate" && part.state === "output-available") {
        // Show compact status update
        const input = part.input as Record<string, unknown> | undefined;
        const taskId = input?.taskId as string;
        const newStatus = input?.status as string;
        return (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-1 pl-2 border-l-2 border-primary/30">
            {newStatus === "completed" && <CheckCircle2Icon className="size-4 text-green-500" />}
            {newStatus === "in_progress" && <PlayCircleIcon className="size-4 text-blue-500" />}
            <span>Task #{taskId} → {newStatus}</span>
          </div>
        );
      }
    }
    // Check if this is a Plan tool - render as plan marker
    if (isDynamicToolPart(item.part) && isPlanTool(item.part.toolName)) {
      const part = item.part;
      if (part.toolName === "EnterPlanMode") {
        return (
          <div className="flex items-center gap-2 text-sm py-2 px-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <ListTodoIcon className="size-4 text-amber-500" />
            <span className="font-medium text-amber-600">Agent entered plan mode</span>
          </div>
        );
      }
      if (part.toolName === "ExitPlanMode") {
        return (
          <div className="flex items-center gap-2 text-sm py-2 px-3 bg-green-500/10 border border-green-500/30 rounded-lg">
            <CheckCircle2Icon className="size-4 text-green-500" />
            <span className="font-medium text-green-600">Plan ready for approval</span>
          </div>
        );
      }
    }
    return <PartEntry part={item.part} />;
  }

  // Handle semantic task/plan events
  if (item.type === "task_created" && item.task) {
    return <AgentTaskCard task={item.task} isStreaming={false} />;
  }

  if (item.type === "task_updated") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-1 pl-2 border-l-2 border-primary/30">
        {item.taskStatus === "completed" && <CheckCircle2Icon className="size-4 text-green-500" />}
        {item.taskStatus === "in_progress" && <PlayCircleIcon className="size-4 text-blue-500" />}
        <span>Task #{item.taskId} → {item.taskStatus}</span>
      </div>
    );
  }

  if (item.type === "plan_created") {
    return (
      <div className="flex items-center gap-2 text-sm py-2 px-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
        <ListTodoIcon className="size-4 text-amber-500" />
        <span className="font-medium text-amber-600">Agent entered plan mode</span>
      </div>
    );
  }

  if (item.type === "plan_complete") {
    return (
      <div className="flex items-center gap-2 text-sm py-2 px-3 bg-green-500/10 border border-green-500/30 rounded-lg">
        <CheckCircle2Icon className="size-4 text-green-500" />
        <span className="font-medium text-green-600">Plan ready for approval</span>
      </div>
    );
  }

  // Handle legacy format
  switch (item.type) {
    case "thinking":
      return (
        <div className="pl-2 border-l-2 border-amber-500/50">
          <Reasoning duration={undefined} defaultOpen={true}>
            <ReasoningTrigger />
            <ReasoningContent>{item.content || ""}</ReasoningContent>
          </Reasoning>
        </div>
      );

    case "text":
      return (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <Markdown>{item.content || ""}</Markdown>
        </div>
      );

    case "tool_call":
    case "tool_result":
      const normalizedName = (item.toolName || "").toLowerCase();
      const label = TOOL_LABELS[normalizedName] || item.toolName;
      const state = item.status === "running"
        ? "input-available"
        : item.status === "error"
          ? "output-error"
          : "output-available";

      // Parse output to separate main content from system-reminders
      const parsedOutput = item.toolOutput ? parseToolOutput(item.toolOutput) : null;

      return (
        <Tool defaultOpen={item.status === "running"}>
          <ToolHeader
            title={label || "Tool"}
            type="tool-invocation"
            state={state}
          />
          <ToolContent>
            {item.toolInput && <ToolInput input={item.toolInput} />}
            {parsedOutput && (
              <>
                <ToolOutput
                  output={item.status === "error" ? null : truncateOutput(parsedOutput.main)}
                  errorText={item.status === "error" ? truncateOutput(parsedOutput.main) : undefined}
                />
                {parsedOutput.systemReminders.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border/50">
                    <SystemReminderDisplay reminders={parsedOutput.systemReminders} />
                  </div>
                )}
              </>
            )}
          </ToolContent>
        </Tool>
      );

    case "progress":
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          {item.content}
        </div>
      );

    case "error":
      return (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
          <p className="text-sm text-destructive">{item.content}</p>
        </div>
      );

    default:
      return null;
  }
});

/**
 * Render AI SDK UI Part directly
 */
const PartEntry = memo(function PartEntry({ part }: { part: AgentUIPart }) {
  if (isTextPart(part)) {
    return (
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <Markdown>{part.text}</Markdown>
      </div>
    );
  }

  if (isReasoningPart(part)) {
    return (
      <div className="pl-2 border-l-2 border-amber-500/50">
        <Reasoning duration={undefined} defaultOpen={true}>
          <ReasoningTrigger />
          <ReasoningContent>{part.text}</ReasoningContent>
        </Reasoning>
      </div>
    );
  }

  if (isDynamicToolPart(part)) {
    const normalizedName = part.toolName.toLowerCase();
    const label = TOOL_LABELS[normalizedName] || part.toolName;
    const hasOutput = part.state === "output-available" || part.state === "output-error";

    // Get output content based on state
    const getOutputContent = (): string | undefined => {
      if (part.state === "output-available") {
        return typeof part.output === "string" ? part.output : JSON.stringify(part.output, null, 2);
      }
      if (part.state === "output-error") {
        return part.errorText;
      }
      return undefined;
    };

    const outputContent = getOutputContent();
    const parsedOutput = outputContent ? parseToolOutput(outputContent) : null;

    return (
      <Tool defaultOpen={part.state === "input-available" || part.state === "input-streaming"}>
        <ToolHeader
          title={label || "Tool"}
          type="dynamic-tool"
          state={part.state}
          toolName={part.toolName}
        />
        <ToolContent>
          {part.input !== undefined && part.input !== null && (
            <ToolInput input={part.input as Record<string, unknown>} />
          )}
          {parsedOutput && (
            <>
              <ToolOutput
                output={(part.state === "output-available" ? truncateOutput(parsedOutput.main) : null) as string | null}
                errorText={(part.state === "output-error" ? truncateOutput(parsedOutput.main) : undefined) as string | undefined}
              />
              {parsedOutput.systemReminders.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/50">
                  <SystemReminderDisplay reminders={parsedOutput.systemReminders} />
                </div>
              )}
            </>
          )}
        </ToolContent>
      </Tool>
    );
  }

  return null;
});

const StreamingEntry = memo(function StreamingEntry({ content }: { content: string }) {
  return (
    <div className="border-l-2 border-primary pl-3">
      <Reasoning isStreaming={true} defaultOpen={true}>
        <ReasoningTrigger />
        <ReasoningContent>{content}</ReasoningContent>
      </Reasoning>
    </div>
  );
});

function truncateOutput(output: string, maxLength = 2000): string {
  if (output.length <= maxLength) return output;
  return output.slice(0, maxLength) + "\n... (truncated)";
}

/**
 * Parse tool output to separate main content from system-reminder tags
 */
function parseToolOutput(output: string): { main: string; systemReminders: string[] } {
  const systemReminders: string[] = [];
  const reminderRegex = /<system-reminder>([\s\S]*?)<\/system-reminder>/g;

  let match;
  while ((match = reminderRegex.exec(output)) !== null) {
    systemReminders.push(match[1].trim());
  }

  // Remove system-reminder tags from main content
  const main = output.replace(reminderRegex, "").trim();

  return { main, systemReminders };
}

/**
 * System Reminder Display - muted collapsible section
 */
const SystemReminderDisplay = memo(function SystemReminderDisplay({
  reminders,
}: {
  reminders: string[];
}) {
  if (reminders.length === 0) return null;

  return (
    <Collapsible defaultOpen={false}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-muted-foreground py-1 group">
        <ChevronRight className="size-3 transition-transform group-data-[state=open]:rotate-90" />
        <span className="font-mono">system-reminder</span>
        <span className="text-muted-foreground/50">({reminders.length})</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 pl-4 border-l border-muted-foreground/20">
          {reminders.map((reminder, idx) => (
            <pre
              key={idx}
              className="text-xs text-muted-foreground/60 whitespace-pre-wrap font-mono overflow-x-auto"
            >
              {reminder}
            </pre>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
});

// ============================================================================
// Main Component
// ============================================================================

export const AgentDetailPanel = memo(function AgentDetailPanel({
  activeTab,
  onTabChange,
  onClose,
  fileChanges,
  fileChangeArray,
  fileStats,
  events,
  logs,
  accumulatedText,
  isStreaming,
  isConnected,
  onPlanApprove,
  onPlanReject,
  className,
}: AgentDetailPanelProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Tab Header with Close Button */}
      <div className="flex items-center justify-between border-b border-border">
        <div className="flex">
          <TabButton
            isActive={activeTab === "diff"}
            onClick={() => onTabChange("diff")}
          >
            <span>Diff</span>
            {fileChangeArray.length > 0 && (
              <span className="ml-1.5 text-xs font-mono tabular-nums">
                <span className="text-green-400">+{fileStats.additions}</span>
                <span className="text-muted-foreground mx-0.5">/</span>
                <span className="text-red-400">-{fileStats.deletions}</span>
              </span>
            )}
          </TabButton>

          <TabButton
            isActive={activeTab === "logs"}
            onClick={() => onTabChange("logs")}
          >
            <span>Logs</span>
            {(events.length > 0 || logs.length > 0) && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-muted rounded">
                {events.length + logs.length}
              </span>
            )}
          </TabButton>
        </div>

        <button
          onClick={onClose}
          className="p-2 mr-2 hover:bg-muted rounded-md transition-colors"
          title="Close panel"
        >
          <X className="size-4 text-muted-foreground" />
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "diff" && (
          <DiffView
            fileChanges={fileChanges}
            fileChangeArray={fileChangeArray}
            selectedFile={selectedFile}
            onFileSelect={setSelectedFile}
          />
        )}
        {activeTab === "logs" && (
          <MergedLogsView
            events={events}
            logs={logs}
            accumulatedText={accumulatedText}
            isStreaming={isStreaming}
            isConnected={isConnected}
            onPlanApprove={onPlanApprove}
            onPlanReject={onPlanReject}
          />
        )}
      </div>
    </div>
  );
});
