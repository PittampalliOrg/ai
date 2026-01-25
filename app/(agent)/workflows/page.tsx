"use client";

import { useWorkflows } from "@/hooks/use-workflows";
import { WorkflowList } from "@/components/workflows/workflow-list";
import { NewWorkflowDialog } from "@/components/workflows/new-workflow-dialog";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Workflows List Page
 *
 * Displays all workflow instances from the workflow-orchestrator service.
 * Auto-refreshes every 5 seconds.
 */
export default function WorkflowsPage() {
  const { workflows, total, isLoading, isError, error, mutate } = useWorkflows();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b">
        <div>
          <h1 className="text-2xl font-bold">Workflows</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "Loading workflows..."
              : `${total} workflow${total !== 1 ? "s" : ""} found`}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <NewWorkflowDialog onWorkflowStarted={() => mutate()} />
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto p-4">
        {isError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error loading workflows</AlertTitle>
            <AlertDescription>
              {error?.message || "Failed to connect to the workflow state store."}
              <br />
              <span className="text-xs">
                Make sure Redis is port-forwarded to localhost:6380
              </span>
            </AlertDescription>
          </Alert>
        )}

        <WorkflowList workflows={workflows} isLoading={isLoading} />
      </main>
    </div>
  );
}
