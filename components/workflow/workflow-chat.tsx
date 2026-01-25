"use client";

/**
 * Workflow Chat Component
 *
 * Main container for workflow execution view with:
 * - Split view layout (sidebar + execution panel)
 * - Task input for follow-ups
 * - Connection status
 */

import { memo, useState, useCallback } from "react";
import {
  WorkflowExecutionProvider,
  useWorkflowExecution,
} from "@/contexts/workflow-execution-context";
import { WorkflowSidebar } from "./workflow-sidebar";
import { WorkflowExecutionPanel } from "./workflow-execution-panel";
import { cn } from "@/lib/utils";

interface WorkflowChatProps {
  workflowId: string;
  taskPrompt?: string | null;
  onSubmitFollowUp?: (message: string) => Promise<void>;
  className?: string;
}

/**
 * Wrapper component that provides the context
 */
export function WorkflowChat({
  workflowId,
  taskPrompt,
  onSubmitFollowUp,
  className,
}: WorkflowChatProps) {
  return (
    <WorkflowExecutionProvider
      workflowId={workflowId}
      initialTaskPrompt={taskPrompt}
    >
      <WorkflowChatInner
        taskPrompt={taskPrompt}
        onSubmitFollowUp={onSubmitFollowUp}
        className={className}
      />
    </WorkflowExecutionProvider>
  );
}

interface WorkflowChatInnerProps {
  taskPrompt?: string | null;
  onSubmitFollowUp?: (message: string) => Promise<void>;
  className?: string;
}

const WorkflowChatInner = memo(function WorkflowChatInner({
  taskPrompt,
  onSubmitFollowUp,
  className,
}: WorkflowChatInnerProps) {
  const { executionStatus, isConnected } = useWorkflowExecution();
  const [followUpInput, setFollowUpInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmitFollowUp = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!followUpInput.trim() || !onSubmitFollowUp || isSubmitting) return;

      setIsSubmitting(true);
      try {
        await onSubmitFollowUp(followUpInput.trim());
        setFollowUpInput("");
      } catch (error) {
        console.error("Failed to submit follow-up:", error);
      } finally {
        setIsSubmitting(false);
      }
    },
    [followUpInput, onSubmitFollowUp, isSubmitting]
  );

  const canSubmitFollowUp =
    executionStatus === "completed" || executionStatus === "error";

  return (
    <div className={cn("flex h-full", className)}>
      {/* Left: Sidebar */}
      <div className="w-[400px] flex-shrink-0 border-r border-zinc-800">
        <WorkflowSidebar taskPrompt={taskPrompt} />
      </div>

      {/* Right: Execution Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-hidden">
          <WorkflowExecutionPanel />
        </div>

        {/* Follow-up Input (only show when execution is done) */}
        {onSubmitFollowUp && canSubmitFollowUp && (
          <div className="border-t border-zinc-800 p-4 bg-zinc-950">
            <form onSubmit={handleSubmitFollowUp} className="flex gap-3">
              <input
                type="text"
                value={followUpInput}
                onChange={(e) => setFollowUpInput(e.target.value)}
                placeholder="Send a follow-up message..."
                disabled={isSubmitting}
                className={cn(
                  "flex-1 px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg",
                  "text-sm text-zinc-200 placeholder:text-zinc-500",
                  "focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50",
                  "disabled:opacity-50"
                )}
              />
              <button
                type="submit"
                disabled={!followUpInput.trim() || isSubmitting}
                className={cn(
                  "px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium",
                  "hover:bg-blue-500 transition-colors",
                  "disabled:opacity-50 disabled:cursor-not-allowed"
                )}
              >
                {isSubmitting ? "Sending..." : "Send"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
});

/**
 * Inner viewer component - assumes provider is already established
 * Use this when WorkflowExecutionProvider is at a higher level
 */
export const WorkflowViewerInner = memo(function WorkflowViewerInner({
  taskPrompt,
  className,
}: {
  taskPrompt?: string | null;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full", className)}>
      {/* Left: Sidebar */}
      <div className="w-[400px] flex-shrink-0 border-r border-zinc-800">
        <WorkflowSidebar taskPrompt={taskPrompt} />
      </div>

      {/* Right: Execution Panel */}
      <div className="flex-1 overflow-hidden">
        <WorkflowExecutionPanel />
      </div>
    </div>
  );
});

/**
 * Standalone workflow viewer without input
 * Useful for viewing completed workflows
 */
export const WorkflowViewer = memo(function WorkflowViewer({
  workflowId,
  taskPrompt,
  className,
}: Omit<WorkflowChatProps, "onSubmitFollowUp">) {
  return (
    <WorkflowExecutionProvider
      workflowId={workflowId}
      initialTaskPrompt={taskPrompt}
    >
      <WorkflowViewerInner taskPrompt={taskPrompt} className={className} />
    </WorkflowExecutionProvider>
  );
});

/**
 * Compact workflow view (single column)
 */
export const WorkflowCompact = memo(function WorkflowCompact({
  workflowId,
  taskPrompt,
  className,
}: Omit<WorkflowChatProps, "onSubmitFollowUp">) {
  const [view, setView] = useState<"sidebar" | "panel">("sidebar");

  return (
    <WorkflowExecutionProvider
      workflowId={workflowId}
      initialTaskPrompt={taskPrompt}
    >
      <div className={cn("flex flex-col h-full", className)}>
        {/* View toggle */}
        <div className="flex border-b border-zinc-800">
          <button
            onClick={() => setView("sidebar")}
            className={cn(
              "flex-1 px-4 py-2 text-sm font-medium transition-colors",
              view === "sidebar"
                ? "bg-zinc-800 text-zinc-200"
                : "text-zinc-500 hover:text-zinc-400"
            )}
          >
            Overview
          </button>
          <button
            onClick={() => setView("panel")}
            className={cn(
              "flex-1 px-4 py-2 text-sm font-medium transition-colors",
              view === "panel"
                ? "bg-zinc-800 text-zinc-200"
                : "text-zinc-500 hover:text-zinc-400"
            )}
          >
            Details
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {view === "sidebar" ? (
            <WorkflowSidebar taskPrompt={taskPrompt} />
          ) : (
            <WorkflowExecutionPanel />
          )}
        </div>
      </div>
    </WorkflowExecutionProvider>
  );
});
