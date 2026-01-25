"use client";

/**
 * Tool Call Card Component
 *
 * Shows current tool execution with:
 * - Tool name and icon
 * - Running/completed status animation
 * - Input preview (truncated JSON)
 */

import { memo, useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDownIcon, ChevronUpIcon } from "@/components/icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface ToolCallCardProps {
  toolName: string;
  toolInput?: unknown;
  status?: "running" | "success" | "error";
  output?: string;
  className?: string;
}

// Tool icons mapping
const TOOL_ICONS: Record<string, string> = {
  shell: "terminal",
  grep: "search",
  edit: "pencil",
  write: "file-plus",
  create: "file-plus",
  str_replace_based_edit_tool: "pencil",
  read: "file",
  glob: "folder-search",
};

// Tool display names
const TOOL_LABELS: Record<string, string> = {
  shell: "Shell",
  grep: "Search",
  edit: "Edit",
  write: "Write",
  create: "Create",
  str_replace_based_edit_tool: "Edit",
  read: "Read",
  glob: "Find Files",
};

export const ToolCallCard = memo(function ToolCallCard({
  toolName,
  toolInput,
  status = "running",
  output,
  className,
}: ToolCallCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const icon = TOOL_ICONS[toolName] || "tool";
  const label = TOOL_LABELS[toolName] || toolName;

  // Format tool input for display
  const inputPreview = formatToolInput(toolName, toolInput);

  return (
    <div
      className={cn(
        "rounded-lg border overflow-hidden",
        status === "error"
          ? "border-red-500/50 bg-red-950/20"
          : status === "success"
          ? "border-green-500/30 bg-zinc-900/50"
          : "border-zinc-700 bg-zinc-900/50",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-900">
        <div className="flex items-center gap-2">
          <ToolIcon name={icon} className="w-4 h-4 text-zinc-400" />
          <span className="text-xs font-medium text-zinc-300">{label}</span>
        </div>
        <StatusIndicator status={status} />
      </div>

      {/* Input preview */}
      {inputPreview && (
        <div className="px-3 py-2 border-t border-zinc-800">
          <pre className="text-xs font-mono text-zinc-400 whitespace-pre-wrap break-all">
            {inputPreview}
          </pre>
        </div>
      )}

      {/* Output (collapsible if present) */}
      {output && (
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-400 border-t border-zinc-800 bg-zinc-950/50">
              <span>Output</span>
              {isExpanded ? (
                <ChevronUpIcon size={12} />
              ) : (
                <ChevronDownIcon size={12} />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-3 py-2 bg-zinc-950">
              <pre
                className={cn(
                  "text-xs font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto",
                  status === "error" ? "text-red-300" : "text-zinc-400"
                )}
              >
                {truncateOutput(output)}
              </pre>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
});

/**
 * Compact tool call indicator (for inline display)
 */
export const ToolCallIndicator = memo(function ToolCallIndicator({
  toolName,
  status = "running",
  className,
}: {
  toolName: string;
  status?: "running" | "success" | "error";
  className?: string;
}) {
  const label = TOOL_LABELS[toolName] || toolName;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium",
        status === "error"
          ? "bg-red-500/20 text-red-400"
          : status === "success"
          ? "bg-green-500/20 text-green-400"
          : "bg-zinc-800 text-zinc-400",
        className
      )}
    >
      <StatusDot status={status} size="sm" />
      {label}
    </span>
  );
});

// ============================================================================
// Helper Components
// ============================================================================

function StatusIndicator({ status }: { status: "running" | "success" | "error" }) {
  return (
    <div className="flex items-center gap-1.5">
      <StatusDot status={status} />
      <span
        className={cn(
          "text-xs",
          status === "error"
            ? "text-red-400"
            : status === "success"
            ? "text-green-400"
            : "text-blue-400"
        )}
      >
        {status === "running" ? "Running" : status === "success" ? "Done" : "Error"}
      </span>
    </div>
  );
}

function StatusDot({
  status,
  size = "md",
}: {
  status: "running" | "success" | "error";
  size?: "sm" | "md";
}) {
  const sizeClass = size === "sm" ? "w-1 h-1" : "w-1.5 h-1.5";

  return (
    <span
      className={cn(
        "rounded-full",
        sizeClass,
        status === "error"
          ? "bg-red-400"
          : status === "success"
          ? "bg-green-400"
          : "bg-blue-400 animate-pulse"
      )}
    />
  );
}

function ToolIcon({ name, className }: { name: string; className?: string }) {
  // Simple icon mapping using emoji/unicode for now
  const iconMap: Record<string, string> = {
    terminal: "$",
    search: "?",
    pencil: "/",
    "file-plus": "+",
    file: "#",
    "folder-search": "*",
    tool: ">",
  };

  return (
    <span className={cn("font-mono", className)}>{iconMap[name] || ">"}</span>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatToolInput(toolName: string, toolInput: unknown): string {
  if (!toolInput) return "";

  const input = toolInput as Record<string, unknown>;

  switch (toolName) {
    case "shell":
      const cmd = input.command;
      return Array.isArray(cmd) ? cmd.join(" ") : String(cmd || "");

    case "grep":
      return `Pattern: "${input.query || ""}" in ${input.path || "."}`;

    case "str_replace_based_edit_tool":
    case "edit":
    case "write":
    case "create":
      const filePath =
        input.path || input.file_path || input.file || input.filename || "";
      return String(filePath);

    default:
      // Try to stringify, but truncate
      try {
        const str = JSON.stringify(input, null, 2);
        return str.length > 200 ? str.slice(0, 200) + "..." : str;
      } catch {
        return "";
      }
  }
}

function truncateOutput(output: string, maxLength = 1000): string {
  if (output.length <= maxLength) return output;
  return output.slice(0, maxLength) + "\n... (truncated)";
}
