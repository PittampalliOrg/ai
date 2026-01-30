/**
 * Workflow Detail API
 *
 * GET /api/workflows/[instanceId]
 * Fetches workflow status from either:
 * 1. The workflow-orchestrator service (for Ralph workflows)
 * 2. The workflow-patterns Dapr runtime (for pattern workflows)
 */

import { NextResponse, type NextRequest } from "next/server";
import type { WorkflowEntry, ExecutionLog } from "@/lib/types/workflow";
import {
  getWorkflowPatternState,
  isWorkflowPatternsRuntimeInitialized,
  initializeWorkflowPatternsRuntime,
} from "@/lib/workflow-patterns/runtime";
import { getWorkflow as getWorkflowFromIndex, syncWorkflowFromDapr } from "@/lib/workflow-patterns/workflow-index";

// Workflow orchestrator service configuration
const WORKFLOW_SERVICE_URL =
  process.env.WORKFLOW_SERVICE_URL || "http://workflow-orchestrator.dapr-agents.svc.cluster.local:80";

// Planner orchestrator service configuration
const PLANNER_SERVICE_URL =
  process.env.PLANNER_SERVICE_URL || "http://planner-agent.planner-agent.svc.cluster.local:8080";

// ============================================================================
// Pattern Step Definitions
// ============================================================================

const PATTERN_STEPS: Record<string, { id: string; name: string }[]> = {
  sequential: [
    { id: "validate", name: "Validate Repository" },
    { id: "clone", name: "Clone Repository" },
    { id: "plan", name: "Create Plan" },
    { id: "approval", name: "Wait for Approval" },
  ],
  parallel: [
    { id: "security", name: "Security Review" },
    { id: "performance", name: "Performance Review" },
    { id: "maintainability", name: "Maintainability Review" },
    { id: "summarize", name: "Summarize Reviews" },
  ],
  routing: [
    { id: "classify", name: "Classify Query" },
    { id: "route", name: "Route to Handler" },
    { id: "respond", name: "Generate Response" },
  ],
  orchestrator: [
    { id: "plan", name: "Plan Implementation" },
    { id: "execute", name: "Execute File Changes" },
    { id: "validate", name: "Validate Changes" },
  ],
  evaluator: [
    { id: "translate", name: "Initial Translation" },
    { id: "evaluate", name: "Evaluate Translation" },
    { id: "improve", name: "Improve Translation (loop)" },
  ],
};

/**
 * Build execution logs for pattern workflows based on status
 */
function buildPatternExecutionLogs(
  workflowType: string,
  runtimeStatus: string,
  createdAt: string,
  updatedAt: string,
  customStatus?: string,
  output?: unknown
): ExecutionLog[] {
  const logs: ExecutionLog[] = [];
  const steps = PATTERN_STEPS[workflowType] || [
    { id: "step1", name: "Step 1" },
    { id: "step2", name: "Step 2" },
    { id: "step3", name: "Step 3" },
  ];

  const startTime = new Date(createdAt).getTime();
  const endTime = new Date(updatedAt).getTime();
  const isCompleted = runtimeStatus === "COMPLETED";
  const isFailed = runtimeStatus === "FAILED";
  const isRunning = runtimeStatus === "RUNNING";

  // Calculate step timing
  const totalDuration = endTime - startTime;
  const stepDuration = totalDuration / steps.length;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepStartTime = new Date(startTime + i * stepDuration).toISOString();
    const stepEndTime = new Date(startTime + (i + 1) * stepDuration).toISOString();

    // Determine step status based on workflow status
    let stepEvent: ExecutionLog["event"];
    if (isCompleted) {
      stepEvent = "completed";
    } else if (isFailed && i === steps.length - 1) {
      stepEvent = "failed";
    } else if (isRunning) {
      // For running workflows, mark completed steps and current step
      const currentStepIndex = customStatus
        ? steps.findIndex(s => customStatus.toLowerCase().includes(s.name.toLowerCase().split(" ")[0]))
        : Math.floor((Date.now() - startTime) / stepDuration);

      if (i < currentStepIndex) {
        stepEvent = "completed";
      } else if (i === currentStepIndex) {
        stepEvent = "started";
      } else {
        continue; // Don't add future steps
      }
    } else {
      stepEvent = "completed";
    }

    // Add started event
    logs.push({
      timestamp: stepStartTime,
      taskId: step.id,
      event: "started",
      message: `Starting: ${step.name}`,
    });

    // Add completed/failed event (if not just started)
    if (stepEvent !== "started") {
      logs.push({
        timestamp: stepEndTime,
        taskId: step.id,
        event: stepEvent,
        message: stepEvent === "completed"
          ? `Completed: ${step.name}`
          : `Failed: ${step.name}`,
        details: output && isCompleted && i === steps.length - 1 ? output : undefined,
      });
    }
  }

  return logs;
}

interface RouteParams {
  params: Promise<{ instanceId: string }>;
}

/**
 * GET /api/workflows/[instanceId]
 *
 * Fetches workflow status from the workflow-orchestrator service first,
 * then falls back to workflow-patterns if not found.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { instanceId } = await params;

  if (!instanceId) {
    return NextResponse.json(
      { error: "Instance ID is required" },
      { status: 400 }
    );
  }

  // First, try the workflow-orchestrator service
  try {
    const workflowUrl = `${WORKFLOW_SERVICE_URL}/api/workflows/${instanceId}`;
    console.log(`[Workflow Detail] Fetching workflow from ${workflowUrl}`);

    const response = await fetch(workflowUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json() as WorkflowEntry;
      return NextResponse.json({ workflow: data });
    }

    // If not 404, it's a real error from orchestrator
    if (response.status !== 404) {
      const errorText = await response.text();
      console.error(`[Workflow Detail] Service returned ${response.status}: ${errorText}`);
      return NextResponse.json(
        { error: `Workflow service error: ${response.status}` },
        { status: response.status }
      );
    }

    // 404 - try planner-orchestrator next
    console.log(`[Workflow Detail] Not found in orchestrator, trying planner-orchestrator`);
  } catch (error) {
    // Connection error to orchestrator - still try planner
    console.log(`[Workflow Detail] Orchestrator unavailable, trying planner-orchestrator`);
  }

  // Try planner-orchestrator (for planner-* and dapr-agent-* workflow IDs)
  if (instanceId.startsWith("planner-") || instanceId.startsWith("dapr-agent-")) {
    try {
      const plannerUrl = `${PLANNER_SERVICE_URL}/api/workflows/${instanceId}/status`;
      console.log(`[Workflow Detail] Fetching workflow from ${plannerUrl}`);

      const response = await fetch(plannerUrl, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const data = await response.json();

        // Also fetch tasks for the workflow
        let tasks: Array<{ id: string; subject: string; description: string; status: string }> = [];
        try {
          const tasksResponse = await fetch(`${PLANNER_SERVICE_URL}/api/workflows/${instanceId}/tasks`);
          if (tasksResponse.ok) {
            const tasksData = await tasksResponse.json();
            tasks = tasksData.tasks || [];
          }
        } catch {
          console.log(`[Workflow Detail] Could not fetch tasks for ${instanceId}`);
        }

        // Transform planner response to WorkflowEntry format
        const workflow: WorkflowEntry & { workflowType?: string; source?: string; appId?: string } = {
          id: data.workflow_id,
          status: (data.runtime_status || "UNKNOWN") as WorkflowEntry["status"],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          plan: tasks.length > 0 ? {
            id: instanceId,
            title: data.message || "Planner Workflow",
            summary: `Phase: ${data.phase || "unknown"}, Progress: ${data.progress || 0}%`,
            tasks: tasks.map((t) => ({
              id: t.id,
              title: t.subject,
              description: t.description,
              status: t.status === "completed" ? "completed" as const :
                      t.status === "in_progress" ? "in_progress" as const : "pending" as const,
            })),
          } : undefined,
          execution: {
            currentTaskIndex: tasks.filter(t => t.status === "completed").length,
            completedTasks: tasks.filter(t => t.status === "completed").map(t => t.id),
            failedTasks: [],
            skippedTasks: [],
            logs: tasks
              .filter(t => t.status === "completed" || t.status === "in_progress")
              .map((t) => ({
                timestamp: new Date().toISOString(),
                taskId: t.id,
                event: t.status === "completed" ? "completed" as const : "started" as const,
                message: t.subject,
              })),
          },
          workflowType: "planner",
          source: "planner",
          appId: "planner-orchestrator",
        };

        return NextResponse.json({ workflow });
      }

      if (response.status !== 404) {
        const errorText = await response.text();
        console.error(`[Workflow Detail] Planner returned ${response.status}: ${errorText}`);
      }
    } catch (error) {
      console.log(`[Workflow Detail] Planner unavailable, trying workflow-patterns`);
    }
  }

  // Try workflow-patterns
  try {
    // Initialize runtime if needed
    if (!isWorkflowPatternsRuntimeInitialized()) {
      await initializeWorkflowPatternsRuntime();
    }

    // Get workflow state from Dapr
    const state = await getWorkflowPatternState(instanceId);

    // Sync status to index if we have state
    if (state) {
      try {
        await syncWorkflowFromDapr(instanceId, {
          runtimeStatus: state.runtimeStatus,
          customStatus: state.serializedCustomStatus,
          serializedOutput: state.serializedOutput,
        });
      } catch (syncError) {
        console.error(`[Workflow Detail] Failed to sync status for ${instanceId}:`, syncError);
      }
    }

    if (!state) {
      // Also check the index for metadata
      const indexEntry = await getWorkflowFromIndex(instanceId);
      if (!indexEntry) {
        return NextResponse.json(
          { error: `Workflow with ID "${instanceId}" not found` },
          { status: 404 }
        );
      }

      // Return index data as a workflow entry
      return NextResponse.json({
        workflow: {
          id: indexEntry.instanceId,
          status: indexEntry.status.toUpperCase(),
          createdAt: indexEntry.createdAt,
          updatedAt: indexEntry.updatedAt,
          request: indexEntry.input ? {
            prompt: JSON.stringify(indexEntry.input),
            submittedAt: indexEntry.createdAt,
          } : undefined,
          // Pattern-specific fields
          workflowType: indexEntry.workflowType,
          source: "patterns",
        } as WorkflowEntry & { workflowType?: string; source?: string },
      });
    }

    // Parse serialized data
    let input: unknown;
    let output: unknown;
    let customStatus: unknown;

    try {
      if (state.serializedInput) {
        input = JSON.parse(state.serializedInput);
      }
    } catch {
      input = state.serializedInput;
    }

    try {
      if (state.serializedOutput) {
        output = JSON.parse(state.serializedOutput);
      }
    } catch {
      output = state.serializedOutput;
    }

    try {
      if (state.serializedCustomStatus) {
        customStatus = JSON.parse(state.serializedCustomStatus);
      }
    } catch {
      customStatus = state.serializedCustomStatus;
    }

    // Get index entry for additional metadata
    const indexEntry = await getWorkflowFromIndex(instanceId);

    // Build execution logs based on pattern type
    const executionLogs = buildPatternExecutionLogs(
      indexEntry?.workflowType || "unknown",
      state.runtimeStatus,
      state.createdAt.toISOString(),
      state.lastUpdatedAt.toISOString(),
      typeof customStatus === "string" ? customStatus : undefined,
      output
    );

    // Extract plan data from output if available
    let planTitle = indexEntry?.workflowType ? `${indexEntry.workflowType} Pattern` : "Workflow Pattern";
    let planSummary = typeof customStatus === "string" ? customStatus : "Pattern workflow execution";
    let planSteps: Array<{ title: string; description: string }> = [];

    // Try to get actual plan data from workflow output
    if (output && typeof output === "object") {
      const outputObj = output as Record<string, unknown>;

      // Check for plan in output (sequential workflow format)
      if (outputObj.plan && typeof outputObj.plan === "object") {
        const planData = outputObj.plan as Record<string, unknown>;
        if (planData.title && typeof planData.title === "string") {
          planTitle = planData.title;
        }
        if (planData.summary && typeof planData.summary === "string") {
          planSummary = planData.summary;
        }
        if (Array.isArray(planData.steps)) {
          planSteps = planData.steps.map((s: Record<string, unknown>) => ({
            title: String(s.title || ""),
            description: String(s.description || ""),
          }));
        }
      }

      // Check for repository info as fallback title
      if (planTitle.includes("Pattern") && outputObj.repository && typeof outputObj.repository === "object") {
        const repo = outputObj.repository as Record<string, unknown>;
        if (repo.owner && repo.repo) {
          planTitle = `${repo.owner}/${repo.repo}`;
        }
      }
    }

    // Build workflow entry from Dapr state
    const workflow: WorkflowEntry & { workflowType?: string; source?: string } = {
      id: state.instanceId,
      status: state.runtimeStatus as WorkflowEntry["status"],
      createdAt: state.createdAt.toISOString(),
      updatedAt: state.lastUpdatedAt.toISOString(),
      request: input ? {
        prompt: typeof input === "object" ? JSON.stringify(input) : String(input),
        submittedAt: state.createdAt.toISOString(),
      } : undefined,
      // Include output in a plan-like structure for the UI
      plan: {
        id: instanceId,
        title: planTitle,
        summary: planSummary,
        tasks: planSteps.map((s, i) => ({
          id: `step-${i}`,
          title: s.title,
          description: s.description,
          status: state.runtimeStatus === "COMPLETED" ? "completed" as const : "pending" as const,
        })),
      },
      // Add execution logs for the graph
      execution: {
        currentTaskIndex: executionLogs.length,
        completedTasks: executionLogs.filter(l => l.event === "completed").map(l => l.taskId),
        failedTasks: executionLogs.filter(l => l.event === "failed").map(l => l.taskId),
        skippedTasks: [],
        logs: executionLogs,
      },
      // Pattern-specific fields
      workflowType: indexEntry?.workflowType,
      source: "patterns",
    };

    return NextResponse.json({ workflow });
  } catch (error) {
    console.error(`[Workflow Detail] Error fetching from patterns:`, error);

    // Check if runtime is disabled
    if (error instanceof Error && error.message.includes("disabled")) {
      return NextResponse.json(
        { error: `Workflow with ID "${instanceId}" not found` },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch workflow",
      },
      { status: 500 }
    );
  }
}
