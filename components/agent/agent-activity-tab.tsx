"use client";

/**
 * Agent Activity Tab Component
 *
 * Real-time activity feed using AI Elements components:
 * - Reasoning: For LLM thinking/reasoning text
 * - Tool: For tool calls with input/output
 * - CodeBlock: For code and file content display
 * - Task: For task progress tracking
 */

import { memo, useMemo, useRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  BotIcon,
  ArrowDownIcon,
  AlertCircleIcon,
} from "lucide-react";
import type { WorkflowStreamEvent } from "@/hooks/use-workflow-stream";

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
}

// Activity item types
type ActivityType = "thinking" | "text" | "tool_call" | "tool_result" | "file_changed" | "progress" | "error";

interface ActivityItem {
  id: string;
  type: ActivityType;
  timestamp: Date;
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
};

/**
 * Map our tool status to AI Elements ToolUIPart state
 */
function mapToolStatus(status?: string): "input-available" | "output-available" | "output-error" {
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
 * Convert workflow events to activity items
 */
function eventsToActivityItems(events: WorkflowStreamEvent[]): ActivityItem[] {
  const items: ActivityItem[] = [];
  let currentThinking = "";
  let lastThinkingTime: Date | null = null;
  let currentText = "";
  let lastTextTime: Date | null = null;

  // Map to correlate tool calls with results
  const pendingToolCalls = new Map<string, ActivityItem>();

  for (const event of events) {
    switch (event.type) {
      case "thinking":
        // Accumulate thinking blocks (Claude's internal reasoning)
        if (event.data.content || event.data.text) {
          currentThinking += event.data.content || event.data.text || "";
          lastThinkingTime = new Date(event.timestamp);
        }
        break;

      case "llm_chunk":
        // Accumulate LLM text chunks (visible output)
        if (event.data.content || event.data.text) {
          currentText += event.data.content || event.data.text || "";
          lastTextTime = new Date(event.timestamp);
        }
        break;

      case "tool_call": {
        // Flush any accumulated thinking before tool call
        if (currentThinking.trim().length > 20) {
          items.push({
            id: `thinking-${event.id}`,
            type: "thinking",
            timestamp: lastThinkingTime || new Date(event.timestamp),
            content: currentThinking,
            agentId: event.agentId,
          });
          currentThinking = "";
        }

        // Flush any accumulated text before tool call
        if (currentText.trim().length > 20) {
          items.push({
            id: `text-${event.id}`,
            type: "text",
            timestamp: lastTextTime || new Date(event.timestamp),
            content: currentText,
            agentId: event.agentId,
          });
          currentText = "";
        }

        // Add tool call
        if (event.data.toolName) {
          const callId = event.data.callId as string | undefined;

          // Debug logging
          console.log(`[Activity] tool_call: ${event.data.toolName} callId=${callId || "NONE"}`);

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

      case "tool_result": {
        // Try to correlate with existing tool call
        const callId = event.data.callId as string | undefined;
        const resultToolName = event.data.toolName as string | undefined;
        const resultOutput = (event.data.result || event.data.toolOutput || "") as string;
        const isError = Boolean(event.data.isError);
        const newStatus = isError ? "error" : "success";

        // Debug logging - show raw event data to see what's arriving
        console.log(`[Activity] tool_result raw event.data:`, {
          result: event.data.result ? `"${String(event.data.result).substring(0, 100)}..."` : "UNDEFINED",
          toolOutput: event.data.toolOutput ? `"${String(event.data.toolOutput).substring(0, 100)}..."` : "UNDEFINED",
          toolName: event.data.toolName,
          callId: event.data.callId,
          isError: event.data.isError,
          allKeys: Object.keys(event.data),
        });
        console.log(`[Activity] Extracted resultOutput (first 100 chars): "${resultOutput.substring(0, 100)}..."`);

        // 1. First try by callId
        let matchedCall = callId ? pendingToolCalls.get(callId) : null;
        let matchMethod = matchedCall ? "callId" : "none";

        // 2. If not found by callId, try by toolName (case-insensitive)
        if (!matchedCall && resultToolName) {
          matchedCall = items.find(
            (i) =>
              i.type === "tool_call" &&
              i.status === "running" &&
              i.toolName?.toLowerCase() === resultToolName.toLowerCase()
          ) || null;
          if (matchedCall) matchMethod = "toolName";
        }

        // 3. If still not found, match the oldest running tool call
        if (!matchedCall) {
          matchedCall = items.find(
            (i) => i.type === "tool_call" && i.status === "running"
          ) || null;
          if (matchedCall) matchMethod = "oldest-running";
        }

        console.log(`[Activity] Matched via ${matchMethod}: ${matchedCall?.toolName || "NO MATCH"} (matchedCall.callId=${matchedCall?.callId || "none"})`);
        console.log(`[Activity] pendingToolCalls in map:`, Array.from(pendingToolCalls.keys()));

        if (matchedCall) {
          // Update the existing tool call with result
          matchedCall.status = newStatus;
          matchedCall.toolOutput = resultOutput;
          if (callId) {
            pendingToolCalls.delete(callId);
          }
        } else {
          // Standalone result (no matching call found)
          console.log(`[Activity] Creating standalone tool_result for ${resultToolName}`);
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

      case "file_changed":
        // Handle file change events (create, modify, delete)
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

      case "task_progress":
        items.push({
          id: event.id,
          type: "progress",
          timestamp: new Date(event.timestamp),
          content: event.data.status || "Progress update",
        });
        break;

      case "error":
        items.push({
          id: event.id,
          type: "error",
          timestamp: new Date(event.timestamp),
          content: event.data.error || "An error occurred",
          status: "error",
        });
        break;
    }
  }

  // Flush remaining thinking
  if (currentThinking.trim().length > 20) {
    items.push({
      id: `thinking-final`,
      type: "thinking",
      timestamp: lastThinkingTime || new Date(),
      content: currentThinking,
    });
  }

  // Flush remaining text
  if (currentText.trim().length > 20) {
    items.push({
      id: `text-final`,
      type: "text",
      timestamp: lastTextTime || new Date(),
      content: currentText,
    });
  }

  // Debug: Summary of matching
  const toolCalls = items.filter((i) => i.type === "tool_call");
  const runningCalls = toolCalls.filter((i) => i.status === "running");
  const completedCalls = toolCalls.filter((i) => i.status !== "running");
  const unmatchedResults = items.filter((i) => i.type === "tool_result");
  console.log(
    `[Activity] Summary: ${toolCalls.length} tool_calls (${runningCalls.length} running, ${completedCalls.length} completed), ${unmatchedResults.length} unmatched tool_results`
  );

  return items;
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
}: AgentActivityTabProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const activityItems = useMemo(() => eventsToActivityItems(events), [events]);

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
        {activityItems.length === 0 && !accumulatedText ? (
          <EmptyState />
        ) : (
          <>
            {activityItems.map((item) => (
              <ActivityCard key={item.id} item={item} />
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
}

const ActivityCard = memo(function ActivityCard({ item }: ActivityCardProps) {
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
 * Thinking card - Claude's internal reasoning (extended thinking)
 * Displayed collapsed by default with a distinctive appearance
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

      {/* Thinking content - collapsible */}
      <div className="flex-1 min-w-0">
        <Reasoning duration={undefined} defaultOpen={false}>
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
