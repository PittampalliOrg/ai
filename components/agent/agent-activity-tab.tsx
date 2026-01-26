"use client";

/**
 * Agent Activity Tab Component
 *
 * Real-time activity feed showing:
 * 1. Agent reasoning (from llm_chunk → accumulatedText)
 * 2. Tool cards (from tool_call events)
 * 3. Tool results (from tool_result events)
 *
 * Card styling:
 * - Reasoning: Chat bubble with agent avatar
 * - Read tool: File icon + path + content preview
 * - Write/Edit tool: Diff view with additions/deletions
 * - Bash tool: Terminal-styled command + output
 */

import { memo, useMemo, useRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  FileIcon,
  FileEditIcon,
  FilePlusIcon,
  SearchIcon,
  TerminalIcon,
  FolderSearchIcon,
  BrainIcon,
  MessageCircleIcon,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  BotIcon,
} from "lucide-react";
import type { WorkflowStreamEvent } from "@/hooks/use-workflow-stream";
import type { WorkflowLogEntry } from "@/contexts/workflow-execution-context";

interface AgentActivityTabProps {
  events: WorkflowStreamEvent[];
  accumulatedText: string;
  isStreaming?: boolean;
  className?: string;
}

// Activity item types
type ActivityType = "reasoning" | "tool_call" | "tool_result" | "progress" | "error";

interface ActivityItem {
  id: string;
  type: ActivityType;
  timestamp: Date;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: string;
  content?: string;
  status?: "running" | "success" | "error";
  agentId?: string;
}

// Tool icon mapping
const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  read: FileIcon,
  write: FilePlusIcon,
  edit: FileEditIcon,
  create: FilePlusIcon,
  str_replace_based_edit_tool: FileEditIcon,
  shell: TerminalIcon,
  bash: TerminalIcon,
  grep: SearchIcon,
  glob: FolderSearchIcon,
  search: SearchIcon,
  task: BrainIcon,
};

const TOOL_LABELS: Record<string, string> = {
  read: "Read",
  write: "Write",
  edit: "Edit",
  create: "Create",
  str_replace_based_edit_tool: "Edit",
  shell: "Shell",
  bash: "Bash",
  grep: "Search",
  glob: "Find Files",
  search: "Search",
  task: "Agent Task",
};

/**
 * Convert workflow events to activity items
 */
function eventsToActivityItems(events: WorkflowStreamEvent[]): ActivityItem[] {
  const items: ActivityItem[] = [];
  let currentReasoning = "";
  let lastReasoningTime: Date | null = null;

  for (const event of events) {
    switch (event.type) {
      case "llm_chunk":
        // Accumulate LLM chunks into reasoning
        if (event.data.content) {
          currentReasoning += event.data.content;
          lastReasoningTime = new Date(event.timestamp);
        }
        break;

      case "tool_call":
        // Flush any accumulated reasoning before tool call
        if (currentReasoning.trim().length > 20) {
          items.push({
            id: `reasoning-${event.id}`,
            type: "reasoning",
            timestamp: lastReasoningTime || new Date(event.timestamp),
            content: currentReasoning,
            agentId: event.agentId,
          });
          currentReasoning = "";
        }

        // Add tool call
        if (event.data.toolName) {
          items.push({
            id: event.id,
            type: "tool_call",
            timestamp: new Date(event.timestamp),
            toolName: event.data.toolName,
            toolInput: event.data.toolInput,
            status: "running",
            agentId: event.agentId,
          });
        }
        break;

      case "tool_result":
        // Update existing tool call or add new result
        const existingCall = items.find(
          (i) => i.type === "tool_call" && i.toolName === event.data.toolName && i.status === "running"
        );
        if (existingCall) {
          existingCall.status = event.data.error ? "error" : "success";
          existingCall.toolOutput = event.data.toolOutput;
        } else {
          items.push({
            id: event.id,
            type: "tool_result",
            timestamp: new Date(event.timestamp),
            toolName: event.data.toolName,
            toolOutput: event.data.toolOutput,
            status: event.data.error ? "error" : "success",
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

  // Flush remaining reasoning
  if (currentReasoning.trim().length > 20) {
    items.push({
      id: `reasoning-final`,
      type: "reasoning",
      timestamp: lastReasoningTime || new Date(),
      content: currentReasoning,
    });
  }

  return items;
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
    <div className={cn("flex flex-col h-full", className)}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {activityItems.length === 0 && !accumulatedText ? (
          <div className="flex items-center justify-center h-32 text-zinc-500">
            <p className="text-sm">Waiting for agent activity...</p>
          </div>
        ) : (
          <>
            {activityItems.map((item) => (
              <ActivityCard key={item.id} item={item} />
            ))}

            {/* Live streaming text */}
            {isStreaming && accumulatedText && (
              <ReasoningCard
                content={accumulatedText}
                isStreaming={true}
              />
            )}
          </>
        )}
      </div>

      {/* Scroll indicator */}
      {!autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true);
            if (scrollRef.current) {
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
          }}
          className="absolute bottom-4 right-4 px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded-full text-xs shadow-lg hover:bg-zinc-700 transition-colors"
        >
          ↓ Jump to latest
        </button>
      )}
    </div>
  );
});

interface ActivityCardProps {
  item: ActivityItem;
}

const ActivityCard = memo(function ActivityCard({ item }: ActivityCardProps) {
  switch (item.type) {
    case "reasoning":
      return <ReasoningCard content={item.content || ""} agentId={item.agentId} />;
    case "tool_call":
      return <ToolCallCard item={item} />;
    case "tool_result":
      return <ToolResultCard item={item} />;
    case "progress":
      return <ProgressCard content={item.content || ""} />;
    case "error":
      return <ErrorCard content={item.content || ""} />;
    default:
      return null;
  }
});

interface ReasoningCardProps {
  content: string;
  agentId?: string;
  isStreaming?: boolean;
}

const ReasoningCard = memo(function ReasoningCard({
  content,
  agentId,
  isStreaming = false,
}: ReasoningCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // Truncate for collapsed view
  const truncatedContent = content.length > 500 && !isExpanded
    ? content.slice(0, 500) + "..."
    : content;

  return (
    <div className="flex gap-3">
      {/* Agent Avatar */}
      <div className="flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
          <BotIcon className="w-4 h-4 text-white" />
        </div>
      </div>

      {/* Reasoning Bubble */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-zinc-400">Agent</span>
          {isStreaming && (
            <span className="flex items-center gap-1 text-xs text-blue-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Thinking...
            </span>
          )}
        </div>

        <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
          <p className="text-sm text-zinc-200 whitespace-pre-wrap break-words leading-relaxed">
            {truncatedContent}
            {isStreaming && <span className="animate-pulse">▋</span>}
          </p>

          {content.length > 500 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-3 h-3" /> Show less
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" /> Show more
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

interface ToolCallCardProps {
  item: ActivityItem;
}

const ToolCallCard = memo(function ToolCallCard({ item }: ToolCallCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const normalizedName = (item.toolName || "").toLowerCase();
  const ToolIcon = TOOL_ICONS[normalizedName] || FileIcon;
  const toolLabel = TOOL_LABELS[normalizedName] || item.toolName || "Tool";

  // Extract relevant info based on tool type
  const { displayPath, displayCommand } = useMemo(() => {
    if (!item.toolInput || typeof item.toolInput !== "object") {
      return { displayPath: null, displayCommand: null };
    }

    const input = item.toolInput as Record<string, unknown>;
    const path = (input.path || input.file_path || input.filePath || input.file) as string | undefined;
    const command = input.command as string | string[] | undefined;

    return {
      displayPath: path || null,
      displayCommand: Array.isArray(command) ? command.join(" ") : command || null,
    };
  }, [item.toolInput]);

  const isShellTool = normalizedName === "shell" || normalizedName === "bash";

  return (
    <div className="ml-11">
      <div
        className={cn(
          "rounded-lg border overflow-hidden",
          item.status === "error"
            ? "border-red-500/50 bg-red-950/20"
            : item.status === "success"
            ? "border-green-500/30 bg-zinc-800/30"
            : "border-blue-500/30 bg-blue-950/20"
        )}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-zinc-800/50 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <ToolIcon
              className={cn(
                "w-4 h-4",
                item.status === "error"
                  ? "text-red-400"
                  : item.status === "success"
                  ? "text-green-400"
                  : "text-blue-400"
              )}
            />
            <span className="text-sm font-medium text-zinc-200">{toolLabel}</span>

            {displayPath && (
              <span className="text-xs text-zinc-500 truncate max-w-[200px]" title={displayPath}>
                {displayPath.split("/").pop()}
              </span>
            )}
          </div>

          {/* Status */}
          <div className="flex items-center gap-2">
            {item.status === "running" && (
              <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
            )}
            {item.status === "success" && (
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
            )}
            {item.status === "error" && (
              <XCircle className="w-3.5 h-3.5 text-red-400" />
            )}

            {(item.toolInput || item.toolOutput) && (
              isExpanded ? (
                <ChevronUp className="w-3.5 h-3.5 text-zinc-500" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
              )
            )}
          </div>
        </div>

        {/* Shell command display */}
        {isShellTool && displayCommand && (
          <div className="px-3 py-2 border-t border-zinc-700 bg-zinc-900">
            <pre className="text-xs font-mono text-zinc-300 whitespace-pre-wrap break-all">
              $ {displayCommand.length > 100 ? displayCommand.slice(0, 100) + "..." : displayCommand}
            </pre>
          </div>
        )}

        {isExpanded && (
          <div className="border-t border-zinc-700">
            {Boolean(item.toolInput) && !isShellTool && (
              <div className="px-3 py-2 bg-zinc-900/50">
                <div className="text-xs text-zinc-500 mb-1">Input</div>
                <pre className="text-xs font-mono text-zinc-400 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                  {formatToolInput(item.toolInput)}
                </pre>
              </div>
            )}

            {item.toolOutput && (
              <div
                className={cn(
                  "px-3 py-2",
                  item.status === "error" ? "bg-red-950/30" : "bg-zinc-900/50"
                )}
              >
                <div className="text-xs text-zinc-500 mb-1">Output</div>
                <pre
                  className={cn(
                    "text-xs font-mono whitespace-pre-wrap break-all max-h-48 overflow-y-auto",
                    item.status === "error" ? "text-red-300" : "text-zinc-400"
                  )}
                >
                  {truncateOutput(item.toolOutput)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

const ToolResultCard = memo(function ToolResultCard({ item }: { item: ActivityItem }) {
  // If we have a standalone result (no matching call), show it
  return <ToolCallCard item={item} />;
});

const ProgressCard = memo(function ProgressCard({ content }: { content: string }) {
  return (
    <div className="ml-11 flex items-center gap-2 text-xs text-zinc-500">
      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
      {content}
    </div>
  );
});

const ErrorCard = memo(function ErrorCard({ content }: { content: string }) {
  return (
    <div className="ml-11">
      <div className="flex items-center gap-2 px-3 py-2 bg-red-950/30 border border-red-500/50 rounded-lg">
        <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
        <p className="text-sm text-red-300">{content}</p>
      </div>
    </div>
  );
});

/**
 * Format tool input for display
 */
function formatToolInput(input: unknown): string {
  if (!input) return "";

  const obj = input as Record<string, unknown>;

  // For file operations, show the path prominently
  const path = obj.path || obj.file_path || obj.filePath || obj.file;
  if (path) {
    const lines: string[] = [`path: ${path}`];

    // Add other relevant fields
    if (obj.content) {
      const content = String(obj.content);
      lines.push(`content: ${content.length > 200 ? content.slice(0, 200) + "..." : content}`);
    }
    if (obj.pattern) lines.push(`pattern: ${obj.pattern}`);
    if (obj.query) lines.push(`query: ${obj.query}`);

    return lines.join("\n");
  }

  // Generic JSON display
  try {
    const str = JSON.stringify(input, null, 2);
    return str.length > 500 ? str.slice(0, 500) + "..." : str;
  } catch {
    return String(input);
  }
}

/**
 * Truncate output for display
 */
function truncateOutput(output: string, maxLength = 800): string {
  if (output.length <= maxLength) return output;
  return output.slice(0, maxLength) + "\n... (truncated)";
}
