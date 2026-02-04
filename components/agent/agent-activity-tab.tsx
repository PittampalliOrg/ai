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

import React, { memo, useMemo, useRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  BotIcon,
  ArrowDownIcon,
  AlertCircleIcon,
  CircleIcon,
  CheckCircle2Icon,
  PauseCircleIcon,
  ListChecksIcon,
  XCircleIcon,
  PlayIcon,
  RefreshCwIcon,
  FlaskConicalIcon,
  CodeIcon,
  GitBranchIcon,
  ClipboardListIcon,
} from "lucide-react";
import type { WorkflowStreamEvent, TaskData } from "@/hooks/use-workflow-stream";
import { isTaskTool, isPlanTool, isThinkTool, isDraftPlanTool } from "@/hooks/use-workflow-stream";
import type { TextUIPart, ReasoningUIPart, DynamicToolUIPart } from "ai";
import { AgentTaskCard } from "./agent-task-card";
import { AgentPlanCard, type PlanStatus } from "./agent-plan-card";
import { ToolGroupCard } from "./tool-group-card";

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
import {
  Plan,
  PlanHeader,
  PlanTitle,
  PlanDescription,
  PlanContent,
  PlanTrigger,
  PlanAction,
} from "@/components/ai-elements/plan";
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
  /** Whether the workflow is awaiting approval */
  isAwaitingApproval?: boolean;
  /** Callback when user approves the plan */
  onPlanApprove?: () => void;
  /** Callback when user rejects the plan */
  onPlanReject?: () => void;
}

// Union type for AI SDK UI parts we handle
type AgentUIPart = TextUIPart | ReasoningUIPart | DynamicToolUIPart;

// Activity item types - supports both new AI SDK format and legacy format
type ActivityType = "part" | "thinking" | "text" | "tool_call" | "tool_result" | "file_changed" | "progress" | "completed" | "error" | "task_created" | "task_updated" | "plan_created" | "plan_complete" | "phase_started" | "phase_completed" | "phase_failed" | "test_retry";

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
  // Phase event fields
  phase?: string;
  progress?: number;
  // Phase completion statistics
  tasksCount?: number;
  testsCount?: number;
  testsRun?: number;
  testsPassed?: number;
  testsFailed?: number;
  passed?: boolean;
  completedTasks?: string[];
  // Test retry fields
  attempt?: number;
  maxRetries?: number;
}

/**
 * Tool group for consecutive tool calls of the same type
 */
interface ToolGroup {
  toolName: string;
  items: ActivityItem[];
  firstTimestamp: Date;
  lastTimestamp: Date;
  completedCount: number;
  runningCount: number;
  errorCount: number;
}

/**
 * Grouped activity item - either a regular item or a tool group
 */
type GroupedActivityItem =
  | ActivityItem
  | { type: "tool_group"; toolGroup: ToolGroup; id: string };

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

      // LEGACY: thinking events (both "thinking" and "thinking_delta" from backend)
      case "thinking":
      case "thinking_delta":
      case "reasoning":
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

      // LEGACY: llm_chunk and message events
      case "llm_chunk":
      case "message_start":
      case "text_delta":
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
          content: event.data.status || event.data.message || "Progress update",
        });
        break;

      case "task_completed":
        flushCurrent();
        items.push({
          id: event.id,
          type: "completed",
          timestamp: new Date(event.timestamp),
          content: event.data.status || event.data.message || "Task completed",
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

      // Phase lifecycle events
      case "phase_started": {
        flushCurrent();
        items.push({
          id: event.id,
          type: "phase_started",
          timestamp: new Date(event.timestamp),
          phase: event.data.phase as string,
          content: event.data.status as string || event.data.message as string,
          progress: event.data.progress as number,
          testsCount: event.data.tests_count as number,
          agentId: event.agentId,
        });
        break;
      }

      case "phase_completed": {
        flushCurrent();
        items.push({
          id: event.id,
          type: "phase_completed",
          timestamp: new Date(event.timestamp),
          phase: event.data.phase as string,
          content: event.data.status as string || event.data.message as string,
          progress: event.data.progress as number,
          tasksCount: event.data.tasks_count as number,
          testsCount: event.data.tests_count as number,
          testsRun: event.data.tests_run as number,
          testsPassed: event.data.tests_passed as number,
          testsFailed: event.data.tests_failed as number,
          passed: event.data.passed as boolean,
          completedTasks: event.data.completed_tasks as string[],
          agentId: event.agentId,
        });
        break;
      }

      case "phase_failed": {
        flushCurrent();
        items.push({
          id: event.id,
          type: "phase_failed",
          timestamp: new Date(event.timestamp),
          phase: event.data.phase as string,
          content: event.data.error as string || event.data.status as string,
          status: "error",
          agentId: event.agentId,
        });
        break;
      }

      case "execution_started": {
        flushCurrent();
        items.push({
          id: event.id,
          type: "phase_started",
          timestamp: new Date(event.timestamp),
          phase: "execution",
          content: event.data.status as string || "Starting execution...",
          progress: event.data.progress as number,
          agentId: event.agentId,
        });
        break;
      }

      case "execution_completed": {
        flushCurrent();
        items.push({
          id: event.id,
          type: "phase_completed",
          timestamp: new Date(event.timestamp),
          phase: "execution",
          content: event.data.status as string || "Execution completed",
          progress: event.data.progress as number,
          passed: event.data.success as boolean,
          completedTasks: event.data.completed_tasks as string[],
          agentId: event.agentId,
        });
        break;
      }

      case "execution_failed": {
        flushCurrent();
        items.push({
          id: event.id,
          type: "phase_failed",
          timestamp: new Date(event.timestamp),
          phase: "execution",
          content: event.data.error as string || "Execution failed",
          status: "error",
          agentId: event.agentId,
        });
        break;
      }

      case "test_retry": {
        flushCurrent();
        items.push({
          id: event.id,
          type: "test_retry",
          timestamp: new Date(event.timestamp),
          content: event.data.status as string,
          attempt: event.data.attempt as number,
          maxRetries: event.data.max_retries as number,
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
 * Tools that should never be grouped (special tools with dedicated rendering)
 */
const NEVER_GROUP_TOOLS = new Set([
  "think",
  "draft_plan",
  "taskcreate",
  "taskupdate",
  "enterplanmode",
  "exitplanmode",
]);

/**
 * Check if a tool should be excluded from grouping
 */
function shouldExcludeFromGrouping(toolName: string): boolean {
  return NEVER_GROUP_TOOLS.has(toolName.toLowerCase());
}

/**
 * Get the tool name from an activity item
 */
function getItemToolName(item: ActivityItem): string | null {
  // For AI SDK part format
  if (item.type === "part" && item.part && isDynamicToolPart(item.part)) {
    return item.part.toolName;
  }
  // For legacy format
  if (item.type === "tool_call" || item.type === "tool_result" || item.type === "file_changed") {
    return item.toolName || null;
  }
  return null;
}

/**
 * Get the status of a tool item
 */
function getItemStatus(item: ActivityItem): "running" | "success" | "error" {
  // For AI SDK part format
  if (item.type === "part" && item.part && isDynamicToolPart(item.part)) {
    const state = item.part.state;
    if (state === "input-available" || state === "input-streaming") return "running";
    if (state === "output-error") return "error";
    return "success";
  }
  // For legacy format
  return item.status || "success";
}

/**
 * Check if an item is a tool item that can be grouped
 */
function isGroupableTool(item: ActivityItem): boolean {
  const toolName = getItemToolName(item);
  if (!toolName) return false;
  return !shouldExcludeFromGrouping(toolName);
}

/**
 * Group consecutive tool calls of the same type
 *
 * Grouping rules:
 * 1. Group consecutive tool calls with the same toolName
 * 2. Break group on: different tool, thinking/reasoning, text output, >30s gap
 * 3. Minimum 2 items to form a group (single items render normally)
 * 4. Special tools never grouped: think, draft_plan, TaskCreate, TaskUpdate, EnterPlanMode, ExitPlanMode
 */
function groupActivityItems(items: ActivityItem[]): GroupedActivityItem[] {
  const result: GroupedActivityItem[] = [];
  let currentGroup: ActivityItem[] = [];
  let currentToolName: string | null = null;
  let lastTimestamp: Date | null = null;

  const flushGroup = () => {
    if (currentGroup.length === 0) return;

    if (currentGroup.length === 1) {
      // Single item - don't group
      result.push(currentGroup[0]);
    } else {
      // Multiple items - create a group
      let completedCount = 0;
      let runningCount = 0;
      let errorCount = 0;

      for (const item of currentGroup) {
        const status = getItemStatus(item);
        if (status === "running") runningCount++;
        else if (status === "error") errorCount++;
        else completedCount++;
      }

      const toolGroup: ToolGroup = {
        toolName: currentToolName!,
        items: currentGroup,
        firstTimestamp: currentGroup[0].timestamp,
        lastTimestamp: currentGroup[currentGroup.length - 1].timestamp,
        completedCount,
        runningCount,
        errorCount,
      };

      result.push({
        type: "tool_group",
        toolGroup,
        id: `group-${currentToolName}-${currentGroup[0].id}`,
      });
    }

    currentGroup = [];
    currentToolName = null;
    lastTimestamp = null;
  };

  const MAX_GAP_MS = 30000; // 30 seconds

  for (const item of items) {
    const toolName = getItemToolName(item);

    // Non-tool items break the group
    if (!toolName || !isGroupableTool(item)) {
      flushGroup();
      result.push(item);
      continue;
    }

    // Check if we should continue the current group or start a new one
    const shouldBreak =
      currentToolName !== null &&
      (toolName.toLowerCase() !== currentToolName.toLowerCase() ||
        (lastTimestamp &&
          item.timestamp.getTime() - lastTimestamp.getTime() > MAX_GAP_MS));

    if (shouldBreak) {
      flushGroup();
    }

    // Add to current group
    currentGroup.push(item);
    currentToolName = toolName;
    lastTimestamp = item.timestamp;
  }

  // Flush any remaining group
  flushGroup();

  return result;
}

/**
 * Type guard for grouped tool items
 */
function isToolGroup(
  item: GroupedActivityItem
): item is { type: "tool_group"; toolGroup: ToolGroup; id: string } {
  return (item as { type: string }).type === "tool_group";
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
  isAwaitingApproval = false,
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

  // Group consecutive tool calls of the same type
  const groupedActivityItems = useMemo(
    () => groupActivityItems(filteredActivityItems),
    [filteredActivityItems]
  );

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

  // Render function for individual tool cards (passed to ToolGroupCard)
  const renderToolCard = (item: ActivityItem, taskList: TaskData[]) => {
    return <ActivityCard item={item} tasks={taskList} />;
  };

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {groupedActivityItems.length === 0 && !accumulatedText && !hasActivePlan ? (
          <EmptyState isAwaitingApproval={isAwaitingApproval || effectivePlanStatus === "awaiting_approval"} />
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

            {/* Activity items (grouped and filtered) */}
            {groupedActivityItems.map((item) => {
              if (isToolGroup(item)) {
                return (
                  <ToolGroupCard
                    key={item.id}
                    group={item.toolGroup}
                    tasks={tasks}
                    renderToolCard={renderToolCard}
                  />
                );
              }
              return <ActivityCard key={item.id} item={item} tasks={tasks} />;
            })}

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

const EmptyState = memo(function EmptyState({ isAwaitingApproval = false }: { isAwaitingApproval?: boolean }) {
  if (isAwaitingApproval) {
    // Don't show spinner when awaiting approval - workflow is paused
    return (
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
        <PauseCircleIcon className="size-8 mb-3 text-amber-500" />
        <p className="text-sm">Awaiting plan approval</p>
        <p className="text-xs mt-1">Use the buttons above to approve or reject the plan</p>
      </div>
    );
  }
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
    case "tool_result": {
      // Check for specialized tool rendering
      const toolName = item.toolName || "";
      if (isThinkTool(toolName)) {
        return <LegacyThinkToolCard item={item} />;
      }
      if (isDraftPlanTool(toolName)) {
        return <LegacyDraftPlanToolCard item={item} tasks={tasks} />;
      }
      return <ToolCard item={item} />;
    }
    case "file_changed":
      return <ToolCard item={item} />;
    case "progress":
      return <ProgressCard content={item.content || ""} status={item.status} />;
    case "completed":
      return <CompletedCard content={item.content || ""} />;
    case "error":
      return <ErrorCard content={item.content || ""} />;
    case "phase_started":
      return <PhaseStartedCard item={item} />;
    case "phase_completed":
      return <PhaseCompletedCard item={item} />;
    case "phase_failed":
      return <PhaseFailedCard item={item} />;
    case "test_retry":
      return <TestRetryCard item={item} />;
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
    // Check for think tool - render with Reasoning component
    if (isThinkTool(part.toolName)) {
      return <ThinkToolCard part={part} />;
    }
    // Check for draft_plan tool - render with Plan component
    if (isDraftPlanTool(part.toolName)) {
      return <DraftPlanToolCard part={part} tasks={tasks} />;
    }
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
 * Think tool card - renders thinking/reasoning content using Reasoning component
 */
const ThinkToolCard = memo(function ThinkToolCard({ part }: { part: DynamicToolUIPart }) {
  const input = part.input as Record<string, unknown> | unknown[] | undefined;
  const isComplete = part.state === "output-available" || part.state === "output-error";

  // Extract thinking content from input (first array element or direct content)
  let thinkingContent: string;
  if (Array.isArray(input)) {
    thinkingContent = String(input[0] || "");
  } else if (input && typeof input === "object") {
    thinkingContent = String(
      input.content || input.thought || input.reasoning || JSON.stringify(input, null, 2)
    );
  } else {
    thinkingContent = String(input || "");
  }

  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0">
        <div className="size-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
          <BotIcon className="size-4 text-white" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <Reasoning
          isStreaming={part.state === "input-streaming"}
          defaultOpen={!isComplete}
        >
          <ReasoningTrigger />
          <ReasoningContent>{thinkingContent}</ReasoningContent>
        </Reasoning>
      </div>
    </div>
  );
});

/**
 * Draft plan tool card - renders plan using Plan component
 */
const DraftPlanToolCard = memo(function DraftPlanToolCard({
  part,
  tasks: aggregatedTasks,
}: {
  part: DynamicToolUIPart;
  tasks: TaskData[];
}) {
  const input = part.input as Record<string, unknown> | unknown[] | undefined;
  const isStreaming = part.state === "input-streaming" || part.state === "input-available";

  // Parse plan content from input
  let planTasks: Array<{ id: string; subject: string; description: string }> = [];
  let planSummary = "";

  if (Array.isArray(input)) {
    // Input is array - first element is summary, rest may have embedded tasks
    planSummary = String(input[0] || "");

    // Try to extract tasks from the summary if it contains JSON
    try {
      const jsonMatch = planSummary.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        planTasks = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Use tasks from aggregation instead
      planTasks = aggregatedTasks.map((t) => ({
        id: t.id,
        subject: t.subject,
        description: t.description,
      }));
    }
  } else if (input?.tasks && Array.isArray(input.tasks)) {
    planTasks = input.tasks as Array<{ id: string; subject: string; description: string }>;
    planSummary = String(input.summary || input.description || "");
  }

  // Fallback to aggregated tasks if none found in input
  if (planTasks.length === 0 && aggregatedTasks.length > 0) {
    planTasks = aggregatedTasks.map((t) => ({
      id: t.id,
      subject: t.subject,
      description: t.description,
    }));
  }

  return (
    <div className="ml-11">
      <Plan isStreaming={isStreaming} defaultOpen={true}>
        <PlanHeader>
          <div className="flex-1">
            <PlanTitle>Implementation Plan</PlanTitle>
            {planSummary && (
              <PlanDescription>{planSummary.slice(0, 200)}</PlanDescription>
            )}
          </div>
          <PlanAction>
            <PlanTrigger />
          </PlanAction>
        </PlanHeader>
        <PlanContent>
          <div className="space-y-2">
            {planTasks.map((task, index) => (
              <div
                key={task.id || index}
                className="flex gap-3 p-2 rounded-lg bg-muted/30"
              >
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{task.subject}</p>
                  {task.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {task.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {planTasks.length === 0 && (
              <div className="text-sm text-muted-foreground italic">
                No tasks defined yet...
              </div>
            )}
          </div>
        </PlanContent>
      </Plan>
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
 * ExecutionResult card - renders execution/test results in a formatted way
 * Handles JSON with success, completed_tasks, output, errors fields
 */
interface ExecutionResultData {
  success: boolean;
  completed_tasks?: string[];
  output?: string;
  errors?: string[];
  passed?: number;
  failed?: number;
  summary?: string;
}

function tryParseExecutionResult(content: string): ExecutionResultData | null {
  // Quick check for JSON-like content with expected fields
  if (!content.includes('"success"') || !content.includes('"output"')) {
    return null;
  }

  try {
    const parsed = JSON.parse(content);
    // Validate it has the expected structure
    if (typeof parsed.success === "boolean" && ("output" in parsed || "summary" in parsed)) {
      return parsed as ExecutionResultData;
    }
  } catch {
    // Not valid JSON
  }
  return null;
}

const ExecutionResultCard = memo(function ExecutionResultCard({
  result
}: {
  result: ExecutionResultData
}) {
  const isSuccess = result.success;
  const hasErrors = result.errors && result.errors.length > 0;

  return (
    <div className="flex gap-3">
      {/* Status Avatar */}
      <div className="flex-shrink-0">
        <div className={cn(
          "size-8 rounded-full flex items-center justify-center",
          isSuccess
            ? "bg-gradient-to-br from-green-500 to-emerald-600"
            : "bg-gradient-to-br from-red-500 to-rose-600"
        )}>
          {isSuccess ? (
            <CheckCircle2Icon className="size-4 text-white" />
          ) : (
            <XCircleIcon className="size-4 text-white" />
          )}
        </div>
      </div>

      {/* Result content */}
      <div className="flex-1 min-w-0 space-y-3">
        {/* Header */}
        <div className={cn(
          "flex items-center gap-2 font-medium",
          isSuccess ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
        )}>
          {isSuccess ? "Execution Complete" : "Execution Failed"}
        </div>

        {/* Completed Tasks */}
        {result.completed_tasks && result.completed_tasks.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <ListChecksIcon className="size-3.5" />
              Completed Tasks
            </div>
            <ul className="space-y-1 ml-1">
              {result.completed_tasks.map((task, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                  <CheckCircle2Icon className="size-3.5 text-green-500 flex-shrink-0" />
                  <span>{task}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Output/Summary */}
        {(result.output || result.summary) && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Summary
            </div>
            <div className="text-sm text-foreground whitespace-pre-wrap bg-muted/30 rounded-md px-3 py-2 border border-border/50">
              {result.output || result.summary}
            </div>
          </div>
        )}

        {/* Test Results (if present) */}
        {(result.passed !== undefined || result.failed !== undefined) && (
          <div className="flex items-center gap-4 text-sm">
            {result.passed !== undefined && (
              <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                <CheckCircle2Icon className="size-3.5" />
                {result.passed} passed
              </span>
            )}
            {result.failed !== undefined && result.failed > 0 && (
              <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                <XCircleIcon className="size-3.5" />
                {result.failed} failed
              </span>
            )}
          </div>
        )}

        {/* Errors */}
        {hasErrors && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wide">
              <AlertCircleIcon className="size-3.5" />
              Errors
            </div>
            <ul className="space-y-1 ml-1">
              {result.errors!.map((error, i) => (
                <li key={i} className="text-sm text-red-600 dark:text-red-400">
                  {error}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
});

/**
 * Text card - visible LLM output (not internal reasoning)
 * Displayed expanded by default
 * Detects and formats ExecutionResult JSON automatically
 */
const TextCard = memo(function TextCard({ content }: { content: string }) {
  // Try to parse as ExecutionResult
  const executionResult = useMemo(() => tryParseExecutionResult(content), [content]);

  if (executionResult) {
    return <ExecutionResultCard result={executionResult} />;
  }

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
 * Legacy think tool card - renders thinking content using Reasoning component
 * Handles tool_call/tool_result events with toolName="think"
 */
const LegacyThinkToolCard = memo(function LegacyThinkToolCard({ item }: { item: ActivityItem }) {
  const isComplete = item.status === "success" || item.status === "error";

  // Extract thinking content from toolInput (usually an array with first element being the thought)
  let thinkingContent: string;
  if (Array.isArray(item.toolInput)) {
    thinkingContent = String(item.toolInput[0] || "");
  } else if (item.toolInput && typeof item.toolInput === "object") {
    const input = item.toolInput as Record<string, unknown>;
    thinkingContent = String(input.content || input.thought || input.reasoning || JSON.stringify(input, null, 2));
  } else {
    thinkingContent = String(item.toolInput || "");
  }

  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0">
        <div className="size-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
          <BotIcon className="size-4 text-white" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <Reasoning
          isStreaming={item.status === "running"}
          defaultOpen={!isComplete}
        >
          <ReasoningTrigger />
          <ReasoningContent>{thinkingContent}</ReasoningContent>
        </Reasoning>
      </div>
    </div>
  );
});

/**
 * Legacy draft_plan tool card - renders plan using Plan component
 * Handles tool_call/tool_result events with toolName="draft_plan"
 */
const LegacyDraftPlanToolCard = memo(function LegacyDraftPlanToolCard({
  item,
  tasks = [],
}: {
  item: ActivityItem;
  tasks?: TaskData[];
}) {
  const isComplete = item.status === "success";
  const isStreaming = item.status === "running";

  // Parse plan content from toolInput
  let planSummary = "";
  let planTasks: Array<{ id: string; subject: string; description: string }> = [];

  if (Array.isArray(item.toolInput)) {
    planSummary = String(item.toolInput[0] || "");
    // Try to extract tasks from the summary if it contains JSON
    try {
      const jsonMatch = planSummary.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        planTasks = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Use tasks from aggregation instead
    }
  } else if (item.toolInput && typeof item.toolInput === "object") {
    const input = item.toolInput as Record<string, unknown>;
    if (input.tasks && Array.isArray(input.tasks)) {
      planTasks = input.tasks as typeof planTasks;
    }
    planSummary = String(input.summary || input.description || "");
  }

  // Fallback to aggregated tasks if none found in input
  if (planTasks.length === 0 && tasks.length > 0) {
    planTasks = tasks.map(t => ({ id: t.id, subject: t.subject, description: t.description }));
  }

  return (
    <div className="ml-11">
      <Plan isStreaming={isStreaming} defaultOpen={true}>
        <PlanHeader>
          <div className="flex-1">
            <PlanTitle>Implementation Plan</PlanTitle>
            {planSummary && (
              <PlanDescription>{planSummary.slice(0, 200)}</PlanDescription>
            )}
          </div>
          <PlanAction>
            <PlanTrigger />
          </PlanAction>
        </PlanHeader>
        <PlanContent>
          <div className="space-y-2">
            {planTasks.length > 0 ? (
              planTasks.map((task, index) => (
                <div key={task.id || index} className="flex gap-3 p-2 rounded-lg bg-muted/30">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{task.subject}</p>
                    {task.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {task.description}
                      </p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                {item.toolOutput || "Planning..."}
              </p>
            )}
          </div>
        </PlanContent>
      </Plan>
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
 * Shows spinner for active processing, or waiting icon for approval/paused states
 */
const ProgressCard = memo(function ProgressCard({
  content,
  status
}: {
  content: string;
  status?: "running" | "success" | "error";
}) {
  // Check if this is an approval-waiting state (shouldn't have active spinner)
  const isWaitingForApproval = content.toLowerCase().includes("approval") ||
    content.toLowerCase().includes("awaiting") ||
    content.toLowerCase().includes("waiting for");

  // Show spinner only when actively processing (status is running and not waiting for approval)
  const showSpinner = status === "running" && !isWaitingForApproval;

  return (
    <div className="ml-11 flex items-center gap-2 py-2">
      {showSpinner ? (
        <Loader />
      ) : isWaitingForApproval ? (
        <PauseCircleIcon className="size-4 text-amber-500" />
      ) : (
        <CircleIcon className="size-4 text-muted-foreground" />
      )}
      <span className="text-sm text-muted-foreground">{content}</span>
    </div>
  );
});

/**
 * Completed card - shows phase/task completion
 */
const CompletedCard = memo(function CompletedCard({ content }: { content: string }) {
  return (
    <div className="ml-11 flex items-center gap-2 py-2">
      <CheckCircle2Icon className="size-4 text-green-500" />
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
 * Get icon and color for a phase
 */
function getPhaseStyle(phase: string): { icon: React.ReactNode; bgColor: string; textColor: string; borderColor: string } {
  switch (phase?.toLowerCase()) {
    case "cloning":
    case "clone":
      return {
        icon: <GitBranchIcon className="size-4" />,
        bgColor: "bg-sky-500/10",
        textColor: "text-sky-600 dark:text-sky-400",
        borderColor: "border-sky-500/30",
      };
    case "planning":
    case "plan":
      return {
        icon: <ClipboardListIcon className="size-4" />,
        bgColor: "bg-violet-500/10",
        textColor: "text-violet-600 dark:text-violet-400",
        borderColor: "border-violet-500/30",
      };
    case "execution":
    case "executing":
      return {
        icon: <CodeIcon className="size-4" />,
        bgColor: "bg-blue-500/10",
        textColor: "text-blue-600 dark:text-blue-400",
        borderColor: "border-blue-500/30",
      };
    case "testing":
    case "test":
      return {
        icon: <FlaskConicalIcon className="size-4" />,
        bgColor: "bg-amber-500/10",
        textColor: "text-amber-600 dark:text-amber-400",
        borderColor: "border-amber-500/30",
      };
    default:
      return {
        icon: <PlayIcon className="size-4" />,
        bgColor: "bg-gray-500/10",
        textColor: "text-gray-600 dark:text-gray-400",
        borderColor: "border-gray-500/30",
      };
  }
}

/**
 * Phase started card - shows when a workflow phase begins
 */
const PhaseStartedCard = memo(function PhaseStartedCard({
  item,
}: {
  item: ActivityItem;
}) {
  const { icon, bgColor, textColor, borderColor } = getPhaseStyle(item.phase || "");
  const phaseName = item.phase ? item.phase.charAt(0).toUpperCase() + item.phase.slice(1) : "Phase";

  return (
    <div className="ml-11">
      <div className={cn("flex items-center gap-2 py-2 px-3 rounded-md border", bgColor, borderColor)}>
        <div className={textColor}>{icon}</div>
        <div className="flex-1 min-w-0">
          <span className={cn("text-sm font-medium", textColor)}>
            {phaseName} started
          </span>
          {item.content && item.content !== `${phaseName} started` && (
            <span className="text-sm text-muted-foreground ml-2">
              — {item.content}
            </span>
          )}
        </div>
        {item.progress !== undefined && (
          <span className="text-xs text-muted-foreground font-mono">
            {item.progress}%
          </span>
        )}
      </div>
    </div>
  );
});

/**
 * Phase completed card - shows when a workflow phase completes with stats
 */
const PhaseCompletedCard = memo(function PhaseCompletedCard({
  item,
}: {
  item: ActivityItem;
}) {
  const phase = item.phase?.toLowerCase();
  const phaseName = item.phase ? item.phase.charAt(0).toUpperCase() + item.phase.slice(1) : "Phase";

  // Determine success/failure state
  const isSuccess = item.passed !== false && item.status !== "error";
  const bgColor = isSuccess ? "bg-green-500/10" : "bg-red-500/10";
  const textColor = isSuccess ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
  const borderColor = isSuccess ? "border-green-500/30" : "border-red-500/30";

  return (
    <div className="ml-11">
      <div className={cn("py-2 px-3 rounded-md border", bgColor, borderColor)}>
        <div className="flex items-center gap-2">
          {isSuccess ? (
            <CheckCircle2Icon className={cn("size-4", textColor)} />
          ) : (
            <XCircleIcon className={cn("size-4", textColor)} />
          )}
          <span className={cn("text-sm font-medium", textColor)}>
            {phaseName} {isSuccess ? "completed" : "failed"}
          </span>
          {item.progress !== undefined && (
            <span className="text-xs text-muted-foreground font-mono ml-auto">
              {item.progress}%
            </span>
          )}
        </div>

        {/* Stats based on phase type */}
        <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
          {/* Planning stats */}
          {phase === "planning" && item.tasksCount !== undefined && (
            <span>{item.tasksCount} task{item.tasksCount !== 1 ? "s" : ""} created</span>
          )}
          {phase === "planning" && item.testsCount !== undefined && (
            <span>{item.testsCount} test{item.testsCount !== 1 ? "s" : ""} defined</span>
          )}

          {/* Execution stats */}
          {phase === "execution" && item.completedTasks && item.completedTasks.length > 0 && (
            <span>{item.completedTasks.length} task{item.completedTasks.length !== 1 ? "s" : ""} completed</span>
          )}

          {/* Testing stats */}
          {phase === "testing" && item.testsRun !== undefined && (
            <>
              <span>{item.testsRun} test{item.testsRun !== 1 ? "s" : ""} run</span>
              {item.testsPassed !== undefined && (
                <span className="text-green-600 dark:text-green-400">
                  {item.testsPassed} passed
                </span>
              )}
              {item.testsFailed !== undefined && item.testsFailed > 0 && (
                <span className="text-red-600 dark:text-red-400">
                  {item.testsFailed} failed
                </span>
              )}
            </>
          )}
        </div>

        {/* Status message if different from default */}
        {item.content && !item.content.toLowerCase().includes("completed") && (
          <p className="mt-1 text-xs text-muted-foreground">{item.content}</p>
        )}
      </div>
    </div>
  );
});

/**
 * Phase failed card - shows when a workflow phase fails
 */
const PhaseFailedCard = memo(function PhaseFailedCard({
  item,
}: {
  item: ActivityItem;
}) {
  const phaseName = item.phase ? item.phase.charAt(0).toUpperCase() + item.phase.slice(1) : "Phase";

  return (
    <div className="ml-11">
      <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
        <XCircleIcon className="size-4 text-destructive flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-destructive">
            {phaseName} failed
          </p>
          {item.content && (
            <p className="text-sm text-destructive/80 mt-0.5">{item.content}</p>
          )}
        </div>
      </div>
    </div>
  );
});

/**
 * Test retry card - shows when tests are being retried
 */
const TestRetryCard = memo(function TestRetryCard({
  item,
}: {
  item: ActivityItem;
}) {
  return (
    <div className="ml-11">
      <div className="flex items-center gap-2 py-2 px-3 bg-amber-500/10 border border-amber-500/30 rounded-md">
        <RefreshCwIcon className="size-4 text-amber-600 dark:text-amber-400" />
        <span className="text-sm text-amber-600 dark:text-amber-400">
          Test retry attempt {item.attempt} of {item.maxRetries}
        </span>
        {item.content && (
          <span className="text-sm text-muted-foreground">
            — {item.content}
          </span>
        )}
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
