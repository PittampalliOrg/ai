"use client";

import type { UIMessage } from "ai";
import { cn } from "@/lib/utils";
import { TerminalIcon } from "@/components/icons";
import { Markdown } from "@/components/markdown";

interface AgentMessageProps {
  message: UIMessage;
}

interface MessagePart {
  type: string;
  text?: string;
  toolName?: string;
  toolCallId?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  state?: string;
}

export function AgentMessage({ message }: AgentMessageProps) {
  const isUser = message.role === "user";
  const parts = (message.parts || []) as MessagePart[];

  return (
    <div
      className={cn(
        "flex gap-3 p-4 rounded-lg",
        isUser ? "bg-muted" : "bg-background"
      )}
    >
      <div className="flex-shrink-0">
        {isUser ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <span className="text-sm font-medium">U</span>
          </div>
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <span className="text-sm font-medium">A</span>
          </div>
        )}
      </div>

      <div className="flex-1 space-y-2 overflow-hidden">
        {parts.length > 0 ? (
          parts.map((part, index) => (
            <MessagePartRenderer key={index} part={part} />
          ))
        ) : null}
      </div>
    </div>
  );
}

function MessagePartRenderer({ part }: { part: MessagePart }) {
  switch (part.type) {
    case "text":
      return (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <Markdown>{part.text || ""}</Markdown>
        </div>
      );

    case "tool-invocation":
      return <ToolInvocation part={part} />;

    case "tool-result":
      return <ToolResult part={part} />;

    default:
      return null;
  }
}

function ToolInvocation({ part }: { part: MessagePart }) {
  const { toolName, args, state } = part;
  const isComplete = state === "result";
  const isRunning = state === "call" || state === "partial-call";

  // Format tool name for display
  const displayName = formatToolName(toolName || "");

  // Format command for shell tool
  let commandPreview = "";
  if (toolName === "shell" && args?.command) {
    commandPreview = Array.isArray(args.command)
      ? args.command.join(" ")
      : String(args.command);
  } else if (toolName === "grep" && args?.query) {
    commandPreview = `grep "${args.query}"`;
  } else if (toolName === "str_replace_based_edit_tool" && args?.path) {
    commandPreview = `${args.command || "edit"} ${args.path}`;
  }

  return (
    <div className="rounded-md border bg-muted/50 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <TerminalIcon size={14} />
        <span>{displayName}</span>
        {isComplete ? (
          <span className="text-green-600">✓</span>
        ) : isRunning ? (
          <span className="text-xs text-muted-foreground">Running...</span>
        ) : null}
      </div>

      {commandPreview && (
        <pre className="text-xs bg-black/80 text-green-400 p-2 rounded overflow-x-auto">
          <code>$ {commandPreview}</code>
        </pre>
      )}
    </div>
  );
}

function ToolResult({ part }: { part: MessagePart }) {
  const result = part.result as {
    result?: string;
    status?: string;
    exitCode?: number;
  };

  if (!result) return null;

  const isError = result.status === "error" || (result.exitCode && result.exitCode !== 0);
  const output = result.result || JSON.stringify(result, null, 2);

  // Truncate long output
  const maxLength = 2000;
  const isTruncated = output.length > maxLength;
  const displayOutput = isTruncated ? output.slice(0, maxLength) + "\n... (truncated)" : output;

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium">
        {isError ? (
          <>
            <span className="text-red-600">✗</span>
            <span className="text-red-600">Error</span>
          </>
        ) : (
          <>
            <span className="text-green-600">✓</span>
            <span className="text-green-600">Success</span>
          </>
        )}
      </div>

      <pre
        className={cn(
          "text-xs p-2 rounded overflow-x-auto max-h-64 overflow-y-auto",
          isError
            ? "bg-red-950/50 text-red-200"
            : "bg-black/80 text-gray-300"
        )}
      >
        <code>{displayOutput}</code>
      </pre>
    </div>
  );
}

function formatToolName(name: string): string {
  switch (name) {
    case "shell":
      return "Shell Command";
    case "grep":
      return "Search Code";
    case "str_replace_based_edit_tool":
      return "Edit File";
    default:
      return name
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
  }
}
