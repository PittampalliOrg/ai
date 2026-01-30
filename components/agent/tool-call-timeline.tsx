"use client";

/**
 * Tool Call Timeline Component
 *
 * Vertical timeline of tool executions with:
 * - Tool name with icon
 * - Duration badge
 * - Collapsible input/output
 * - Status indicator (spinner/check/x)
 */

import { memo, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  FileIcon,
  FileEditIcon,
  FilePlusIcon,
  SearchIcon,
  TerminalIcon,
  FolderSearchIcon,
  BrainIcon,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { WorkflowStreamEvent } from "@/hooks/use-workflow-stream";
import type { WorkflowLogEntry } from "@/contexts/workflow-execution-context";

export interface ToolHistoryItem {
  id: string;
  toolName: string;
  toolInput?: unknown;
  toolOutput?: string;
  status: "running" | "success" | "error";
  startTime: Date;
  endTime?: Date;
  duration?: number;
}

interface ToolCallTimelineProps {
  events: WorkflowStreamEvent[];
  maxItems?: number;
  className?: string;
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

// Tool display names
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
  task: "Agent",
};

/**
 * Extract tool history from workflow events
 *
 * Uses callId to correlate tool_call events with their tool_result events.
 * This is critical when multiple tools of the same type are called concurrently.
 */
export function extractToolHistory(events: WorkflowStreamEvent[]): ToolHistoryItem[] {
  const history: ToolHistoryItem[] = [];
  // Map by callId (or event.id as fallback) to properly match calls with results
  const pendingCalls = new Map<string, ToolHistoryItem>();

  for (const event of events) {
    if (event.type === "tool_call" && event.data.toolName) {
      // Use callId if available, otherwise fall back to event.id
      const callId = event.data.callId || event.id;
      const item: ToolHistoryItem = {
        id: callId,
        toolName: event.data.toolName,
        toolInput: event.data.toolInput,
        status: "running",
        startTime: new Date(event.timestamp),
      };
      pendingCalls.set(callId, item);
      history.push(item);
    } else if (event.type === "tool_result") {
      // Look up by callId to find the matching tool call
      const callId = event.data.callId;
      if (callId) {
        const pending = pendingCalls.get(callId);
        if (pending) {
          pending.toolOutput = event.data.toolOutput || event.data.result;
          pending.status = event.data.error || event.data.isError ? "error" : "success";
          pending.endTime = new Date(event.timestamp);
          pending.duration = pending.endTime.getTime() - pending.startTime.getTime();
          pendingCalls.delete(callId);
        } else if (event.data.toolName) {
          // Result without matching call - add it anyway
          history.push({
            id: callId,
            toolName: event.data.toolName,
            toolOutput: event.data.toolOutput || event.data.result,
            status: event.data.error || event.data.isError ? "error" : "success",
            startTime: new Date(event.timestamp),
          });
        }
      } else if (event.data.toolName) {
        // Legacy: no callId, try to match by toolName (less reliable)
        const pending = pendingCalls.get(event.data.toolName);
        if (pending) {
          pending.toolOutput = event.data.toolOutput || event.data.result;
          pending.status = event.data.error || event.data.isError ? "error" : "success";
          pending.endTime = new Date(event.timestamp);
          pending.duration = pending.endTime.getTime() - pending.startTime.getTime();
          pendingCalls.delete(event.data.toolName);
        }
      }
    } else if (event.type === "part" && event.data.type === "dynamic-tool") {
      // AI SDK format: "part" events with "dynamic-tool" type
      const toolCallId = event.data.toolCallId as string | undefined;
      const toolName = event.data.toolName as string | undefined;
      const state = event.data.state as string | undefined;

      if (state === "input-available" && toolName) {
        // New tool call
        const id = toolCallId || event.id;
        const item: ToolHistoryItem = {
          id,
          toolName,
          toolInput: event.data.input,
          status: "running",
          startTime: new Date(event.timestamp),
        };
        pendingCalls.set(id, item);
        history.push(item);
      } else if ((state === "output-available" || state === "output-error") && toolCallId) {
        // Tool result
        const pending = pendingCalls.get(toolCallId);
        if (pending) {
          const output = event.data.output || event.data.errorText;
          pending.toolOutput = typeof output === "string" ? output : JSON.stringify(output);
          pending.status = state === "output-error" ? "error" : "success";
          pending.endTime = new Date(event.timestamp);
          pending.duration = pending.endTime.getTime() - pending.startTime.getTime();
          pendingCalls.delete(toolCallId);
        } else if (toolName) {
          // Result without matching call - add it anyway
          const output = event.data.output || event.data.errorText;
          history.push({
            id: toolCallId,
            toolName,
            toolOutput: typeof output === "string" ? output : JSON.stringify(output),
            status: state === "output-error" ? "error" : "success",
            startTime: new Date(event.timestamp),
          });
        }
      }
    }
  }

  return history;
}

/**
 * Get file path from tool input
 */
function extractFilePath(toolInput: unknown): string | null {
  if (!toolInput || typeof toolInput !== "object") return null;
  const input = toolInput as Record<string, unknown>;
  return (
    (input.path as string) ||
    (input.file_path as string) ||
    (input.filePath as string) ||
    (input.file as string) ||
    (input.filename as string) ||
    null
  );
}

export const ToolCallTimeline = memo(function ToolCallTimeline({
  events,
  maxItems = 20,
  className,
}: ToolCallTimelineProps) {
  const toolHistory = useMemo(() => {
    const history = extractToolHistory(events);
    // Return most recent items first
    return history.slice(-maxItems).reverse();
  }, [events, maxItems]);

  if (toolHistory.length === 0) {
    return (
      <div className={cn("p-4", className)}>
        <div className="text-xs text-zinc-500 mb-3 font-medium uppercase tracking-wide">
          Tool History
        </div>
        <p className="text-xs text-zinc-600 italic">No tools executed yet</p>
      </div>
    );
  }

  return (
    <div className={cn("p-4", className)}>
      <div className="text-xs text-zinc-500 mb-3 font-medium uppercase tracking-wide">
        Tool History
      </div>

      <div className="space-y-1">
        {toolHistory.map((item, index) => (
          <ToolTimelineItem key={item.id} item={item} isLast={index === 0} />
        ))}
      </div>
    </div>
  );
});

interface ToolTimelineItemProps {
  item: ToolHistoryItem;
  isLast: boolean;
}

const ToolTimelineItem = memo(function ToolTimelineItem({
  item,
  isLast,
}: ToolTimelineItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const normalizedName = item.toolName.toLowerCase();
  const ToolIcon = TOOL_ICONS[normalizedName] || FileIcon;
  const toolLabel = TOOL_LABELS[normalizedName] || item.toolName;
  const filePath = extractFilePath(item.toolInput);

  // Format duration
  const durationText = item.duration !== undefined
    ? item.duration < 1000
      ? `${item.duration}ms`
      : `${(item.duration / 1000).toFixed(1)}s`
    : null;

  return (
    <div className="group">
      {/* Main Row */}
      <div
        className={cn(
          "flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer transition-colors",
          "hover:bg-zinc-800/50"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Status Icon */}
        <div className="flex-shrink-0">
          {item.status === "running" ? (
            <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
          ) : item.status === "success" ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
          ) : (
            <XCircle className="w-3.5 h-3.5 text-red-400" />
          )}
        </div>

        {/* Tool Info */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <ToolIcon className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
          <span className="text-xs font-medium text-zinc-300">{toolLabel}</span>
          {filePath && (
            <span className="text-xs text-zinc-500 truncate" title={filePath}>
              {filePath.split("/").pop()}
            </span>
          )}
        </div>

        {/* Duration Badge */}
        {durationText && (
          <span className="text-xs text-zinc-500 tabular-nums flex-shrink-0">
            {durationText}
          </span>
        )}

        {/* Expand Icon */}
        {(item.toolInput || item.toolOutput) && (
          <div className="flex-shrink-0 text-zinc-500">
            {isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="ml-6 mr-2 mb-2 space-y-2">
          {Boolean(item.toolInput) && (
            <div className="bg-zinc-900 rounded p-2 border border-zinc-800">
              <div className="text-xs text-zinc-500 mb-1">Input</div>
              <pre className="text-xs font-mono text-zinc-400 whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                {formatInput(item.toolInput)}
              </pre>
            </div>
          )}

          {item.toolOutput && (
            <div
              className={cn(
                "rounded p-2 border",
                item.status === "error"
                  ? "bg-red-950/20 border-red-500/30"
                  : "bg-zinc-900 border-zinc-800"
              )}
            >
              <div className="text-xs text-zinc-500 mb-1">Output</div>
              <pre
                className={cn(
                  "text-xs font-mono whitespace-pre-wrap break-all max-h-24 overflow-y-auto",
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
  );
});

/**
 * Format tool input for display
 */
function formatInput(input: unknown): string {
  if (!input) return "";

  const obj = input as Record<string, unknown>;

  // For file operations, show the path prominently
  const path = obj.path || obj.file_path || obj.filePath || obj.file;
  if (path) {
    const lines: string[] = [`path: ${path}`];

    // Add other relevant fields
    if (obj.command) lines.push(`command: ${obj.command}`);
    if (obj.pattern) lines.push(`pattern: ${obj.pattern}`);
    if (obj.query) lines.push(`query: ${obj.query}`);

    return lines.join("\n");
  }

  // For shell commands
  if (obj.command) {
    return typeof obj.command === "string"
      ? obj.command
      : JSON.stringify(obj.command);
  }

  // Generic JSON display
  try {
    const str = JSON.stringify(input, null, 2);
    return str.length > 300 ? str.slice(0, 300) + "..." : str;
  } catch {
    return String(input);
  }
}

/**
 * Truncate output for display
 */
function truncateOutput(output: string, maxLength = 500): string {
  if (output.length <= maxLength) return output;
  return output.slice(0, maxLength) + "\n... (truncated)";
}

/**
 * Compact timeline for sidebar display
 */
export const ToolCallTimelineCompact = memo(function ToolCallTimelineCompact({
  events,
  maxItems = 5,
  className,
}: ToolCallTimelineProps) {
  const toolHistory = useMemo(() => {
    const history = extractToolHistory(events);
    return history.slice(-maxItems).reverse();
  }, [events, maxItems]);

  if (toolHistory.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-1", className)}>
      {toolHistory.map((item) => {
        const normalizedName = item.toolName.toLowerCase();
        const toolLabel = TOOL_LABELS[normalizedName] || item.toolName;
        const filePath = extractFilePath(item.toolInput);
        const durationText = item.duration !== undefined
          ? `${(item.duration / 1000).toFixed(1)}s`
          : "...";

        return (
          <div key={item.id} className="flex items-center gap-2 text-xs">
            {/* Status */}
            <span
              className={cn(
                "flex-shrink-0",
                item.status === "success"
                  ? "text-green-400"
                  : item.status === "error"
                  ? "text-red-400"
                  : "text-blue-400"
              )}
            >
              {item.status === "success" ? "✓" : item.status === "error" ? "✗" : "◐"}
            </span>

            {/* Tool + Path */}
            <span className="text-zinc-300">{toolLabel}</span>
            {filePath && (
              <span className="text-zinc-500 truncate flex-1" title={filePath}>
                {filePath.split("/").pop()}
              </span>
            )}

            {/* Duration */}
            <span className="text-zinc-600 tabular-nums flex-shrink-0">
              {durationText}
            </span>
          </div>
        );
      })}
    </div>
  );
});
