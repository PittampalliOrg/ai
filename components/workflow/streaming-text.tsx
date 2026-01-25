"use client";

/**
 * Streaming Text Component
 *
 * Displays accumulated LLM text with:
 * - Typewriter cursor animation
 * - Agent badge indication
 * - Monospace code styling for code blocks
 * - Markdown rendering
 */

import { memo, useRef, useEffect } from "react";
import type { AgentId } from "@/hooks/use-workflow-stream";
import { AgentBadge, getAgentBgColor } from "./agent-badge";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";

interface StreamingTextProps {
  text: string;
  agentId?: AgentId | null;
  isStreaming?: boolean;
  showCursor?: boolean;
  className?: string;
  maxHeight?: string;
  autoScroll?: boolean;
}

export const StreamingText = memo(function StreamingText({
  text,
  agentId,
  isStreaming = false,
  showCursor = true,
  className,
  maxHeight = "max-h-64",
  autoScroll = true,
}: StreamingTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when text changes
  useEffect(() => {
    if (autoScroll && containerRef.current && isStreaming) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [text, autoScroll, isStreaming]);

  if (!text) {
    return (
      <div
        className={cn(
          "text-zinc-500 text-sm italic",
          className
        )}
      >
        {isStreaming ? (
          <span className="flex items-center gap-2">
            <span className="inline-block w-2 h-4 bg-zinc-400 animate-pulse" />
            Waiting for response...
          </span>
        ) : (
          "No response yet"
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {agentId && (
        <div className="flex items-center gap-2">
          <AgentBadge agentId={agentId} size="sm" />
          {isStreaming && (
            <span className="text-xs text-zinc-500">responding...</span>
          )}
        </div>
      )}

      <div
        ref={containerRef}
        className={cn(
          "rounded-lg overflow-y-auto",
          maxHeight,
          getAgentBgColor(agentId),
          "p-3"
        )}
      >
        <div className="prose prose-sm dark:prose-invert max-w-none prose-code:bg-zinc-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono prose-code:before:content-none prose-code:after:content-none">
          <Markdown>{text}</Markdown>
          {isStreaming && showCursor && (
            <span className="inline-block w-2 h-4 bg-zinc-400 animate-pulse ml-0.5 align-text-bottom" />
          )}
        </div>
      </div>
    </div>
  );
});

/**
 * Simple text display without markdown (for tool outputs)
 */
export const RawText = memo(function RawText({
  text,
  className,
  maxHeight = "max-h-32",
}: {
  text: string;
  className?: string;
  maxHeight?: string;
}) {
  return (
    <pre
      className={cn(
        "text-xs font-mono text-zinc-400 whitespace-pre-wrap break-all overflow-y-auto",
        maxHeight,
        className
      )}
    >
      {text}
    </pre>
  );
});

/**
 * Cursor-only component for loading states
 */
export const TypewriterCursor = memo(function TypewriterCursor({
  className,
}: {
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block w-2 h-4 bg-zinc-400 animate-pulse",
        className
      )}
    />
  );
});
