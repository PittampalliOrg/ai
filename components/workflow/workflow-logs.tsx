"use client";

/**
 * Workflow Logs Component
 *
 * Renders stream events as log entries with:
 * - Agent badges and color coding
 * - Tool call/result styling
 * - Progress updates
 * - Auto-scroll with toggle
 * - Event filtering
 */

import { memo, useRef, useEffect, useState, useMemo } from "react";
import type { WorkflowLogEntry } from "@/hooks/use-stream-derived-state";
import type { AgentId } from "@/hooks/use-workflow-stream";
import { AgentBadge, AgentDot, getAgentColor } from "./agent-badge";
import { ToolCallCard } from "./tool-call-card";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";

interface WorkflowLogsProps {
  logs: WorkflowLogEntry[];
  isConnected?: boolean;
  className?: string;
}

type FilterType = "all" | "llm" | "tools" | "progress" | "errors";

export const WorkflowLogs = memo(function WorkflowLogs({
  logs,
  isConnected = false,
  className,
}: WorkflowLogsProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const prevLogsLengthRef = useRef(0);

  // Filter logs
  const filteredLogs = useMemo(() => {
    if (filter === "all") return logs;
    return logs.filter((log) => {
      switch (filter) {
        case "llm":
          return log.type === "llm";
        case "tools":
          return log.type === "tool_call" || log.type === "tool_result";
        case "progress":
          return log.type === "progress";
        case "errors":
          return log.type === "error" || log.status === "error";
        default:
          return true;
      }
    });
  }, [logs, filter]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logs.length > prevLogsLengthRef.current) {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    }
    prevLogsLengthRef.current = logs.length;
  }, [logs.length, autoScroll]);

  // Detect manual scroll to disable auto-scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      setAutoScroll(isNearBottom);
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  if (logs.length === 0) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center p-8 text-zinc-500",
          className
        )}
      >
        <p className="text-center">
          No execution logs yet.
          <br />
          <span className="text-sm">
            Logs will appear here as the workflow executes.
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header with filter and status */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-zinc-300">Logs</span>
          <FilterTabs filter={filter} onFilterChange={setFilter} />
        </div>
        <div className="flex items-center gap-3">
          <ConnectionStatus isConnected={isConnected} />
          <span className="text-xs text-zinc-500">{filteredLogs.length}</span>
        </div>
      </div>

      {/* Logs container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 space-y-3"
      >
        {filteredLogs.map((log, index) => (
          <LogEntryComponent key={`${log.id}-${index}`} log={log} />
        ))}

        {/* Auto-scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* Auto-scroll toggle */}
      {!autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true);
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
          }}
          className="absolute bottom-4 right-4 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 rounded-full shadow-lg transition-colors"
        >
          Resume auto-scroll
        </button>
      )}
    </div>
  );
});

// ============================================================================
// Sub-components
// ============================================================================

const FilterTabs = memo(function FilterTabs({
  filter,
  onFilterChange,
}: {
  filter: FilterType;
  onFilterChange: (filter: FilterType) => void;
}) {
  const tabs: { value: FilterType; label: string }[] = [
    { value: "all", label: "All" },
    { value: "llm", label: "LLM" },
    { value: "tools", label: "Tools" },
    { value: "errors", label: "Errors" },
  ];

  return (
    <div className="flex items-center gap-1">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onFilterChange(tab.value)}
          className={cn(
            "px-2 py-0.5 text-xs rounded transition-colors",
            filter === tab.value
              ? "bg-zinc-700 text-zinc-200"
              : "text-zinc-500 hover:text-zinc-400"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
});

const ConnectionStatus = memo(function ConnectionStatus({
  isConnected,
}: {
  isConnected: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5 text-xs">
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
  );
});

const LogEntryComponent = memo(function LogEntryComponent({
  log,
}: {
  log: WorkflowLogEntry;
}) {
  const timestamp = log.timestamp.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  switch (log.type) {
    case "llm":
      return <LLMLogEntry log={log} timestamp={timestamp} />;
    case "tool_call":
      return <ToolCallLogEntry log={log} timestamp={timestamp} />;
    case "tool_result":
      return <ToolResultLogEntry log={log} timestamp={timestamp} />;
    case "progress":
      return <ProgressLogEntry log={log} timestamp={timestamp} />;
    case "error":
      return <ErrorLogEntry log={log} timestamp={timestamp} />;
    default:
      return null;
  }
});

const LLMLogEntry = memo(function LLMLogEntry({
  log,
  timestamp,
}: {
  log: WorkflowLogEntry;
  timestamp: string;
}) {
  // Truncate long LLM responses for log view
  const content =
    log.content.length > 500
      ? log.content.slice(0, 500) + "..."
      : log.content;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <span className="font-mono">{timestamp}</span>
        <AgentBadge agentId={log.agentId} size="sm" />
      </div>
      <div
        className={cn(
          "pl-4 prose prose-sm dark:prose-invert max-w-none",
          "prose-code:bg-zinc-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs",
          "prose-code:before:content-none prose-code:after:content-none"
        )}
      >
        <Markdown>{content}</Markdown>
      </div>
    </div>
  );
});

const ToolCallLogEntry = memo(function ToolCallLogEntry({
  log,
  timestamp,
}: {
  log: WorkflowLogEntry;
  timestamp: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <span className="font-mono">{timestamp}</span>
        <AgentDot agentId={log.agentId} size="sm" />
        <span className="text-blue-400">[{log.toolName}]</span>
        <span
          className={cn(
            "flex items-center gap-1",
            log.status === "running" && "text-blue-400"
          )}
        >
          {log.status === "running" && (
            <span className="w-1 h-1 rounded-full bg-blue-400 animate-pulse" />
          )}
          {log.status === "running" ? "Running" : ""}
        </span>
      </div>
      <div className="pl-4">
        <pre className="text-xs font-mono text-zinc-400 whitespace-pre-wrap break-all">
          {log.content}
        </pre>
      </div>
    </div>
  );
});

const ToolResultLogEntry = memo(function ToolResultLogEntry({
  log,
  timestamp,
}: {
  log: WorkflowLogEntry;
  timestamp: string;
}) {
  const isError = log.status === "error";

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <span className="font-mono">{timestamp}</span>
        <AgentDot agentId={log.agentId} size="sm" />
        <span className={isError ? "text-red-400" : "text-green-400"}>
          [{log.toolName}]
        </span>
        <span className={cn("flex items-center gap-1", isError ? "text-red-400" : "text-green-400")}>
          <span
            className={cn(
              "w-1 h-1 rounded-full",
              isError ? "bg-red-400" : "bg-green-400"
            )}
          />
          {isError ? "Error" : "Done"}
        </span>
      </div>
      {log.content && log.content !== "Completed" && (
        <div className="pl-4">
          <pre
            className={cn(
              "text-xs font-mono whitespace-pre-wrap break-all max-h-24 overflow-y-auto",
              isError ? "text-red-300" : "text-zinc-500"
            )}
          >
            {log.content.length > 500
              ? log.content.slice(0, 500) + "... (truncated)"
              : log.content}
          </pre>
        </div>
      )}
    </div>
  );
});

const ProgressLogEntry = memo(function ProgressLogEntry({
  log,
  timestamp,
}: {
  log: WorkflowLogEntry;
  timestamp: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="font-mono text-zinc-500">{timestamp}</span>
      <span className="text-yellow-400">Progress</span>
      <span className="text-zinc-300">{log.content}</span>
      {log.progress !== undefined && (
        <span className="text-zinc-500">{log.progress}%</span>
      )}
    </div>
  );
});

const ErrorLogEntry = memo(function ErrorLogEntry({
  log,
  timestamp,
}: {
  log: WorkflowLogEntry;
  timestamp: string;
}) {
  return (
    <div className="rounded-lg border border-red-500/50 bg-red-950/20 p-3">
      <div className="flex items-center gap-2 text-xs text-red-400 mb-2">
        <span className="font-mono">{timestamp}</span>
        <span className="font-medium">Error</span>
      </div>
      <pre className="text-xs font-mono text-red-300 whitespace-pre-wrap break-all">
        {log.content}
      </pre>
    </div>
  );
});
