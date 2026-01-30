"use client";

/**
 * Agent Activity Tab Component
 *
 * Real-time activity feed using AI Elements components:
 * - Reasoning: For LLM thinking/reasoning text (AI SDK ReasoningUIPart)
 * - Tool: For tool calls with input/output (AI SDK DynamicToolUIPart)
 * - Text: For visible LLM output (AI SDK TextUIPart)
 * - AgentTaskCard: For task_created events (semantic task events)
 * - AgentPlanCard: For aggregated plan view with approval actions
 *
 * Events from server.ts are emitted in AI SDK-compatible format:
 * - type: "part" with data matching TextUIPart, ReasoningUIPart, or DynamicToolUIPart
 * - type: "task_created" / "task_updated" for semantic task events
 * - type: "plan_created" / "plan_complete" for plan lifecycle events
 *
 * For backward compatibility, legacy event types (llm_chunk, thinking, tool_call, tool_result)
 * are also supported.
 */

import { memo, useMemo, useRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  BotIcon,
  ArrowDownIcon,
  AlertCircleIcon,
  CircleIcon,
  CheckCircle2Icon,
} from "lucide-react";
import type { WorkflowStreamEvent, TaskData } from "@/hooks/use-workflow-stream";
import { isTaskTool, isPlanTool } from "@/hooks/use-workflow-stream";
import type { TextUIPart, ReasoningUIPart, DynamicToolUIPart } from "ai";
import { AgentTaskCard } from "./agent-task-card";
import { AgentPlanCard, type PlanStatus } from "./agent-plan-card";

// AI Elements imports
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
import { CodeBlock, CodeBlockCopyButton } from "@/components/ai-elements/code-block";
import type { BundledLanguage } from "shiki";
import { Loader } from "@/components/ai-elements/loader";
import { Button } from "@/components/ui/button";

interface AgentActivityTabProps {
  events: WorkflowStreamEvent[];
  accumulatedText: string;
  isStreaming?: boolean;
  className?: string;
  /** Current workflow/plan status for showing approval UI */
  planStatus?: PlanStatus;
  /** Callback when user approves the plan */
  onPlanApprove?: () => void;
  /** Callback when user rejects the plan */
  onPlanReject?: () => void;
}

// Union type for AI SDK UI parts we handle
type AgentUIPart = TextUIPart | ReasoningUIPart | DynamicToolUIPart;

// Activity item types - supports both new AI SDK format and legacy format
type ActivityType = "part" | "thinking" | "text" | "tool_call" | "tool_result" | "file_changed" | "progress" | "error" | "task_created" | "task_updated" | "plan_created" | "plan_complete";

interface ActivityItem {
  id: string;
  type: ActivityType;
  timestamp: Date;
  // For new AI SDK part format
  part?: AgentUIPart;
  // For semantic task events
  task?: TaskData;
  taskId?: string;
  taskStatus?: "pending" | "in_progress" | "completed";
  // Legacy format fields
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
  content?: string;
  status?: "running" | "success" | "error";
  callId?: string;
  agentId?: string;
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
  // File change operations
  file_change: "File Changed",
  modify: "File Modified",
  delete: "File Deleted",
  // Task management tools
  TaskCreate: "Create Task",
  TaskUpdate: "Update Task",
  TaskList: "List Tasks",
  TaskGet: "Get Task",
  // Plan management tools
  EnterPlanMode: "Enter Plan Mode",
  ExitPlanMode: "Exit Plan Mode",
};

/**
 * Map legacy tool status to DynamicToolUIPart state
 */
function mapToolStatus(status?: string): DynamicToolUIPart["state"] {
  switch (status) {
    case "running":
      return "input-available";
    case "error":
      return "output-error";
    case "success":
    default:
      return "output-available";
  }
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
 * Convert workflow events to activity items - CHRONOLOGICAL ORDER
 *
 * Supports two event formats:
 * 1. NEW: AI SDK-compatible "part" events with data matching TextUIPart, ReasoningUIPart, DynamicToolUIPart
 * 2. LEGACY: Individual event types (thinking, llm_chunk, tool_call, tool_result)
 *
 * For "part" events, we directly use the AI SDK part data.
 * For legacy events, we convert them to activity items.
 */
function eventsToActivityItems(events: WorkflowStreamEvent[]): ActivityItem[] {
  const items: ActivityItem[] = [];

  // For legacy format: accumulation state for same-type consecutive merging
  let currentType: "thinking" | "llm_chunk" | null = null;
  let currentContent = "";
  let currentTimestamp: Date | null = null;
  let currentAgentId: string | undefined;
  let itemCounter = 0;

  // For legacy format: map to correlate tool calls with results
  const pendingToolCalls = new Map<string, ActivityItem>();

  // Helper: flush accumulated legacy content if any
  const flushCurrent = () => {
    if (currentType && currentContent.trim()) {
      // Use timestamp-based ID for stability across re-renders
      const stableId = currentTimestamp
        ? `${currentType}-${currentTimestamp.getTime()}`
        : `${currentType}-${itemCounter++}`;
      items.push({
        id: stableId,
        type: currentType === "thinking" ? "thinking" : "text",
        timestamp: currentTimestamp || new Date(),
        content: currentContent,
        agentId: currentAgentId,
      });
    }
    currentType = null;
    currentContent = "";
    currentTimestamp = null;
    currentAgentId = undefined;
  };

  for (const event of events) {
    switch (event.type) {
      // NEW: AI SDK-compatible part events
      case "part": {
        flushCurrent();
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
        // If switching from a different type, flush first
        if (currentType !== "thinking") {
          flushCurrent();
        }
        // Accumulate thinking content
        currentType = "thinking";
        currentContent += event.data.content || event.data.text || "";
        if (!currentTimestamp) currentTimestamp = new Date(event.timestamp);
        currentAgentId = event.agentId;
        break;

      // LEGACY: llm_chunk events
      case "llm_chunk":
        // If switching from a different type, flush first
        if (currentType !== "llm_chunk") {
          flushCurrent();
        }
        // Accumulate text content
        currentType = "llm_chunk";
        currentContent += event.data.content || event.data.text || "";
        if (!currentTimestamp) currentTimestamp = new Date(event.timestamp);
        currentAgentId = event.agentId;
        break;

      // LEGACY: tool_call events
      case "tool_call": {
        // Flush any accumulated content FIRST (appears before tool call)
        flushCurrent();

        // Add tool call
        if (event.data.toolName) {
          const callId = event.data.callId as string | undefined;
          const toolItem: ActivityItem = {
            id: event.id,
            type: "tool_call",
            timestamp: new Date(event.timestamp),
            toolName: event.data.toolName,
            toolInput: event.data.toolInput as Record<string, unknown> | undefined,
            status: "running",
            callId,
            agentId: event.agentId,
          };
          items.push(toolItem);

          // Track for correlation
          if (callId) {
            pendingToolCalls.set(callId, toolItem);
          }
        }
        break;
      }

      // LEGACY: tool_result events
      case "tool_result": {
        // Flush any accumulated content first
        flushCurrent();

        // Try to correlate with existing tool call
        const callId = event.data.callId as string | undefined;
        const resultToolName = event.data.toolName as string | undefined;
        const resultOutput = (event.data.result || event.data.toolOutput || "") as string;
        const isError = Boolean(event.data.isError);
        const newStatus = isError ? "error" : "success";

        // 1. First try by callId
        let matchedCall = callId ? pendingToolCalls.get(callId) : null;

        // 2. If not found by callId, try by toolName (case-insensitive)
        if (!matchedCall && resultToolName) {
          matchedCall = items.find(
            (i) =>
              i.type === "tool_call" &&
              i.status === "running" &&
              i.toolName?.toLowerCase() === resultToolName.toLowerCase()
          ) || null;
        }

        // 3. If still not found, match the oldest running tool call
        if (!matchedCall) {
          matchedCall = items.find(
            (i) => i.type === "tool_call" && i.status === "running"
          ) || null;
        }

        if (matchedCall) {
          // Update the existing tool call with result
          matchedCall.status = newStatus;
          matchedCall.toolOutput = resultOutput;
          if (callId) {
            pendingToolCalls.delete(callId);
          }
        } else {
          // Standalone result (no matching call found)
          items.push({
            id: event.id,
            type: "tool_result",
            timestamp: new Date(event.timestamp),
            toolName: resultToolName,
            toolOutput: resultOutput,
            status: newStatus,
            agentId: event.agentId,
          });
        }
        break;
      }

      case "file_changed": {
        flushCurrent();
        const filePath = event.data.filePath as string | undefined;
        const operation = event.data.operation as string | undefined;
        if (filePath) {
          items.push({
            id: event.id,
            type: "file_changed",
            timestamp: new Date(event.timestamp),
            toolName: operation || "file_change",
            toolInput: { path: filePath },
            toolOutput: `${operation || "Changed"}: ${filePath}`,
            status: "success",
            agentId: event.agentId,
          });
        }
        break;
      }

      case "task_progress":
        flushCurrent();
        items.push({
          id: event.id,
          type: "progress",
          timestamp: new Date(event.timestamp),
          content: event.data.status || "Progress update",
        });
        break;

      case "error":
        flushCurrent();
        items.push({
          id: event.id,
          type: "error",
          timestamp: new Date(event.timestamp),
          content: event.data.error || "An error occurred",
          status: "error",
        });
        break;

      // Semantic task events
      case "task_created": {
        flushCurrent();
        items.push({
          id: event.id,
          type: "task_created",
          timestamp: new Date(event.timestamp),
          task: event.data.task as TaskData,
          agentId: event.agentId,
        });
        break;
      }

      case "task_updated": {
        flushCurrent();
        items.push({
          id: event.id,
          type: "task_updated",
          timestamp: new Date(event.timestamp),
          taskId: event.data.taskId as string,
          taskStatus: event.data.taskStatus as "pending" | "in_progress" | "completed",
          agentId: event.agentId,
        });
        break;
      }

      // Semantic plan events
      case "plan_created": {
        flushCurrent();
        items.push({
          id: event.id,
          type: "plan_created",
          timestamp: new Date(event.timestamp),
          agentId: event.agentId,
        });
        break;
      }

      case "plan_complete": {
        flushCurrent();
        items.push({
          id: event.id,
          type: "plan_complete",
          timestamp: new Date(event.timestamp),
          agentId: event.agentId,
        });
        break;
      }
    }
  }

  // Flush any remaining content
  flushCurrent();

  return items;
}

/**
 * Hook to aggregate tasks from events for plan display
 * Returns all tasks created during the session with their latest status
 */
function useTaskAggregation(events: WorkflowStreamEvent[]): {
  tasks: TaskData[];
  hasActivePlan: boolean;
  planStarted: boolean;
  planComplete: boolean;
} {
  return useMemo(() => {
    const tasksMap = new Map<string, TaskData>();
    let planStarted = false;
    let planComplete = false;

    for (const event of events) {
      // Track plan lifecycle
      if (event.type === "plan_created") {
        planStarted = true;
      } else if (event.type === "plan_complete") {
        planComplete = true;
      }

      // Collect tasks from task_created events
      if (event.type === "task_created" && event.data.task) {
        const task = event.data.task as TaskData;
        tasksMap.set(task.id, task);
      }

      // Update task status from task_updated events
      if (event.type === "task_updated" && event.data.taskId) {
        const existingTask = tasksMap.get(event.data.taskId as string);
        if (existingTask && event.data.taskStatus) {
          tasksMap.set(event.data.taskId as string, {
            ...existingTask,
            status: event.data.taskStatus as TaskData["status"],
          });
        }
      }

      // Also detect tasks from TaskCreate tool calls in "part" events
      if (event.type === "part" && event.data.type === "dynamic-tool") {
        const toolName = event.data.toolName;
        const state = event.data.state;

        if (toolName === "TaskCreate" && state === "output-available") {
          // Try to extract task from input
          const input = event.data.input as Record<string, unknown> | undefined;
          if (input?.subject) {
            // Generate ID if not in output
            let taskId = String(Date.now());
            try {
              const output = event.data.output;
              if (typeof output === "string") {
                const parsed = JSON.parse(output);
                if (parsed?.id) taskId = parsed.id;
              }
            } catch {
              // Use generated ID
            }

            const task: TaskData = {
              id: taskId,
              subject: input.subject as string,
              description: (input.description as string) || "",
              activeForm: input.activeForm as string,
              status: "pending",
              blocks: input.blocks as string[] | undefined,
              blockedBy: input.blockedBy as string[] | undefined,
            };

            if (!tasksMap.has(task.id)) {
              tasksMap.set(task.id, task);
            }
          }
        }

        // Track plan mode tools
        if (toolName === "EnterPlanMode") {
          planStarted = true;
        } else if (toolName === "ExitPlanMode" && state === "output-available") {
          planComplete = true;
        }
      }
    }

    const tasks = Array.from(tasksMap.values());
    const hasActivePlan = planStarted && tasks.length > 0;

    return { tasks, hasActivePlan, planStarted, planComplete };
  }, [events]);
}

/**
 * Extract display info from tool input
 */
function getToolDisplayInfo(toolName: string, input: unknown): { title: string; subtitle?: string } {
  const normalizedName = toolName.toLowerCase();
  const inputObj = input as Record<string, unknown> | undefined;

  const path = inputObj?.path || inputObj?.file_path || inputObj?.filePath || inputObj?.file;
  const command = inputObj?.command;
  const pattern = inputObj?.pattern;
  const query = inputObj?.query;

  const label = TOOL_LABELS[normalizedName] || toolName;

  if (path) {
    const pathStr = String(path);
    const fileName = pathStr.split("/").pop() || pathStr;
    return { title: label, subtitle: fileName };
  }

  if (command) {
    const cmdStr = Array.isArray(command) ? command.join(" ") : String(command);
    const shortCmd = cmdStr.length > 50 ? cmdStr.slice(0, 47) + "..." : cmdStr;
    return { title: label, subtitle: shortCmd };
  }

  if (pattern) {
    return { title: label, subtitle: String(pattern) };
  }

  if (query) {
    const queryStr = String(query);
    const shortQuery = queryStr.length > 50 ? queryStr.slice(0, 47) + "..." : queryStr;
    return { title: label, subtitle: shortQuery };
  }

  return { title: label };
}

export const AgentActivityTab = memo(function AgentActivityTab({
  events,
  accumulatedText,
  isStreaming = false,
  className,
  planStatus,
  onPlanApprove,
  onPlanReject,
}: AgentActivityTabProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const activityItems = useMemo(() => eventsToActivityItems(events), [events]);
  const { tasks, hasActivePlan, planStarted, planComplete } = useTaskAggregation(events);

  // Determine effective plan status from events if not provided via props
  const effectivePlanStatus: PlanStatus | undefined = planStatus ?? (
    planComplete ? "approved" :
    hasActivePlan && !isStreaming ? "awaiting_approval" :
    planStarted ? "planning" :
    undefined
  );

  // Filter out task_created events from activity items when showing aggregated plan
  const filteredActivityItems = useMemo(() => {
    if (!hasActivePlan) return activityItems;

    // When plan is active, filter out individual task_created events
    // since they're shown in the aggregated plan card
    return activityItems.filter(item => item.type !== "task_created");
  }, [activityItems, hasActivePlan]);

  // Auto-scroll to bottom when new items arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activityItems, accumulatedText, autoScroll]);

  // Detect when user scrolls up to disable auto-scroll
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {filteredActivityItems.length === 0 && !accumulatedText && !hasActivePlan ? (
          <EmptyState />
        ) : (
          <>
            {/* Aggregated Plan Card - shown at top when there are tasks */}
            {hasActivePlan && effectivePlanStatus && (
              <AgentPlanCard
                tasks={tasks}
                status={effectivePlanStatus}
                onApprove={onPlanApprove}
                onReject={onPlanReject}
                isStreaming={isStreaming && effectivePlanStatus === "planning"}
              />
            )}

            {/* Activity items (with task_created filtered out when plan is shown) */}
            {filteredActivityItems.map((item) => (
              <ActivityCard key={item.id} item={item} tasks={tasks} />
            ))}

            {/* Live streaming reasoning */}
            {isStreaming && accumulatedText && (
              <StreamingReasoning content={accumulatedText} />
            )}
          </>
        )}
      </div>

      {/* Scroll to bottom button */}
      {!autoScroll && (
        <div className="absolute bottom-4 right-4">
          <Button
            size="sm"
            variant="secondary"
            className="shadow-lg gap-1.5"
            onClick={() => {
              setAutoScroll(true);
              if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
              }
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

const EmptyState = memo(function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
      <Loader className="mb-3" />
      <p className="text-sm">Waiting for agent activity...</p>
    </div>
  );
});

interface ActivityCardProps {
  item: ActivityItem;
  tasks?: TaskData[];
}

const ActivityCard = memo(function ActivityCard({ item, tasks = [] }: ActivityCardProps) {
  // Handle new AI SDK part format
  if (item.type === "part" && item.part) {
    return <PartCard part={item.part} tasks={tasks} />;
  }

  // Handle semantic task events (when not shown in aggregated plan)
  if (item.type === "task_created" && item.task) {
    return (
      <div className="ml-11">
        <AgentTaskCard task={item.task} />
      </div>
    );
  }

  // Handle task_updated as inline status update
  if (item.type === "task_updated") {
    const task = tasks.find(t => t.id === item.taskId);
    return (
      <TaskStatusUpdateCard
        taskId={item.taskId || ""}
        taskSubject={task?.subject}
        newStatus={item.taskStatus}
      />
    );
  }

  // Handle plan lifecycle events as markers
  if (item.type === "plan_created") {
    return <PlanMarkerCard type="started" />;
  }
  if (item.type === "plan_complete") {
    return <PlanMarkerCard type="complete" />;
  }

  // Handle legacy format
  switch (item.type) {
    case "thinking":
      return <ThinkingCard content={item.content || ""} />;
    case "text":
      return <TextCard content={item.content || ""} />;
    case "tool_call":
    case "tool_result":
    case "file_changed":
      return <ToolCard item={item} />;
    case "progress":
      return <ProgressCard content={item.content || ""} />;
    case "error":
      return <ErrorCard content={item.content || ""} />;
    default:
      return null;
  }
});

/**
 * Render AI SDK UI Part directly
 * Handles TextUIPart, ReasoningUIPart, and DynamicToolUIPart
 */
const PartCard = memo(function PartCard({ part, tasks = [] }: { part: AgentUIPart; tasks?: TaskData[] }) {
  if (isTextPart(part)) {
    return <TextCard content={part.text} />;
  }

  if (isReasoningPart(part)) {
    // Thinking blocks expanded by default for better visibility
    return (
      <div className="flex gap-3">
        <div className="flex-shrink-0">
          <div className="size-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <BotIcon className="size-4 text-white" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <Reasoning duration={undefined} defaultOpen={true}>
            <ReasoningTrigger />
            <ReasoningContent>{part.text}</ReasoningContent>
          </Reasoning>
        </div>
      </div>
    );
  }

  if (isDynamicToolPart(part)) {
    // Check if this is a task/plan tool - render with specialized UI
    if (isTaskTool(part.toolName)) {
      return <TaskToolCard part={part} tasks={tasks} />;
    }
    if (isPlanTool(part.toolName)) {
      return <PlanToolCard part={part} />;
    }
    return <DynamicToolCard part={part} />;
  }

  return null;
});

/**
 * Render DynamicToolUIPart with full state support
 */
const DynamicToolCard = memo(function DynamicToolCard({ part }: { part: DynamicToolUIPart }) {
  const { title, subtitle } = getToolDisplayInfo(part.toolName, part.input);
  const displayTitle = subtitle ? `${title}: ${subtitle}` : title;

  const normalizedName = part.toolName.toLowerCase();
  const hasOutput = part.state === "output-available" || part.state === "output-error";

  // Determine if we should show code block for output
  const showCodeOutput = hasOutput && (
    normalizedName === "read" ||
    normalizedName === "bash" ||
    normalizedName === "shell" ||
    normalizedName === "grep" ||
    (part.state === "output-available" && typeof part.output === "string" && part.output.includes("\n"))
  );

  // Determine language for syntax highlighting
  const getLanguage = () => {
    if (normalizedName === "bash" || normalizedName === "shell") return "bash";
    if (normalizedName === "grep") return "text";

    const inputObj = part.input as Record<string, unknown> | undefined;
    const path = String(inputObj?.path || inputObj?.file_path || "");

    if (path.endsWith(".ts") || path.endsWith(".tsx")) return "typescript";
    if (path.endsWith(".js") || path.endsWith(".jsx")) return "javascript";
    if (path.endsWith(".py")) return "python";
    if (path.endsWith(".json")) return "json";
    if (path.endsWith(".md")) return "markdown";
    if (path.endsWith(".css")) return "css";
    if (path.endsWith(".html")) return "html";
    if (path.endsWith(".yaml") || path.endsWith(".yml")) return "yaml";

    return "text";
  };

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

  return (
    <div className="ml-11">
      <Tool defaultOpen={part.state === "input-available" || part.state === "input-streaming"}>
        <ToolHeader
          title={displayTitle}
          type="dynamic-tool"
          state={part.state}
          toolName={part.toolName}
        />
        <ToolContent>
          {/* Tool Input - cast to expected type for compatibility */}
          {part.input !== undefined && part.input !== null && (
            <ToolInput input={part.input as Record<string, unknown>} />
          )}

          {/* Tool Output */}
          {outputContent && (
            showCodeOutput ? (
              <div className="p-4 space-y-2">
                <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {part.state === "output-error" ? "Error" : "Result"}
                </h4>
                <CodeBlock
                  code={truncateOutput(outputContent)}
                  language={getLanguage() as BundledLanguage}
                  className={cn(
                    "max-h-64 overflow-y-auto",
                    part.state === "output-error" && "border-destructive/50"
                  )}
                >
                  <CodeBlockCopyButton />
                </CodeBlock>
              </div>
            ) : (
              <ToolOutput
                output={(part.state === "output-available" ? outputContent : null) as string | null}
                errorText={(part.state === "output-error" ? outputContent : undefined) as string | undefined}
              />
            )
          )}
        </ToolContent>
      </Tool>
    </div>
  );
});

/**
 * Thinking card - Claude's internal reasoning (extended thinking)
 * Displayed expanded by default for better visibility
 */
const ThinkingCard = memo(function ThinkingCard({ content }: { content: string }) {
  return (
    <div className="flex gap-3">
      {/* Agent Avatar with thinking indicator */}
      <div className="flex-shrink-0">
        <div className="size-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
          <BotIcon className="size-4 text-white" />
        </div>
      </div>

      {/* Thinking content - expanded by default */}
      <div className="flex-1 min-w-0">
        <Reasoning duration={undefined} defaultOpen={true}>
          <ReasoningTrigger />
          <ReasoningContent>{content}</ReasoningContent>
        </Reasoning>
      </div>
    </div>
  );
});

/**
 * Text card - visible LLM output (not internal reasoning)
 * Displayed expanded by default
 */
const TextCard = memo(function TextCard({ content }: { content: string }) {
  return (
    <div className="flex gap-3">
      {/* Agent Avatar */}
      <div className="flex-shrink-0">
        <div className="size-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
          <BotIcon className="size-4 text-white" />
        </div>
      </div>

      {/* Text content - always visible */}
      <div className="flex-1 min-w-0 prose prose-sm dark:prose-invert max-w-none">
        <div className="text-sm text-foreground whitespace-pre-wrap break-words">
          {content}
        </div>
      </div>
    </div>
  );
});

/**
 * Streaming reasoning indicator
 */
const StreamingReasoning = memo(function StreamingReasoning({
  content,
}: {
  content: string;
}) {
  return (
    <div className="flex gap-3">
      {/* Agent Avatar */}
      <div className="flex-shrink-0">
        <div className="size-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
          <BotIcon className="size-4 text-white" />
        </div>
      </div>

      {/* Streaming reasoning */}
      <div className="flex-1 min-w-0">
        <Reasoning isStreaming={true} defaultOpen={true}>
          <ReasoningTrigger />
          <ReasoningContent>{content}</ReasoningContent>
        </Reasoning>
      </div>
    </div>
  );
});

/**
 * Tool card using AI Elements Tool component
 */
const ToolCard = memo(function ToolCard({ item }: { item: ActivityItem }) {
  const normalizedName = (item.toolName || "").toLowerCase();
  const { title, subtitle } = getToolDisplayInfo(item.toolName || "", item.toolInput);
  const state = mapToolStatus(item.status);

  // Build the display title with subtitle
  const displayTitle = subtitle ? `${title}: ${subtitle}` : title;

  // Determine if we should show code block for output
  const showCodeOutput = item.toolOutput && (
    normalizedName === "read" ||
    normalizedName === "bash" ||
    normalizedName === "shell" ||
    normalizedName === "grep" ||
    item.toolOutput.includes("\n")
  );

  // Determine language for syntax highlighting
  const getLanguage = () => {
    if (normalizedName === "bash" || normalizedName === "shell") return "bash";
    if (normalizedName === "grep") return "text";

    const inputObj = item.toolInput as Record<string, unknown> | undefined;
    const path = String(inputObj?.path || inputObj?.file_path || "");

    if (path.endsWith(".ts") || path.endsWith(".tsx")) return "typescript";
    if (path.endsWith(".js") || path.endsWith(".jsx")) return "javascript";
    if (path.endsWith(".py")) return "python";
    if (path.endsWith(".json")) return "json";
    if (path.endsWith(".md")) return "markdown";
    if (path.endsWith(".css")) return "css";
    if (path.endsWith(".html")) return "html";
    if (path.endsWith(".yaml") || path.endsWith(".yml")) return "yaml";

    return "text";
  };

  return (
    <div className="ml-11">
      <Tool defaultOpen={item.status === "running"}>
        <ToolHeader
          title={displayTitle}
          type="tool-invocation"
          state={state}
        />
        <ToolContent>
          {/* Tool Input */}
          {item.toolInput && (
            <ToolInput input={item.toolInput} />
          )}

          {/* Tool Output */}
          {item.toolOutput && (
            showCodeOutput ? (
              <div className="p-4 space-y-2">
                <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  {item.status === "error" ? "Error" : "Result"}
                </h4>
                <CodeBlock
                  code={truncateOutput(item.toolOutput)}
                  language={getLanguage() as BundledLanguage}
                  className={cn(
                    "max-h-64 overflow-y-auto",
                    item.status === "error" && "border-destructive/50"
                  )}
                >
                  <CodeBlockCopyButton />
                </CodeBlock>
              </div>
            ) : (
              <ToolOutput
                output={item.toolOutput}
                errorText={item.status === "error" ? item.toolOutput : undefined}
              />
            )
          )}
        </ToolContent>
      </Tool>
    </div>
  );
});

/**
 * Progress card
 */
const ProgressCard = memo(function ProgressCard({ content }: { content: string }) {
  return (
    <div className="ml-11 flex items-center gap-2 py-2">
      <Loader />
      <span className="text-sm text-muted-foreground">{content}</span>
    </div>
  );
});

/**
 * Task tool card - specialized rendering for TaskCreate, TaskUpdate, TaskList, TaskGet
 */
const TaskToolCard = memo(function TaskToolCard({
  part,
  tasks,
}: {
  part: DynamicToolUIPart;
  tasks: TaskData[];
}) {
  const input = part.input as Record<string, unknown> | undefined;
  const state = part.state;

  // For TaskCreate with output, show the created task
  if (part.toolName === "TaskCreate" && state === "output-available" && input?.subject) {
    let taskId = "";
    try {
      const output = typeof part.output === "string" ? JSON.parse(part.output) : part.output;
      taskId = output?.id || "";
    } catch {
      // Ignore
    }

    const task: TaskData = {
      id: taskId || String(Date.now()),
      subject: input.subject as string,
      description: (input.description as string) || "",
      activeForm: input.activeForm as string,
      status: "pending",
      blocks: input.blocks as string[] | undefined,
      blockedBy: input.blockedBy as string[] | undefined,
    };

    return (
      <div className="ml-11">
        <div className="text-xs text-muted-foreground mb-1">Task created:</div>
        <AgentTaskCard task={task} />
      </div>
    );
  }

  // For TaskUpdate, show a compact status change
  if (part.toolName === "TaskUpdate" && input?.taskId) {
    const taskId = input.taskId as string;
    const newStatus = input.status as string | undefined;
    const task = tasks.find(t => t.id === taskId);

    return (
      <TaskStatusUpdateCard
        taskId={taskId}
        taskSubject={task?.subject}
        newStatus={newStatus as TaskData["status"]}
      />
    );
  }

  // For other task tools (TaskList, TaskGet), show as regular tool card
  return <DynamicToolCard part={part} />;
});

/**
 * Plan tool card - specialized rendering for EnterPlanMode, ExitPlanMode
 */
const PlanToolCard = memo(function PlanToolCard({ part }: { part: DynamicToolUIPart }) {
  if (part.toolName === "EnterPlanMode") {
    return <PlanMarkerCard type="started" />;
  }

  if (part.toolName === "ExitPlanMode" && part.state === "output-available") {
    return <PlanMarkerCard type="complete" />;
  }

  // Show as regular tool card if not complete
  return <DynamicToolCard part={part} />;
});

/**
 * Task status update card - compact inline display
 */
const TaskStatusUpdateCard = memo(function TaskStatusUpdateCard({
  taskId,
  taskSubject,
  newStatus,
}: {
  taskId: string;
  taskSubject?: string;
  newStatus?: TaskData["status"];
}) {
  const statusIcon = {
    pending: <CircleIcon className="size-3 text-muted-foreground" />,
    in_progress: <Loader className="size-3" />,
    completed: <CheckCircle2Icon className="size-3 text-green-500" />,
  }[newStatus || "pending"];

  const statusLabel = {
    pending: "set to pending",
    in_progress: "started",
    completed: "completed",
  }[newStatus || "pending"];

  return (
    <div className="ml-11 flex items-center gap-2 py-1.5 px-3 bg-secondary/30 rounded-md">
      {statusIcon}
      <span className="text-sm">
        <span className="font-medium">Task #{taskId}</span>
        {taskSubject && <span className="text-muted-foreground"> ({taskSubject})</span>}
        <span className="text-muted-foreground"> {statusLabel}</span>
      </span>
    </div>
  );
});

/**
 * Plan marker card - shows plan lifecycle events
 */
const PlanMarkerCard = memo(function PlanMarkerCard({
  type,
}: {
  type: "started" | "complete";
}) {
  if (type === "started") {
    return (
      <div className="ml-11 flex items-center gap-2 py-2 px-3 bg-violet-500/10 border border-violet-500/30 rounded-md">
        <div className="size-2 rounded-full bg-violet-500" />
        <span className="text-sm text-violet-600 dark:text-violet-400">
          Entered planning mode
        </span>
      </div>
    );
  }

  return (
    <div className="ml-11 flex items-center gap-2 py-2 px-3 bg-lime-500/10 border border-lime-500/30 rounded-md">
      <CheckCircle2Icon className="size-4 text-lime-600 dark:text-lime-400" />
      <span className="text-sm text-lime-600 dark:text-lime-400">
        Planning complete - ready for review
      </span>
    </div>
  );
});

/**
 * Error card
 */
const ErrorCard = memo(function ErrorCard({ content }: { content: string }) {
  return (
    <div className="ml-11">
      <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
        <AlertCircleIcon className="size-4 text-destructive flex-shrink-0 mt-0.5" />
        <p className="text-sm text-destructive">{content}</p>
      </div>
    </div>
  );
});

/**
 * Truncate output for display
 */
function truncateOutput(output: string, maxLength = 2000): string {
  if (output.length <= maxLength) return output;
  return output.slice(0, maxLength) + "\n\n... (truncated, " + (output.length - maxLength) + " more characters)";
}
