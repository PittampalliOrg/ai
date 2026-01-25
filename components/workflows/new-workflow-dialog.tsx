"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Loader2, AlertCircle, Rocket } from "lucide-react";

// ============================================================================
// Types
// ============================================================================

interface StartWorkflowResponse {
  success: boolean;
  instanceId?: string;
  statusUrl?: string;
  error?: string;
}

// ============================================================================
// NewWorkflowDialog
// ============================================================================

interface NewWorkflowDialogProps {
  onWorkflowStarted?: (instanceId: string) => void;
}

/**
 * Dialog component for creating and submitting a new workflow
 */
export function NewWorkflowDialog({ onWorkflowStarted }: NewWorkflowDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [task, setTask] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!task.trim()) {
      setError("Please enter a task description");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/workflows/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ task: task.trim() }),
      });

      const data: StartWorkflowResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to start workflow");
      }

      // Success - notify callback first
      if (data.instanceId) {
        onWorkflowStarted?.(data.instanceId);
      }

      // Close dialog and reset state
      setOpen(false);
      setTask("");
      setIsSubmitting(false);

      // Navigate to the new workflow after dialog closes
      if (data.instanceId) {
        // Small delay to ensure dialog closes before navigation
        setTimeout(() => {
          router.push(`/workflows/${encodeURIComponent(data.instanceId!)}`);
        }, 100);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start workflow");
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Reset state when closing
      setTask("");
      setError(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Workflow
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5" />
              Start New Workflow
            </DialogTitle>
            <DialogDescription>
              Describe the task you want the AI agents to accomplish. The workflow
              will be planned and executed by the multi-agent system.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="task">Task Description</Label>
              <Textarea
                id="task"
                placeholder="Example: Research the latest trends in AI development and create a summary report with key findings..."
                value={task}
                onChange={(e) => setTask(e.target.value)}
                rows={5}
                className="resize-none"
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                Be specific about what you want to accomplish. The AI will create
                a plan and execute it step by step.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !task.trim()}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4 mr-2" />
                  Start Workflow
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
