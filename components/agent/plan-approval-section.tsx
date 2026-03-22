"use client";

/**
 * Plan Approval Section Component
 *
 * Displays the workflow plan for review and provides approve/reject controls.
 * Used when workflow is in "awaiting_approval" state.
 */

import { memo, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

interface PlanStep {
  id: string;
  title: string;
  description?: string;
}

export interface PlanApprovalSectionProps {
  workflowId: string | null;
  planTitle?: string;
  planSummary?: string;
  planSteps?: PlanStep[];
  onApprove?: () => Promise<void> | void;
  onReject?: () => Promise<void> | void;
  className?: string;
}

export const PlanApprovalSection = memo(function PlanApprovalSection({
  workflowId,
  planTitle,
  planSummary,
  planSteps,
  onApprove,
  onReject,
  className,
}: PlanApprovalSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = useCallback(async () => {
    if (!workflowId) return;

    setIsApproving(true);
    setError(null);

    try {
      if (onApprove) {
        await onApprove();
      } else {
        const response = await fetch(`/api/workflows/${workflowId}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approved: true }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to approve plan");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve plan");
    } finally {
      setIsApproving(false);
    }
  }, [onApprove, workflowId]);

  const handleReject = useCallback(async () => {
    if (!workflowId) return;

    setIsRejecting(true);
    setError(null);

    try {
      if (onReject) {
        await onReject();
      } else {
        const response = await fetch(`/api/workflows/${workflowId}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approved: false }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to reject plan");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject plan");
    } finally {
      setIsRejecting(false);
    }
  }, [onReject, workflowId]);

  return (
    <div className={cn("bg-amber-500/5", className)}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full p-4 hover:bg-amber-500/10 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
            <span className="text-amber-400 text-lg">!</span>
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-amber-400">Plan Ready for Review</h3>
            {planTitle && (
              <p className="text-xs text-amber-400/70 mt-0.5">{planTitle}</p>
            )}
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-amber-400/70" />
        ) : (
          <ChevronDown className="w-4 h-4 text-amber-400/70" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Summary */}
          {planSummary && (
            <p className="text-sm text-muted-foreground">{planSummary}</p>
          )}

          {/* Steps */}
          {planSteps && planSteps.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Plan Steps
              </h4>
              <ol className="space-y-2">
                {planSteps.map((step, index) => (
                  <li
                    key={step.id}
                    className="flex gap-3 p-2 rounded-lg bg-background/50 border border-border"
                  >
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{step.title}</p>
                      {step.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {step.description}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleApprove}
              disabled={isApproving || isRejecting}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
            >
              {isApproving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              Approve
            </Button>
            <Button
              onClick={handleReject}
              disabled={isApproving || isRejecting}
              variant="destructive"
              className="flex-1"
            >
              {isRejecting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <XCircle className="w-4 h-4 mr-2" />
              )}
              Reject
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});
