"use client";

/**
 * Ralph Acceptance Dialog Component
 *
 * Dialog for accepting a plan or providing feedback for iteration.
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle2,
  MessageSquare,
  PlayCircle,
  FileCode,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { type TaskPlan, getPlanStats } from "@/lib/types/ralph-plan";

// ============================================================================
// Types
// ============================================================================

interface RalphAcceptanceDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback to close the dialog */
  onOpenChange: (open: boolean) => void;
  /** The plan to review */
  plan: TaskPlan;
  /** Callback when plan is accepted */
  onAccept: () => Promise<void>;
  /** Callback when feedback is submitted */
  onFeedback: (feedback: string) => Promise<void>;
  /** Whether an action is in progress */
  isLoading?: boolean;
}

// ============================================================================
// Main Component
// ============================================================================

export function RalphAcceptanceDialog({
  open,
  onOpenChange,
  plan,
  onAccept,
  onFeedback,
  isLoading = false,
}: RalphAcceptanceDialogProps) {
  const [mode, setMode] = useState<"review" | "feedback">("review");
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const stats = getPlanStats(plan);

  const handleAccept = async () => {
    setIsSubmitting(true);
    try {
      await onAccept();
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFeedback = async () => {
    if (!feedback.trim()) return;

    setIsSubmitting(true);
    try {
      await onFeedback(feedback.trim());
      setFeedback("");
      setMode("review");
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setMode("review");
      setFeedback("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "review" ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Review Plan
              </>
            ) : (
              <>
                <MessageSquare className="h-5 w-5 text-blue-500" />
                Suggest Changes
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {mode === "review"
              ? "Review the plan below. Accept to start execution, or suggest changes."
              : "Describe what changes you'd like to see in the plan."}
          </DialogDescription>
        </DialogHeader>

        {mode === "review" ? (
          <>
            {/* Plan Summary */}
            <div className="space-y-4">
              {/* Title & Objective */}
              <div>
                <h3 className="font-semibold text-lg">{plan.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {plan.objective}
                </p>
              </div>

              {/* Stats */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {stats.total} tasks
                </Badge>
                {plan.iteration > 1 && (
                  <Badge variant="outline">
                    Iteration {plan.iteration}
                  </Badge>
                )}
              </div>

              <Separator />

              {/* Items Preview */}
              <div>
                <h4 className="text-sm font-medium mb-2">Tasks</h4>
                <ScrollArea className="h-[200px] rounded-md border p-3">
                  <div className="space-y-3">
                    {plan.items.map((item, index) => (
                      <div key={item.id} className="flex gap-3">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs font-medium">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{item.title}</div>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {item.description}
                          </p>
                          {item.files.length > 0 && (
                            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                              <FileCode className="h-3 w-3" />
                              {item.files.length} file(s)
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Warning if many tasks */}
              {stats.total > 10 && (
                <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg text-yellow-800 dark:text-yellow-200">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    This plan has {stats.total} tasks. Consider breaking it into
                    smaller batches for better results.
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
              <Button
                variant="outline"
                onClick={() => setMode("feedback")}
                disabled={isSubmitting || isLoading}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Suggest Changes
              </Button>
              <Button
                onClick={handleAccept}
                disabled={isSubmitting || isLoading}
              >
                {isSubmitting || isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <PlayCircle className="h-4 w-4 mr-2" />
                )}
                Accept & Execute
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            {/* Feedback Mode */}
            <div className="space-y-4">
              <Textarea
                placeholder="Describe what changes you'd like...

Examples:
- Add error handling to the API endpoint
- Split task 3 into smaller steps
- Include unit tests
- Use a different approach for..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                className="min-h-[200px] resize-none"
                disabled={isSubmitting}
              />

              <div className="text-xs text-muted-foreground">
                Your feedback will be used to generate an updated plan.
              </div>
            </div>

            <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setMode("review");
                  setFeedback("");
                }}
                disabled={isSubmitting}
              >
                Back to Review
              </Button>
              <Button
                onClick={handleFeedback}
                disabled={!feedback.trim() || isSubmitting || isLoading}
              >
                {isSubmitting || isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <MessageSquare className="h-4 w-4 mr-2" />
                )}
                Submit Feedback
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default RalphAcceptanceDialog;
