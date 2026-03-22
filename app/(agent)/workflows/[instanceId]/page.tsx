"use client";

import { use, useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useWorkflow, useWorkflowStatus } from "@/hooks/use-workflows";
import { WorkflowDetail, WorkflowDetailSkeleton } from "@/components/workflows/workflow-detail";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, RefreshCw, AlertCircle, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { WorkflowStatus } from "@/lib/types/workflow";

interface WorkflowDetailPageProps {
  params: Promise<{ instanceId: string }>;
}

function deriveWorkflowStatus(phase: string | null, runtimeStatus: string | null): WorkflowStatus | null {
  const normalizedPhase = phase?.toLowerCase() || "";
  const normalizedRuntimeStatus = runtimeStatus?.toUpperCase() || "";

  if (normalizedPhase === "awaiting_approval" || normalizedRuntimeStatus === "AWAITING_APPROVAL") {
    return "AWAITING_APPROVAL";
  }

  if (normalizedPhase === "executing" || normalizedPhase === "execution") {
    return "EXECUTING";
  }

  if (normalizedPhase === "planning" || normalizedPhase === "plan") {
    return "PLANNING";
  }

  if (normalizedPhase === "completed" || normalizedRuntimeStatus === "COMPLETED") {
    return "COMPLETED";
  }

  if (normalizedPhase === "rejected" || normalizedRuntimeStatus === "REJECTED") {
    return "REJECTED";
  }

  if (
    normalizedPhase === "failed" ||
    normalizedPhase === "tests_failed" ||
    normalizedRuntimeStatus === "FAILED"
  ) {
    return "FAILED";
  }

  if (normalizedRuntimeStatus === "RUNNING") {
    return "EXECUTING";
  }

  return null;
}

/**
 * Workflow Detail Page
 *
 * Displays the full details of a single workflow instance.
 * Auto-refreshes every 3 seconds.
 */
export default function WorkflowDetailPage({ params }: WorkflowDetailPageProps) {
  const { instanceId } = use(params);
  const decodedInstanceId = decodeURIComponent(instanceId);
  const { workflow, isLoading, isError, error, mutate } = useWorkflow(decodedInstanceId);
  const {
    phase: statusPhase,
    runtimeStatus,
    mutate: mutateStatus,
  } = useWorkflowStatus(decodedInstanceId, 2000);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isApproving, setIsApproving] = useState(false);
  const effectiveWorkflow = useMemo(() => {
    if (!workflow) {
      return null;
    }

    const liveStatus = deriveWorkflowStatus(statusPhase, runtimeStatus);
    if (!liveStatus) {
      return workflow;
    }

    return {
      ...workflow,
      status: liveStatus,
    };
  }, [runtimeStatus, statusPhase, workflow]);

  // Track when data is refreshed
  useEffect(() => {
    if (effectiveWorkflow) {
      setLastRefresh(new Date());
    }
  }, [effectiveWorkflow]);

  // Determine if workflow is active (needs live monitoring)
  const isActive = effectiveWorkflow?.status === "in_progress" ||
    effectiveWorkflow?.status === "PLANNING" ||
    effectiveWorkflow?.status === "AWAITING_APPROVAL" ||
    effectiveWorkflow?.status === "EXECUTING";

  // Handle workflow approval
  const handleApprove = useCallback(async () => {
    setIsApproving(true);
    try {
      const response = await fetch(`/api/workflows/${decodedInstanceId}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ approved: true }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to approve workflow");
      }

      toast.success("Workflow approved", {
        description: "The workflow will now begin execution.",
      });

      // Refresh workflow data
      await Promise.all([mutate(), mutateStatus()]);
    } catch (err) {
      toast.error("Failed to approve workflow", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsApproving(false);
    }
  }, [decodedInstanceId, mutate, mutateStatus]);

  // Handle workflow rejection
  const handleReject = useCallback(async () => {
    setIsApproving(true);
    try {
      const response = await fetch(`/api/workflows/${decodedInstanceId}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ approved: false }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to reject workflow");
      }

      toast.success("Workflow rejected", {
        description: "The workflow has been cancelled.",
      });

      // Refresh workflow data
      await Promise.all([mutate(), mutateStatus()]);
    } catch (err) {
      toast.error("Failed to reject workflow", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsApproving(false);
    }
  }, [decodedInstanceId, mutate, mutateStatus]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-4">
          <Link href="/workflows">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">
              {effectiveWorkflow?.plan?.title || "Workflow Details"}
            </h1>
            <p className="text-sm text-muted-foreground font-mono">
              {decodedInstanceId}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Live indicator for active workflows */}
          {isActive && (
            <Badge
              variant="outline"
              className={cn(
                "flex items-center gap-1.5 border-green-500 text-green-600",
                "dark:border-green-400 dark:text-green-400"
              )}
            >
              <Radio className="h-3 w-3 animate-pulse" />
              LIVE
            </Badge>
          )}

          {/* Auto-refresh indicator */}
          <span className="text-xs text-muted-foreground hidden sm:block">
            Auto-refresh: 3s
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void Promise.all([mutate(), mutateStatus()]);
            }}
            disabled={isLoading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto p-4">
        {isError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error loading workflow</AlertTitle>
            <AlertDescription>
              {error?.message || "Failed to load workflow details."}
            </AlertDescription>
          </Alert>
        )}

        {isLoading && !workflow ? (
          <WorkflowDetailSkeleton />
        ) : effectiveWorkflow ? (
          <WorkflowDetail
            workflow={effectiveWorkflow}
            onApprove={handleApprove}
            onReject={handleReject}
            isApproving={isApproving}
          />
        ) : isError ? (
          <div className="text-center py-12">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">
              {error?.message || "Failed to load workflow details."}
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void Promise.all([mutate(), mutateStatus()]);
                }}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
              <Link href="/workflows">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to list
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Workflow not found</p>
            <Link href="/workflows">
              <Button variant="link" className="mt-2">
                Return to workflow list
              </Button>
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
