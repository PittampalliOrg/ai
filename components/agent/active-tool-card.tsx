"use client";

/**
 * Active Tool Card Component
 *
 * Shows the currently executing tool with:
 * - Tool icon + name
 * - File path being operated on
 * - Running/Success/Error status indicator
 */

import { memo, useMemo } from "react";
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
} from "lucide-react";

export interface ToolCallData {
  toolName: string;
  toolInput?: unknown;
  status?: "running" | "success" | "error";
  duration?: number;
  output?: string;
}

interface ActiveToolCardProps {
  toolCall: ToolCallData;
  className?: string;
}

// Tool icon mapping
const TOOL_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
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

// Tool display name mapping
const TOOL_LABEL_MAP: Record<string, string> = {
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
 * Extract file path from tool input
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
    (input.notebook_path as string) ||
    null
  );
}

/**
 * Extract command from shell tool input
 */
function extractCommand(toolInput: unknown): string | null {
  if (!toolInput || typeof toolInput !== "object") return null;
  const input = toolInput as Record<string, unknown>;
  const cmd = input.command;
  if (Array.isArray(cmd)) return cmd.join(" ");
  if (typeof cmd === "string") return cmd;
  return null;
}

/**
 * Get tool icon component
 */
function getToolIcon(toolName: string): React.ComponentType<{ className?: string }> {
  const normalizedName = toolName.toLowerCase();
  return TOOL_ICON_MAP[normalizedName] || FileIcon;
}

/**
 * Get tool display label
 */
function getToolLabel(toolName: string): string {
  const normalizedName = toolName.toLowerCase();
  return TOOL_LABEL_MAP[normalizedName] || toolName;
}

export const ActiveToolCard = memo(function ActiveToolCard({
  toolCall,
  className,
}: ActiveToolCardProps) {
  const { toolName, toolInput, status = "running", duration } = toolCall;

  const ToolIcon = useMemo(() => getToolIcon(toolName), [toolName]);
  const toolLabel = useMemo(() => getToolLabel(toolName), [toolName]);

  // Get file path or command based on tool type
  const displayInfo = useMemo(() => {
    const filePath = extractFilePath(toolInput);
    if (filePath) return filePath;

    const command = extractCommand(toolInput);
    if (command) {
      // Truncate long commands
      return command.length > 50 ? command.slice(0, 50) + "..." : command;
    }

    return null;
  }, [toolInput]);

  return (
    <div
      className={cn(
        "rounded-lg border overflow-hidden",
        status === "error"
          ? "border-red-500/50 bg-red-950/20"
          : status === "success"
          ? "border-green-500/30 bg-green-950/20"
          : "border-blue-500/30 bg-blue-950/20",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <ToolIcon
            className={cn(
              "w-4 h-4",
              status === "error"
                ? "text-red-400"
                : status === "success"
                ? "text-green-400"
                : "text-blue-400"
            )}
          />
          <span className="text-sm font-medium text-zinc-200">{toolLabel}</span>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-1.5">
          {status === "running" && (
            <>
              <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
              <span className="text-xs text-blue-400">Running</span>
            </>
          )}
          {status === "success" && (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
              <span className="text-xs text-green-400">Done</span>
            </>
          )}
          {status === "error" && (
            <>
              <XCircle className="w-3.5 h-3.5 text-red-400" />
              <span className="text-xs text-red-400">Error</span>
            </>
          )}

          {duration !== undefined && (
            <span className="text-xs text-zinc-500 ml-1">
              {(duration / 1000).toFixed(1)}s
            </span>
          )}
        </div>
      </div>

      {/* File Path / Command */}
      {displayInfo && (
        <div className="px-3 py-2 border-t border-zinc-800">
          <p className="text-xs font-mono text-zinc-400 truncate" title={displayInfo}>
            {displayInfo}
          </p>
        </div>
      )}
    </div>
  );
});

/**
 * Minimal tool indicator for compact display
 */
export const ActiveToolIndicator = memo(function ActiveToolIndicator({
  toolCall,
  className,
}: ActiveToolCardProps) {
  const { toolName, status = "running" } = toolCall;
  const ToolIcon = useMemo(() => getToolIcon(toolName), [toolName]);
  const toolLabel = useMemo(() => getToolLabel(toolName), [toolName]);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium",
        status === "error"
          ? "bg-red-500/20 text-red-400"
          : status === "success"
          ? "bg-green-500/20 text-green-400"
          : "bg-blue-500/20 text-blue-400",
        className
      )}
    >
      {status === "running" ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <ToolIcon className="w-3 h-3" />
      )}
      {toolLabel}
    </span>
  );
});
