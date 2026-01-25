"use client";

import { useMemo, useState, useEffect, useRef, memo } from "react";
import type { LogEntry } from "@/hooks/use-agent-execution";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";
import { UserIcon, ChevronDownIcon, ChevronUpIcon } from "@/components/icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface LogsViewProps {
  logs: LogEntry[];
}

export const LogsView = memo(function LogsView({ logs }: LogsViewProps) {
  const [setupExpanded, setSetupExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevLogsLengthRef = useRef(0);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    // Only scroll if logs actually increased (new logs added)
    if (logs.length > prevLogsLengthRef.current) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      });
    }
    prevLogsLengthRef.current = logs.length;
  }, [logs.length]);

  // Separate setup logs from execution logs
  const { setupLogs, executionLogs } = useMemo(() => {
    const setup: LogEntry[] = [];
    const execution: LogEntry[] = [];

    for (const log of logs) {
      switch (log.type) {
        case "setup":
          setup.push(log);
          break;
        case "setup-divider":
          // Skip dividers in display
          break;
        default:
          execution.push(log);
          break;
      }
    }

    return { setupLogs: setup, executionLogs: execution };
  }, [logs]);

  if (logs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-muted-foreground">
        <p className="text-center">
          No execution logs yet.
          <br />
          <span className="text-sm">Logs will appear here as the agent works.</span>
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Setup/Environment Logs Section */}
      {setupLogs.length > 0 && (
        <Collapsible open={setupExpanded} onOpenChange={setSetupExpanded}>
          <CollapsibleTrigger asChild>
            <button className="flex w-full items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-2 border-b border-dashed border-zinc-700">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Environment Setup
              </span>
              <span className="text-zinc-500">({setupLogs.length} steps)</span>
              {setupExpanded ? (
                <ChevronUpIcon size={12} />
              ) : (
                <ChevronDownIcon size={12} />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-3 space-y-2 pl-3 border-l-2 border-zinc-800">
              {setupLogs.map((log) => (
                <SetupLogEntry key={log.id} log={log} />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Divider between setup and execution */}
      {setupLogs.length > 0 && executionLogs.length > 0 && (
        <div className="flex items-center gap-3 py-2">
          <div className="flex-1 border-t border-zinc-700" />
          <span className="text-xs text-zinc-500 font-medium">Task Execution</span>
          <div className="flex-1 border-t border-zinc-700" />
        </div>
      )}

      {/* Execution Logs */}
      {executionLogs.map((log) => (
        <LogEntryComponent key={log.id} log={log} />
      ))}

      {/* Scroll anchor for auto-scroll */}
      <div ref={bottomRef} />
    </div>
  );
});

const SetupLogEntry = memo(function SetupLogEntry({ log }: { log: LogEntry }) {
  const [isLogsExpanded, setIsLogsExpanded] = useState(false);

  const getPhaseIcon = () => {
    switch (log.setupPhase) {
      case "provisioning":
        return "🔧";
      case "init":
        return "📋";
      case "cloning":
        return "📦";
      case "ready":
        return "✓";
      default:
        return "•";
    }
  };

  const getStatusColor = () => {
    switch (log.status) {
      case "success":
        return "text-green-400";
      case "error":
        return "text-red-400";
      case "running":
        return "text-blue-400";
      default:
        return "text-zinc-400";
    }
  };

  // For init phase with logs, show expandable section
  if (log.setupPhase === "init" && log.setupLogs) {
    const logLines = log.setupLogs.split("\n").filter(Boolean);
    const lineCount = logLines.length;

    return (
      <div className="text-xs">
        <button
          type="button"
          onClick={() => setIsLogsExpanded(!isLogsExpanded)}
          className="flex items-center gap-2 w-full text-left hover:bg-zinc-800/50 rounded px-1 py-0.5 transition-colors"
        >
          <span className={cn("flex-shrink-0", getStatusColor())}>
            {getPhaseIcon()}
          </span>
          <span className="text-zinc-300 flex-1">
            {log.content} ({lineCount} lines)
          </span>
          <span className="text-zinc-500">
            {isLogsExpanded ? "▼" : "▶"}
          </span>
        </button>
        {isLogsExpanded && (
          <pre className="mt-2 ml-5 p-2 bg-zinc-900 rounded border border-zinc-800 text-zinc-400 font-mono text-[10px] whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
            {log.setupLogs}
          </pre>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 text-xs">
      <span className={cn("flex-shrink-0", getStatusColor())}>
        {getPhaseIcon()}
      </span>
      <div className="flex-1 min-w-0">
        <span className="text-zinc-300">{log.content}</span>
        {log.output && (
          <pre className="mt-1 text-zinc-500 font-mono text-[10px] whitespace-pre-wrap break-all max-h-20 overflow-y-auto">
            {log.output}
          </pre>
        )}
      </div>
      {log.status === "running" && (
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse flex-shrink-0 mt-1" />
      )}
    </div>
  );
});

const LogEntryComponent = memo(function LogEntryComponent({ log }: { log: LogEntry }) {
  switch (log.type) {
    case "user-message":
      return <UserMessageLog log={log} />;
    case "reasoning":
      return <ReasoningLog log={log} />;
    case "shell":
    case "grep":
      return <ShellLog log={log} />;
    case "file-edit":
      return <FileEditLog log={log} />;
    default:
      return null;
  }
});

const UserMessageLog = memo(function UserMessageLog({ log }: { log: LogEntry }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
        <UserIcon />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground mb-1 font-medium">You</div>
        <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 p-3">
          <p className="text-sm text-foreground">{log.content}</p>
        </div>
      </div>
    </div>
  );
});

const ReasoningLog = memo(function ReasoningLog({ log }: { log: LogEntry }) {
  // Process the content to highlight inline code patterns
  const processedContent = useMemo(() => {
    // The Markdown component handles backticks, but we can add visual improvements
    // by ensuring consistent styling through prose classes
    return log.content;
  }, [log.content]);

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none prose-code:bg-zinc-100 prose-code:dark:bg-zinc-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono prose-code:before:content-none prose-code:after:content-none">
      <Markdown>{processedContent}</Markdown>
    </div>
  );
});

const ShellLog = memo(function ShellLog({ log }: { log: LogEntry }) {
  const isError = log.status === "error";
  const isRunning = log.status === "running";

  return (
    <div className="rounded-lg overflow-hidden border border-zinc-800">
      {/* Shell header */}
      <div className="flex items-center justify-between bg-zinc-900 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
            shell
          </span>
          {log.type === "grep" && (
            <span className="text-xs text-zinc-500">search</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <span className="text-xs text-blue-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
              Running
            </span>
          )}
          {log.status === "success" && (
            <span className="text-xs text-green-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
              Done
            </span>
          )}
          {isError && (
            <span className="text-xs text-red-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-red-400 rounded-full" />
              Error{log.exitCode !== undefined ? ` (${log.exitCode})` : ""}
            </span>
          )}
        </div>
      </div>

      {/* Command */}
      <div className="bg-zinc-950 px-3 py-2 border-b border-zinc-800">
        <pre className="text-sm font-mono text-zinc-300 overflow-x-auto whitespace-pre-wrap">
          <span className="text-blue-400 select-none">{log.workdir || "/workspace"}</span>
          <span className="text-green-500 select-none">$ </span>
          {log.command}
        </pre>
      </div>

      {/* Output */}
      {log.output && (
        <div
          className={cn(
            "px-3 py-2 max-h-64 overflow-y-auto",
            isError ? "bg-red-950/30" : "bg-zinc-900/50"
          )}
        >
          <pre
            className={cn(
              "text-xs font-mono whitespace-pre-wrap break-all",
              isError ? "text-red-300" : "text-zinc-400"
            )}
          >
            {truncateOutput(log.output)}
          </pre>
        </div>
      )}
    </div>
  );
});

const FileEditLog = memo(function FileEditLog({ log }: { log: LogEntry }) {
  const isError = log.status === "error";
  const isRunning = log.status === "running";

  // Extract file path from log content
  const filePath = log.filePath || log.content.split(" ").pop() || "";
  const fileName = filePath.split("/").pop() || filePath;

  return (
    <div className="rounded-lg overflow-hidden border border-zinc-800">
      <div className="flex items-center justify-between bg-zinc-900 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
            edit
          </span>
          <span className="text-xs font-mono text-zinc-300" title={filePath}>
            {fileName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && (
            <span className="text-xs text-blue-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
              Editing
            </span>
          )}
          {log.status === "success" && (
            <span className="text-xs text-green-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
              Saved
            </span>
          )}
          {isError && (
            <span className="text-xs text-red-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-red-400 rounded-full" />
              Failed
            </span>
          )}
        </div>
      </div>

      {log.output && (
        <div className="px-3 py-2 bg-zinc-950 border-t border-zinc-800">
          <pre className="text-xs font-mono text-zinc-400 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
            {truncateOutput(log.output, 500)}
          </pre>
        </div>
      )}
    </div>
  );
});

function truncateOutput(output: string, maxLength = 2000): string {
  if (output.length <= maxLength) return output;
  return output.slice(0, maxLength) + "\n... (truncated)";
}
