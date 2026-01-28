"use client";

/**
 * Agent Chat Input Component
 *
 * Auto-resizing textarea with submit/stop buttons for the agent chat panel.
 * Reuses styling patterns from the existing chatbot input.
 */

import { memo, useRef, useCallback, type KeyboardEvent, type ChangeEvent } from "react";
import { cn } from "@/lib/utils";
import { ArrowUp, Square, Loader2 } from "lucide-react";

interface AgentChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isStreaming: boolean;
  isDisabled?: boolean;
  placeholder?: string;
  className?: string;
}

export const AgentChatInput = memo(function AgentChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming,
  isDisabled = false,
  placeholder = "Send a follow-up message...",
  className,
}: AgentChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = "auto";
    // Set to scrollHeight, capped at ~200px (about 8 lines)
    const newHeight = Math.min(textarea.scrollHeight, 200);
    textarea.style.height = `${newHeight}px`;
  }, []);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
      adjustHeight();
    },
    [onChange, adjustHeight]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Submit on Enter (without Shift)
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!isStreaming && !isDisabled && value.trim()) {
          onSubmit();
        }
      }
    },
    [isStreaming, isDisabled, value, onSubmit]
  );

  const handleSubmitClick = useCallback(() => {
    if (!isStreaming && !isDisabled && value.trim()) {
      onSubmit();
    }
  }, [isStreaming, isDisabled, value, onSubmit]);

  const handleStopClick = useCallback(() => {
    if (onStop) {
      onStop();
    }
  }, [onStop]);

  const canSubmit = !isStreaming && !isDisabled && value.trim().length > 0;

  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "flex items-end gap-2 rounded-xl border bg-muted/50",
          "focus-within:border-ring focus-within:ring-1 focus-within:ring-ring",
          "transition-colors"
        )}
      >
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isDisabled}
          rows={1}
          className={cn(
            "flex-1 resize-none bg-transparent px-4 py-3",
            "text-sm text-foreground placeholder:text-muted-foreground",
            "focus:outline-none",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "min-h-[44px] max-h-[200px]"
          )}
        />

        {/* Action Button */}
        <div className="flex-shrink-0 p-2">
          {isStreaming ? (
            // Stop button during streaming
            <button
              onClick={handleStopClick}
              className={cn(
                "flex items-center justify-center",
                "size-8 rounded-lg",
                "bg-destructive hover:bg-destructive/90",
                "text-destructive-foreground transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-destructive/50"
              )}
              title="Stop generation"
            >
              <Square className="size-4" fill="currentColor" />
            </button>
          ) : (
            // Submit button
            <button
              onClick={handleSubmitClick}
              disabled={!canSubmit}
              className={cn(
                "flex items-center justify-center",
                "size-8 rounded-lg",
                "transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-primary/50",
                canSubmit
                  ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
              title="Send message"
            >
              <ArrowUp className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Helper text */}
      <div className="mt-1.5 flex items-center justify-between px-1 text-xs text-muted-foreground">
        <span>Press Enter to send, Shift+Enter for new line</span>
        {isStreaming && (
          <span className="flex items-center gap-1 text-primary">
            <Loader2 className="size-3 animate-spin" />
            Generating...
          </span>
        )}
      </div>
    </div>
  );
});

/**
 * Minimal inline input variant (for compact spaces)
 */
export const AgentChatInputCompact = memo(function AgentChatInputCompact({
  value,
  onChange,
  onSubmit,
  isStreaming,
  isDisabled = false,
  placeholder = "Message...",
  className,
}: Omit<AgentChatInputProps, "onStop">) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !isStreaming && !isDisabled && value.trim()) {
        e.preventDefault();
        onSubmit();
      }
    },
    [isStreaming, isDisabled, value, onSubmit]
  );

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isDisabled || isStreaming}
        className={cn(
          "flex-1 bg-muted border rounded-lg",
          "px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground",
          "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      />
      <button
        onClick={onSubmit}
        disabled={isStreaming || isDisabled || !value.trim()}
        className={cn(
          "px-3 py-2 rounded-lg text-sm font-medium",
          "bg-primary text-primary-foreground",
          "hover:bg-primary/90 transition-colors",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        {isStreaming ? <Loader2 className="size-4 animate-spin" /> : "Send"}
      </button>
    </div>
  );
});
