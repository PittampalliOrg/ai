"use client";

/**
 * Agent Phase Indicator Component
 *
 * Shows workflow progress phases: Clone → Plan → Approve → Execute
 * Derives phase from customStatus in workflow events.
 */

import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import { CheckIcon, Loader2 } from "lucide-react";
import type { WorkflowStreamEvent } from "@/hooks/use-workflow-stream";

export type AgentPhase = "clone" | "plan" | "approve" | "execute" | "completed" | "error";

interface AgentPhaseIndicatorProps {
  events: WorkflowStreamEvent[];
  className?: string;
}

const PHASES: { id: AgentPhase; label: string }[] = [
  { id: "clone", label: "Clone" },
  { id: "plan", label: "Plan" },
  { id: "approve", label: "Approve" },
  { id: "execute", label: "Execute" },
];

/**
 * Derive the current phase from workflow events
 */
export function derivePhase(events: WorkflowStreamEvent[]): AgentPhase {
  // Check for error state
  const hasError = events.some((e) => e.type === "error");
  if (hasError) return "error";

  // Check for completion
  const isCompleted = events.some(
    (e) =>
      e.type === "task_completed" &&
      (e.data.metadata as Record<string, unknown>)?.workflowComplete === true
  );
  if (isCompleted) return "completed";

  // Look for status messages in events
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    const status = (
      event.data.status ||
      event.data.content ||
      (event.data.metadata as Record<string, unknown>)?.customStatus ||
      ""
    ) as string;
    const statusLower = status.toLowerCase();

    // Check for phase indicators
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
      statusLower.includes("awaiting approval")
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
      statusLower.includes("clone")
    ) {
      return "clone";
    }
  }

  // Check initial event status
  const initialEvent = events.find((e) => e.type === "initial");
  if (initialEvent) {
    const initialStatus = (initialEvent.data as Record<string, unknown>)?.status as string;
    if (initialStatus === "AWAITING_APPROVAL") {
      return "approve";
    }
  }

  // Default to clone if we have any events, otherwise idle
  return events.length > 0 ? "clone" : "clone";
}

/**
 * Get the index of the current phase (for progress calculation)
 */
function getPhaseIndex(phase: AgentPhase): number {
  const index = PHASES.findIndex((p) => p.id === phase);
  if (phase === "completed") return PHASES.length;
  if (phase === "error") return -1;
  return index >= 0 ? index : 0;
}

export const AgentPhaseIndicator = memo(function AgentPhaseIndicator({
  events,
  className,
}: AgentPhaseIndicatorProps) {
  const currentPhase = useMemo(() => derivePhase(events), [events]);
  const currentIndex = getPhaseIndex(currentPhase);

  return (
    <div className={cn("p-4", className)}>
      <div className="text-xs text-zinc-500 mb-3 font-medium uppercase tracking-wide">
        Progress
      </div>

      {/* Phase Steps */}
      <div className="flex items-center justify-between">
        {PHASES.map((phase, index) => {
          const isCompleted = currentIndex > index || currentPhase === "completed";
          const isCurrent = currentIndex === index && currentPhase !== "completed";
          const isError = currentPhase === "error" && index === currentIndex;

          return (
            <div key={phase.id} className="flex items-center">
              {/* Phase Circle */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all",
                    isCompleted
                      ? "bg-green-500/20 text-green-400 border border-green-500/50"
                      : isCurrent
                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/50"
                      : isError
                      ? "bg-red-500/20 text-red-400 border border-red-500/50"
                      : "bg-zinc-800 text-zinc-500 border border-zinc-700"
                  )}
                >
                  {isCompleted ? (
                    <CheckIcon className="w-3.5 h-3.5" />
                  ) : isCurrent ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  )}
                </div>
                <span
                  className={cn(
                    "mt-1.5 text-xs font-medium",
                    isCompleted
                      ? "text-green-400"
                      : isCurrent
                      ? "text-blue-400"
                      : "text-zinc-500"
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
                    currentIndex > index
                      ? "bg-green-500/50"
                      : "bg-zinc-700"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Error State */}
      {currentPhase === "error" && (
        <div className="mt-3 text-xs text-red-400 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          Workflow encountered an error
        </div>
      )}

      {/* Completed State */}
      {currentPhase === "completed" && (
        <div className="mt-3 text-xs text-green-400 flex items-center gap-1.5">
          <CheckIcon className="w-3 h-3" />
          Workflow completed successfully
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
  className,
}: AgentPhaseIndicatorProps) {
  const currentPhase = useMemo(() => derivePhase(events), [events]);
  const currentIndex = getPhaseIndex(currentPhase);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {PHASES.map((phase, index) => {
        const isCompleted = currentIndex > index || currentPhase === "completed";
        const isCurrent = currentIndex === index && currentPhase !== "completed";

        return (
          <div key={phase.id} className="flex items-center gap-2">
            <span
              className={cn(
                "text-xs font-medium",
                isCompleted
                  ? "text-green-400"
                  : isCurrent
                  ? "text-blue-400"
                  : "text-zinc-500"
              )}
            >
              {isCompleted ? "[✓]" : isCurrent ? "[◐]" : "[○]"} {phase.label}
            </span>
          </div>
        );
      })}
    </div>
  );
});
