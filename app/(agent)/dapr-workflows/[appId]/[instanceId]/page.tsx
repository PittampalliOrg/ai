"use client";

/**
 * Unified Workflow Detail Page
 *
 * This page handles two cases:
 * 1. Workflow name detail - when the param is a workflow type name (e.g., "planExecutionWorkflow")
 * 2. Execution detail - when the param is a workflow instance ID (UUID)
 *
 * Detection: UUIDs match the pattern xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  InputOutputSection,
  WorkflowDetailHeader,
  WorkflowDetailTabs,
  WorkflowNameStats,
  LatestExecutionsPanel,
  WorkflowDefinitionGraph,
} from "@/components/dapr-workflows";
import { PlatformLayout } from "@/components/platform";
import { useDaprWorkflow } from "@/hooks/use-dapr-workflows";
import { useWorkflowsByName } from "@/hooks/use-workflows-by-name";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if a string is a workflow instance ID
 * Matches:
 * - Standard UUIDs: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 * - Compact UUIDs: 32 hex chars without dashes (e.g., from uuid.hex in Python)
 * - Short workflow IDs: wf-xxxxxxxx or wf-xxxxxxxxxxxx (8-12 hex chars after "wf-")
 * - Planner workflow IDs: planner-xxxxxxxxxxxx (12 hex chars after "planner-")
 * - Dapr agent workflow IDs: dapr-agent-xxxxxxxxxxxx (12 hex chars after "dapr-agent-")
 */
function isInstanceId(str: string): boolean {
  // Standard UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // Compact UUID format (32 hex chars without dashes, e.g., from Python uuid.hex)
  const compactUuidRegex = /^[0-9a-f]{32}$/i;
  // Short workflow ID format (wf- followed by 8-12 hex chars)
  const shortIdRegex = /^wf-[0-9a-f]{8,12}$/i;
  // Planner workflow ID format (planner- followed by 12 hex chars)
  const plannerIdRegex = /^planner-[0-9a-f]{12}$/i;
  // Dapr agent workflow ID format (dapr-agent- followed by 12 hex chars)
  const daprAgentIdRegex = /^dapr-agent-[0-9a-f]{12}$/i;

  return uuidRegex.test(str) || compactUuidRegex.test(str) || shortIdRegex.test(str) || plannerIdRegex.test(str) || daprAgentIdRegex.test(str);
}

// ============================================================================
// Execution Detail View
// ============================================================================

interface ExecutionDetailViewProps {
  appId: string;
  instanceId: string;
}

function ExecutionDetailView({ appId, instanceId }: ExecutionDetailViewProps) {
  const router = useRouter();

  const { workflow, isLoading, isError, error, mutate } = useDaprWorkflow(
    appId,
    instanceId,
    3000
  );

  const handleRefresh = () => {
    mutate();
  };

  if (isLoading && !workflow) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="flex-1 p-6 space-y-6">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (isError || !workflow) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-destructive font-medium">
          {error?.message || "Workflow not found"}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => router.push("/dapr-workflows")}
        >
          Back to list
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Link href="/dapr-workflows">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1.5 text-sm">
              <Link
                href="/dapr-workflows"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Workflows
              </Link>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              <Link
                href={`/dapr-workflows/${appId}/${workflow.workflowType}`}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {workflow.workflowType}
              </Link>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-foreground font-medium truncate max-w-[200px]">
                {workflow.instanceId.substring(0, 8)}...
              </span>
            </nav>
            {/* Title */}
            <h1 className="text-lg font-semibold mt-0.5">Workflow Execution</h1>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-8">
          {/* Workflow Execution Details Section */}
          <section>
            <WorkflowDetailHeader workflow={workflow} />
          </section>

          {/* Input/Output Section */}
          <section>
            <h2 className="text-base font-semibold mb-4">Input / Output</h2>
            <InputOutputSection
              input={workflow.input}
              output={workflow.output}
              daprAgentOutput={workflow.daprAgentOutput}
            />
          </section>

          {/* Tabbed Section: Graph, History, Tasks, Relationships */}
          <section>
            <WorkflowDetailTabs
              events={workflow.executionHistory}
              output={workflow.output}
              daprAgentOutput={workflow.daprAgentOutput}
            />
          </section>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Workflow Name Detail View
// ============================================================================

interface WorkflowNameDetailViewProps {
  appId: string;
  workflowName: string;
}

function WorkflowNameDetailView({ appId, workflowName }: WorkflowNameDetailViewProps) {
  const router = useRouter();

  const { stats, latestExecutions, isLoading, isError, error, mutate } =
    useWorkflowsByName(
      { appId, workflowName, latestCount: 5 },
      5000
    );

  const handleRefresh = () => {
    mutate();
  };

  if (isLoading && !stats) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="flex-1 p-6 space-y-6">
          <Skeleton className="h-24 w-full" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-destructive font-medium">
          {error?.message || "Failed to load workflow data"}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => router.push("/dapr-workflows")}
        >
          Back to list
        </Button>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-muted-foreground">Workflow not found</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => router.push("/dapr-workflows")}
        >
          Back to list
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Link href="/dapr-workflows">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1.5 text-sm">
              <Link
                href={`/dapr-workflows?tab=names`}
                className="text-cyan-500 hover:text-cyan-400 transition-colors"
              >
                {appId}
              </Link>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              <Link
                href="/dapr-workflows"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Workflow names
              </Link>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-foreground font-medium">
                {workflowName}
              </span>
            </nav>
            {/* Title */}
            <h1 className="text-lg font-semibold mt-0.5">{workflowName}</h1>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          {/* Stats Cards */}
          <section>
            <WorkflowNameStats stats={stats} isLoading={isLoading} />
          </section>

          {/* Two Column Layout: Graph + Latest Executions */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Workflow Graph - use first completed execution as sample */}
            <WorkflowDefinitionGraph
              workflowName={workflowName}
              appId={appId}
              sampleInstanceId={
                latestExecutions.find((e) => e.status === "COMPLETED")?.instanceId ||
                latestExecutions[0]?.instanceId
              }
            />

            {/* Right: Latest Executions */}
            <LatestExecutionsPanel
              executions={latestExecutions}
              workflowName={workflowName}
              appId={appId}
              isLoading={isLoading}
            />
          </section>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function DaprWorkflowDetailPage() {
  const params = useParams();

  const appId = params.appId as string;
  const instanceId = params.instanceId as string;

  // Determine if this is a workflow name or instance ID based on format
  const isWorkflowInstance = isInstanceId(instanceId);

  if (isWorkflowInstance) {
    return (
      <PlatformLayout>
        <ExecutionDetailView appId={appId} instanceId={instanceId} />
      </PlatformLayout>
    );
  } else {
    // It's a workflow name
    return (
      <PlatformLayout>
        <WorkflowNameDetailView appId={appId} workflowName={instanceId} />
      </PlatformLayout>
    );
  }
}
