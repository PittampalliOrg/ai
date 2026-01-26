"use client";

/**
 * Plan Approval Section Component
 *
 * Enhanced plan approval UI with:
 * - Plan title and step count display
 * - Optional comments textarea
 * - Approve (green) and Reject (red) buttons
 */

import { memo, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  ClipboardCheck,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useWorkflowApproval } from "@/hooks/use-workflow-approval";

// Simplified type for plan steps that accepts optional description
interface PlanStepItem {
  id: string;
  title: string;
  description?: string;
  status?: string;
}

interface PlanApprovalSectionProps {
  workflowId: string | null;
  planTitle?: string | null;
  planSummary?: string | null;
  planSteps?: PlanStepItem[];
  className?: string;
}

export const PlanApprovalSection = memo(function PlanApprovalSection({
  workflowId,
  planTitle,
  planSummary,
  planSteps,
  className,
}: PlanApprovalSectionProps) {
  const { approve, reject, isApproving, error } = useWorkflowApproval(workflowId);
  const [approvalState, setApprovalState] = useState<"pending" | "approved" | "rejected">("pending");
  const [comments, setComments] = useState("");
  const [showSteps, setShowSteps] = useState(false);

  const handleApprove = useCallback(async () => {
    const result = await approve(comments || undefined);
    if (result.success) {
      setApprovalState("approved");
    }
  }, [approve, comments]);

  const handleReject = useCallback(async () => {
    const result = await reject(comments || "Rejected by user");
    if (result.success) {
      setApprovalState("rejected");
    }
  }, [reject, comments]);

  // Approved state
  if (approvalState === "approved") {
    return (
      <div className={cn("p-4 border-b border-zinc-800 bg-green-950/20", className)}>
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-green-300">Plan Approved</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Execution will begin shortly
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Rejected state
  if (approvalState === "rejected") {
    return (
      <div className={cn("p-4 border-b border-zinc-800 bg-red-950/20", className)}>
        <div className="flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-300">Plan Rejected</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {comments || "The workflow has been cancelled"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Pending approval state
  return (
    <div className={cn("p-4 border-b border-zinc-800 bg-amber-950/20", className)}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <ClipboardCheck className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0 space-y-3">
          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs text-amber-300 font-medium uppercase tracking-wide">
              Awaiting Approval
            </span>
          </div>

          {/* Plan Info */}
          <div>
            <h4 className="text-sm font-medium text-zinc-200">
              {planTitle || "Implementation Plan Ready"}
            </h4>
            {planSummary && (
              <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                {planSummary}
              </p>
            )}
            {planSteps && planSteps.length > 0 && (
              <p className="text-xs text-zinc-500 mt-1">
                {planSteps.length} step{planSteps.length !== 1 ? "s" : ""} in plan
              </p>
            )}
          </div>

          {/* Expandable Steps List */}
          {planSteps && planSteps.length > 0 && (
            <div>
              <button
                onClick={() => setShowSteps(!showSteps)}
                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {showSteps ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
                {showSteps ? "Hide steps" : "View steps"}
              </button>

              {showSteps && (
                <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
                  {planSteps.map((step, index) => (
                    <div
                      key={step.id || index}
                      className="flex items-start gap-2 text-xs bg-zinc-900/50 rounded p-2"
                    >
                      <span className="text-zinc-500 font-mono flex-shrink-0">
                        {index + 1}.
                      </span>
                      <div className="min-w-0">
                        <p className="text-zinc-300 font-medium">{step.title}</p>
                        {step.description && (
                          <p className="text-zinc-500 mt-0.5 line-clamp-2">
                            {step.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Comments Input */}
          <div>
            <textarea
              placeholder="Add comments (optional)..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              disabled={isApproving}
              className={cn(
                "w-full h-16 px-3 py-2 text-sm rounded-lg resize-none",
                "bg-zinc-900 border border-zinc-700",
                "text-zinc-200 placeholder:text-zinc-500",
                "focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            />
          </div>

          {/* Error Message */}
          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleApprove}
              disabled={isApproving}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                "bg-green-600 text-white hover:bg-green-500",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {isApproving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ThumbsUp className="w-4 h-4" />
              )}
              {isApproving ? "Processing..." : "Approve Plan"}
            </button>

            <button
              onClick={handleReject}
              disabled={isApproving}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-lg transition-colors",
                "border border-red-700 text-red-400 hover:bg-red-950/50",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              <ThumbsDown className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

/**
 * Compact approval banner for inline display
 */
export const PlanApprovalBanner = memo(function PlanApprovalBanner({
  workflowId,
  onViewPlan,
  className,
}: {
  workflowId: string | null;
  onViewPlan?: () => void;
  className?: string;
}) {
  const { approve, reject, isApproving } = useWorkflowApproval(workflowId);
  const [handled, setHandled] = useState(false);

  const handleApprove = useCallback(async () => {
    const result = await approve();
    if (result.success) setHandled(true);
  }, [approve]);

  const handleReject = useCallback(async () => {
    const result = await reject("Rejected by user");
    if (result.success) setHandled(true);
  }, [reject]);

  if (handled) return null;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-2 rounded-lg",
        "bg-amber-500/10 border border-amber-500/30",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        <span className="text-sm text-amber-300 font-medium">
          Plan ready for approval
        </span>
      </div>

      <div className="flex items-center gap-2">
        {onViewPlan && (
          <button
            onClick={onViewPlan}
            className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            View Plan
          </button>
        )}
        <button
          onClick={handleApprove}
          disabled={isApproving}
          className={cn(
            "px-3 py-1 text-xs font-medium rounded transition-colors",
            "bg-green-600 text-white hover:bg-green-500",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {isApproving ? "..." : "Approve"}
        </button>
        <button
          onClick={handleReject}
          disabled={isApproving}
          className={cn(
            "px-3 py-1 text-xs font-medium rounded transition-colors",
            "border border-red-700 text-red-400 hover:bg-red-950/50",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          Reject
        </button>
      </div>
    </div>
  );
});
