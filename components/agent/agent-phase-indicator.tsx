"use client";

/**
 * Agent Phase Indicator Component
 *
 * Shows workflow progress phases: Clone → Plan → Approve → Execute
 *
 * Phase determination priority:
 * 1. Deterministic: From workflow custom_status via useWorkflowStatus hook
 * 2. Fallback: Inferred from streaming events (for backwards compatibility)
 */

import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import { CheckIcon, Loader2, AlertCircleIcon } from "lucide-react";
import type { WorkflowStreamEvent } from "@/hooks/use-workflow-stream";
import { useWorkflowStatus } from "@/hooks/use-workflows";

export type AgentPhase =
  | "exploration"
  | "clone"
  | "planning"
  | "plan"
  | "awaiting_approval"
  | "approve"
  | "executing"
  | "execute"
  | "completed"
  | "failed"
  | "rejected"
  | "error";

interface AgentPhaseIndicatorProps {
  events: WorkflowStreamEvent[];
  workflowId?: string | null;
  className?: string;
}

const PHASES: { id: string; label: string; matches: AgentPhase[] }[] = [
  { id: "clone", label: "Clone", matches: ["clone", "exploration"] },
  { id: "plan", label: "Plan", matches: ["plan", "planning"] },
  { id: "approve", label: "Approve", matches: ["approve", "awaiting_approval"] },
  { id: "execute", label: "Execute", matches: ["execute", "executing"] },
];

/**
 * Normalize phase names to canonical form
 */
function normalizePhase(phase: AgentPhase | string): AgentPhase {
  const normalized = phase.toLowerCase();
  switch (normalized) {
    case "exploration":
    case "clone":
      return "clone";
    case "planning":
    case "plan":
      return "plan";
    case "awaiting_approval":
    case "approve":
      return "approve";
    case "executing":
    case "execute":
      return "execute";
    case "completed":
      return "completed";
    case "failed":
    case "error":
      return "error";
    case "rejected":
      return "rejected";
    default:
      return phase as AgentPhase;
  }
}

/**
 * Derive the current phase from workflow events (fallback method)
 */
export function derivePhaseFromEvents(events: WorkflowStreamEvent[]): AgentPhase {
  // Check for error state
  const hasError = events.some((e) => e.type === "error");
  if (hasError) return "error";

  // Check for completion
  const isCompleted = events.some(
    (e) =>
      e.type === "task_completed" &&
      e.data &&
      (e.data.metadata as Record<string, unknown>)?.workflowComplete === true
  );
  if (isCompleted) return "completed";

  // Look for status messages in events (from Dapr workflow customStatus)
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    // Skip events without data
    if (!event.data) continue;

    const status = (
      event.data.status ||
      event.data.content ||
      (event.data.metadata as Record<string, unknown>)?.customStatus ||
      ""
    ) as string;
    const statusLower = status.toLowerCase();

    // Check for phase indicators in status messages
    if (
      statusLower.includes("executing") ||
      statusLower.includes("execution started") ||
      statusLower.includes("running implementation")
    ) {
      return "execute";
    }

    if (
      statusLower.includes("waiting for plan approval") ||
      statusLower.includes("plan ready for approval") ||
      statusLower.includes("awaiting approval") || statusLower.includes("awaiting_approval")
    ) {
      return "approve";
    }

    if (
      statusLower.includes("creating implementation plan") ||
      statusLower.includes("planning") ||
      statusLower.includes("generating plan")
    ) {
      return "plan";
    }

    if (
      statusLower.includes("cloning") ||
      statusLower.includes("clone") ||
      statusLower.includes("exploring")
    ) {
      return "clone";
    }
  }

  // Infer phase from tool_call/tool_result events (from planner-agent streaming)
  const hasToolCalls = events.some(
    (e) => e.type === "tool_call" || e.type === "tool_result"
  );
  if (hasToolCalls) {
    // Check for execution-related tool calls (Write, Edit to source files)
    const hasExecutionTools = events.some((e) => {
      if (e.type !== "tool_call" && e.type !== "tool_result") return false;
      if (!e.data) return false;
      const toolName = (e.data.toolName || "").toLowerCase();
      const toolInput = e.data.toolInput as Record<string, unknown> | undefined;
      const filePath = (toolInput?.path || toolInput?.file_path || "") as string;

      // Writing/editing to source files (not plan files) indicates execution
      if (
        (toolName === "write" ||
          toolName === "edit" ||
          toolName === "str_replace_based_edit_tool") &&
        filePath &&
        !filePath.includes("/plans/") &&
        filePath.includes("/workspace/")
      ) {
        return true;
      }
      return false;
    });

    if (hasExecutionTools) {
      return "execute";
    }

    // If we have tool calls but no execution tools, we're in planning
    return "plan";
  }

  // Check initial event status
  const initialEvent = events.find((e) => e.type === "initial");
  if (initialEvent && initialEvent.data) {
    const initialStatus = (initialEvent.data as Record<string, unknown>)
      ?.status as string;
    if (initialStatus === "AWAITING_APPROVAL") {
      return "approve";
    }
    // If we have an initial event with RUNNING status, we're past clone
    if (initialStatus === "RUNNING") {
      return "plan";
    }
  }

  // Default to clone
  return "clone";
}

/**
 * Legacy export for backwards compatibility
 */
export const derivePhase = derivePhaseFromEvents;

/**
 * Get the index of the current phase (for progress calculation)
 */
function getPhaseIndex(phase: AgentPhase): number {
  const normalized = normalizePhase(phase);
  const index = PHASES.findIndex((p) => p.matches.includes(normalized as AgentPhase));
  if (normalized === "completed") return PHASES.length;
  if (normalized === "error" || normalized === "rejected") return -1;
  return index >= 0 ? index : 0;
}

export const AgentPhaseIndicator = memo(function AgentPhaseIndicator({
  events,
  workflowId,
  className,
}: AgentPhaseIndicatorProps) {
  // Try to get deterministic status from the workflow
  const { phase: statusPhase, progress, message, runtimeStatus } = useWorkflowStatus(
    workflowId,
    2000 // Refresh every 2 seconds
  );

  // Derive phase from events as fallback
  const eventPhase = useMemo(() => derivePhaseFromEvents(events), [events]);

  // Use deterministic status phase if available, otherwise fall back to event-derived phase
  const currentPhase = normalizePhase(statusPhase || eventPhase);
  const currentIndex = getPhaseIndex(currentPhase);

  // Determine if we're in an error/failed state
  const isError = currentPhase === "error" || currentPhase === "rejected";
  const isCompleted = currentPhase === "completed" || runtimeStatus === "COMPLETED";

  return (
    <div className={cn("p-4", className)}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
          Progress
        </span>
        {progress !== null && (
          <span className="text-xs text-muted-foreground font-mono">
            {progress}%
          </span>
        )}
      </div>

      {/* Phase Steps */}
      <div className="flex items-center justify-between">
        {PHASES.map((phase, index) => {
          const phaseCompleted = currentIndex > index || isCompleted;
          const phaseCurrent = currentIndex === index && !isCompleted;
          const phaseError = isError && index === currentIndex;

          return (
            <div key={phase.id} className="flex items-center">
              {/* Phase Circle */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all",
                    phaseCompleted
                      ? "bg-green-500/20 text-green-400 border border-green-500/50"
                      : phaseCurrent
                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/50"
                      : phaseError
                      ? "bg-red-500/20 text-red-400 border border-red-500/50"
                      : "bg-muted text-muted-foreground border border-border"
                  )}
                >
                  {phaseCompleted ? (
                    <CheckIcon className="w-3.5 h-3.5" />
                  ) : phaseCurrent ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : phaseError ? (
                    <AlertCircleIcon className="w-3.5 h-3.5" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  )}
                </div>
                <span
                  className={cn(
                    "mt-1.5 text-xs font-medium",
                    phaseCompleted
                      ? "text-green-400"
                      : phaseCurrent
                      ? "text-blue-400"
                      : phaseError
                      ? "text-red-400"
                      : "text-muted-foreground"
                  )}
                >
                  {phase.label}
                </span>
              </div>

              {/* Connector Line */}
              {index < PHASES.length - 1 && (
                <div
                  className={cn(
                    "w-8 h-0.5 mx-1",
                    currentIndex > index ? "bg-green-500/50" : "bg-border"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Status Message */}
      {message && !isError && !isCompleted && (
        <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin" />
          {message}
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div className="mt-3 text-xs text-red-400 flex items-center gap-1.5">
          <AlertCircleIcon className="w-3 h-3" />
          {message || "Workflow encountered an error"}
        </div>
      )}

      {/* Completed State */}
      {isCompleted && (
        <div className="mt-3 text-xs text-green-400 flex items-center gap-1.5">
          <CheckIcon className="w-3 h-3" />
          {message || "Workflow completed successfully"}
        </div>
      )}
    </div>
  );
});

/**
 * Compact phase indicator (single line)
 */
export const AgentPhaseIndicatorCompact = memo(function AgentPhaseIndicatorCompact({
  events,
  workflowId,
  className,
}: AgentPhaseIndicatorProps) {
  // Try to get deterministic status from the workflow
  const { phase: statusPhase } = useWorkflowStatus(workflowId, 2000);

  // Derive phase from events as fallback
  const eventPhase = useMemo(() => derivePhaseFromEvents(events), [events]);

  // Use deterministic status phase if available
  const currentPhase = normalizePhase(statusPhase || eventPhase);
  const currentIndex = getPhaseIndex(currentPhase);
  const isCompleted = currentPhase === "completed";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {PHASES.map((phase, index) => {
        const phaseCompleted = currentIndex > index || isCompleted;
        const phaseCurrent = currentIndex === index && !isCompleted;

        return (
          <div key={phase.id} className="flex items-center gap-2">
            <span
              className={cn(
                "text-xs font-medium",
                phaseCompleted
                  ? "text-green-400"
                  : phaseCurrent
                  ? "text-blue-400"
                  : "text-muted-foreground"
              )}
            >
              {phaseCompleted ? "[✓]" : phaseCurrent ? "[◐]" : "[○]"} {phase.label}
            </span>
          </div>
        );
      })}
    </div>
  );
});
