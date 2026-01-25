"use client";

import { use, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useWorkflow } from "@/hooks/use-workflows";
import { WorkflowDetail, WorkflowDetailSkeleton } from "@/components/workflows/workflow-detail";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, RefreshCw, AlertCircle, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface WorkflowDetailPageProps {
  params: Promise<{ instanceId: string }>;
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
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isApproving, setIsApproving] = useState(false);

  // Track when data is refreshed
  useEffect(() => {
    if (workflow) {
      setLastRefresh(new Date());
    }
  }, [workflow]);

  // Determine if workflow is active (needs live monitoring)
  const isActive = workflow?.status === "in_progress" ||
    workflow?.status === "PLANNING" ||
    workflow?.status === "AWAITING_APPROVAL" ||
    workflow?.status === "EXECUTING";

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
      mutate();
    } catch (err) {
      toast.error("Failed to approve workflow", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsApproving(false);
    }
  }, [decodedInstanceId, mutate]);

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
      mutate();
    } catch (err) {
      toast.error("Failed to reject workflow", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsApproving(false);
    }
  }, [decodedInstanceId, mutate]);

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
              {workflow?.plan?.title || "Workflow Details"}
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
            onClick={() => mutate()}
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
        ) : workflow ? (
          <WorkflowDetail
            workflow={workflow}
            onApprove={handleApprove}
            onReject={handleReject}
            isApproving={isApproving}
          />
        ) : !isError ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Workflow not found</p>
            <Link href="/workflows">
              <Button variant="link" className="mt-2">
                Return to workflow list
              </Button>
            </Link>
          </div>
        ) : null}
      </main>
    </div>
  );
}
