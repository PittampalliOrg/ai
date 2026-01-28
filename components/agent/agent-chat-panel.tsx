"use client";

/**
 * Agent Chat Panel Component
 *
 * Replaces the AgentWorkflowSidebar with a chat-style interface.
 * Reuses existing message/response components from the chatbot UI.
 */

import { memo, useState, useCallback, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { User, Wrench, FileText, Loader2 } from "lucide-react";
import type { WorkflowStreamEvent } from "@/hooks/use-workflow-stream";
import { useAgentMessages, type AgentMessage } from "@/hooks/use-agent-messages";
import { AgentPhaseIndicatorCompact } from "./agent-phase-indicator";
import { PlanApprovalSection } from "./plan-approval-section";
import { AgentChatInput } from "./agent-chat-input";

// Reuse existing elements
import { Response } from "@/components/elements/response";
import { SparklesIcon } from "@/components/icons";

// ============================================================================
// Types
// ============================================================================

interface PlanInfo {
  id: string;
  title: string;
  summary: string;
  tasks: Array<{
    id: string;
    title: string;
    description?: string;
    status?: string;
  }>;
}

interface AgentChatPanelProps {
  taskPrompt: string | null;
  workflowId: string | null;
  events: WorkflowStreamEvent[];
  accumulatedText: string;
  plan?: PlanInfo | null;
  isAwaitingApproval: boolean;
  isStreaming: boolean;
  isConnected: boolean;
  executionStatus: string;
  onFollowUp?: (message: string) => void;
  onStop?: () => void;
  className?: string;
}

// ============================================================================
// Message Components (reusing patterns from message.tsx)
// ============================================================================

const UserMessage = memo(function UserMessage({
  message,
}: {
  message: AgentMessage;
}) {
  return (
    <div
      className="group/message flex w-full items-start gap-3 py-4"
      data-role="user"
    >
      {/* Avatar - matches chatbot style */}
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <User className="size-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-foreground">You</span>
          <span className="text-xs text-muted-foreground">
            {formatTime(message.timestamp)}
          </span>
        </div>
        <div className="text-sm text-foreground whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    </div>
  );
});

const AssistantMessage = memo(function AssistantMessage({
  message,
}: {
  message: AgentMessage;
}) {
  return (
    <div
      className="group/message flex w-full items-start gap-3 py-4"
      data-role="assistant"
    >
      {/* Avatar - matches chatbot sparkle icon */}
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
        <SparklesIcon size={14} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-foreground">Agent</span>
          <span className="text-xs text-muted-foreground">
            {formatTime(message.timestamp)}
          </span>
          {message.isStreaming && (
            <Loader2 className="size-3 animate-spin text-muted-foreground" />
          )}
        </div>
        {/* Use Response component for markdown rendering */}
        <div className="text-sm text-foreground">
          <Response>{message.content}</Response>
          {message.isStreaming && (
            <span className="inline-block w-2 h-4 ml-0.5 bg-primary animate-pulse" />
          )}
        </div>
      </div>
    </div>
  );
});

const ToolSummaryMessage = memo(function ToolSummaryMessage({
  message,
}: {
  message: AgentMessage;
}) {
  return (
    <div className="flex items-center gap-3 py-2 ml-11">
      {/* Tool icon */}
      <div className="flex size-6 shrink-0 items-center justify-center rounded bg-muted">
        <Wrench className="size-3.5 text-muted-foreground" />
      </div>

      {/* Content */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>{message.content}</span>
        {message.toolCount && message.toolCount > 1 && (
          <span className="px-1.5 py-0.5 bg-muted rounded text-xs">
            {message.toolCount}
          </span>
        )}
      </div>
    </div>
  );
});

const PlanApprovalMessage = memo(function PlanApprovalMessage({
  message,
}: {
  message: AgentMessage;
}) {
  return (
    <div className="flex items-start gap-3 py-4">
      {/* Icon */}
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20 ring-1 ring-amber-500/50">
        <FileText className="size-4 text-amber-500" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-amber-500">Plan Ready</span>
          <span className="text-xs text-muted-foreground">
            {formatTime(message.timestamp)}
          </span>
        </div>
        <div className="text-sm text-muted-foreground">{message.content}</div>
      </div>
    </div>
  );
});

const ThinkingIndicator = memo(function ThinkingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex items-start gap-3 py-4"
    >
      {/* Avatar */}
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
        <div className="animate-pulse">
          <SparklesIcon size={14} />
        </div>
      </div>

      {/* Thinking dots - matches chatbot ThinkingMessage */}
      <div className="flex items-center gap-1 py-2 text-muted-foreground text-sm">
        <span className="animate-pulse">Thinking</span>
        <span className="inline-flex">
          <span className="animate-bounce [animation-delay:0ms]">.</span>
          <span className="animate-bounce [animation-delay:150ms]">.</span>
          <span className="animate-bounce [animation-delay:300ms]">.</span>
        </span>
      </div>
    </motion.div>
  );
});

// ============================================================================
// Helper Functions
// ============================================================================

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ============================================================================
// Main Component
// ============================================================================

export const AgentChatPanel = memo(function AgentChatPanel({
  taskPrompt,
  workflowId,
  events,
  accumulatedText,
  plan,
  isAwaitingApproval,
  isStreaming,
  isConnected,
  executionStatus,
  onFollowUp,
  onStop,
  className,
}: AgentChatPanelProps) {
  const [inputValue, setInputValue] = useState("");
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Transform events into chat messages
  const messages = useAgentMessages({
    taskPrompt,
    events,
    accumulatedText,
    isStreaming,
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, accumulatedText]);

  // Handle sending follow-up messages
  const handleSubmit = useCallback(() => {
    if (!inputValue.trim() || !onFollowUp) return;
    onFollowUp(inputValue.trim());
    setInputValue("");
  }, [inputValue, onFollowUp]);

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Compact status header */}
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <AgentPhaseIndicatorCompact events={events} workflowId={workflowId} />
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "size-2 rounded-full",
              isConnected ? "bg-green-500" : "bg-muted-foreground"
            )}
          />
          <span className="text-xs text-muted-foreground capitalize">
            {executionStatus}
          </span>
        </div>
      </div>

      {/* Scrollable messages area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4"
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No messages yet. Submit a task to get started.
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {messages.map((message) => {
              switch (message.type) {
                case "text":
                  return message.role === "user" ? (
                    <UserMessage key={message.id} message={message} />
                  ) : (
                    <AssistantMessage key={message.id} message={message} />
                  );
                case "tool-summary":
                  return (
                    <ToolSummaryMessage key={message.id} message={message} />
                  );
                case "plan-approval":
                  return (
                    <PlanApprovalMessage key={message.id} message={message} />
                  );
                case "thinking":
                  return (
                    <AnimatePresence key={message.id}>
                      <ThinkingIndicator />
                    </AnimatePresence>
                  );
                default:
                  return null;
              }
            })}
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* Plan approval section (inline when awaiting) */}
      {isAwaitingApproval && (
        <PlanApprovalSection
          workflowId={workflowId}
          planTitle={plan?.title}
          planSummary={plan?.summary}
          planSteps={plan?.tasks}
          className="border-t"
        />
      )}

      {/* Input at bottom */}
      <div className="border-t p-4">
        <AgentChatInput
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSubmit}
          onStop={onStop}
          isStreaming={isStreaming}
          isDisabled={!onFollowUp || isAwaitingApproval}
          placeholder={
            isAwaitingApproval
              ? "Approve or reject the plan above..."
              : "Send a follow-up message..."
          }
        />
      </div>
    </div>
  );
});
