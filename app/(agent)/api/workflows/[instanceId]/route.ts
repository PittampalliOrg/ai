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

// Planner Dapr Agent service configuration
const PLANNER_DAPR_AGENT_URL =
  process.env.PLANNER_DAPR_AGENT_URL || "http://planner-dapr-agent.planner-agent.svc.cluster.local:8000";

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

  // Try planner-dapr-agent (for wf-* workflow IDs)
  if (instanceId.startsWith("wf-")) {
    try {
      const daprAgentUrl = `${PLANNER_DAPR_AGENT_URL}/status/${instanceId}`;
      console.log(`[Workflow Detail] Fetching workflow from ${daprAgentUrl}`);

      const response = await fetch(daprAgentUrl, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const data = await response.json();

        // Also get workflow details from /workflows/{id} endpoint
        let details: Record<string, unknown> = {};
        try {
          const detailsResponse = await fetch(`${PLANNER_DAPR_AGENT_URL}/workflows/${instanceId}`);
          if (detailsResponse.ok) {
            details = await detailsResponse.json();
          }
        } catch {
          // Ignore - details are optional
        }

        // Build execution logs from activities if available
        const activities = (details.activities || []) as Array<{
          activityName: string;
          status: string;
          startTime?: string;
          endTime?: string;
          durationMs?: number;
          durationFormatted?: string;
          input?: Record<string, unknown>;
          output?: Record<string, unknown>;
        }>;

        const executionLogs: ExecutionLog[] = [];
        for (const activity of activities) {
          if (activity.startTime) {
            executionLogs.push({
              timestamp: activity.startTime,
              taskId: activity.activityName,
              event: "started",
              message: `Starting: ${activity.activityName}`,
              // Store input directly in details for mapExecutionLogsToEvents to pick up
              details: activity.input,
            });
          }
          if (activity.endTime && activity.status === "completed") {
            executionLogs.push({
              timestamp: activity.endTime,
              taskId: activity.activityName,
              event: "completed",
              message: `Completed: ${activity.activityName}`,
              details: {
                duration: activity.durationFormatted || `${activity.durationMs}ms`,
                ...(activity.output || {}),
              },
            });
          }
        }

        // Parse output for plan details
        const rawOutput = data.output as Record<string, unknown> | null;
        const planContent = rawOutput?.plan as string | undefined;

        // Check if this is DaprAgentOutput format (has tasks, usage, or trace)
        const isDaprAgentOutput = rawOutput && (
          Array.isArray(rawOutput.tasks) ||
          (rawOutput.usage && typeof rawOutput.usage === "object") ||
          (rawOutput.trace && typeof rawOutput.trace === "object")
        );

        const workflow: WorkflowEntry & { workflowType?: string; source?: string; appId?: string; daprAgentOutput?: unknown } = {
          id: data.instance_id,
          status: (data.status?.toUpperCase() || "UNKNOWN") as WorkflowEntry["status"],
          createdAt: data.created_at || new Date().toISOString(),
          updatedAt: details.updatedAt as string || new Date().toISOString(),
          plan: planContent ? {
            id: instanceId,
            title: "Implementation Plan",
            summary: planContent.slice(0, 200) + "...",
            tasks: [{
              id: "plan",
              title: "Generated Plan",
              description: planContent,
              status: data.status === "completed" ? "completed" as const : "pending" as const,
            }],
          } : undefined,
          execution: {
            currentTaskIndex: executionLogs.filter(l => l.event === "completed").length,
            completedTasks: executionLogs.filter(l => l.event === "completed").map(l => l.taskId),
            failedTasks: [],
            skippedTasks: [],
            logs: executionLogs,
          },
          workflowType: "planner_workflow",
          source: "dapr-agent",
          appId: "planner-dapr-agent",
          // Preserve raw DaprAgentOutput for UI detection
          daprAgentOutput: isDaprAgentOutput ? rawOutput : undefined,
        };

        return NextResponse.json({ workflow });
      }

      if (response.status !== 404) {
        const errorText = await response.text();
        console.error(`[Workflow Detail] Planner Dapr Agent returned ${response.status}: ${errorText}`);
      }
    } catch (error) {
      console.log(`[Workflow Detail] Planner Dapr Agent unavailable, trying workflow-patterns`);
    }
  }

  // Try workflow-patterns
  try {
    // First check if the workflow exists in the index (works for planner-dapr-agent workflows)
    // This avoids needing to initialize the runtime for external agent workflows
    const indexEntry = await getWorkflowFromIndex(instanceId);

    // If found in index and has output (completed workflow), return it directly
    // This handles planner-dapr-agent workflows that don't need the runtime
    if (indexEntry && indexEntry.output) {
      console.log(`[Workflow Detail] Found ${instanceId} in index with output, returning directly`);

      // Check for planner-dapr-agent tasks in the index entry output
      const indexOutput = indexEntry.output as Record<string, unknown> | undefined;
      let plan: { id: string; title: string; summary: string; tasks: Array<{ id: string; title: string; description: string; status: "pending" | "completed" }> } | undefined;
      let execution: { currentTaskIndex: number; completedTasks: string[]; failedTasks: string[]; skippedTasks: string[]; logs: ExecutionLog[] } | undefined;

      if (indexOutput?.tasks && Array.isArray(indexOutput.tasks)) {
        const agentTasks = indexOutput.tasks as Array<{ id: string; subject: string; description: string; status: string; blockedBy: string[]; blocks: string[] }>;
        const inputMessage = (indexOutput.message as string) || (indexEntry.input as Record<string, unknown>)?.message as string;

        plan = {
          id: instanceId,
          title: inputMessage || `${indexEntry.workflowType} Workflow`,
          summary: `${agentTasks.length} implementation tasks with dependencies`,
          tasks: agentTasks.map(t => ({
            id: t.id,
            title: t.subject,
            description: t.description,
            status: indexEntry.status === "completed" ? "completed" as const : "pending" as const,
          })),
        };

        // Build execution logs from tasks
        const startTime = new Date(indexEntry.createdAt).getTime();
        const endTime = new Date(indexEntry.updatedAt).getTime();
        const taskDuration = (endTime - startTime) / agentTasks.length;

        const executionLogs: ExecutionLog[] = [];
        agentTasks.forEach((task, i) => {
          const taskStart = new Date(startTime + i * taskDuration).toISOString();
          const taskEnd = new Date(startTime + (i + 1) * taskDuration).toISOString();

          executionLogs.push({
            timestamp: taskStart,
            taskId: task.id,
            event: "started",
            message: `Creating task: ${task.subject}`,
          });

          if (indexEntry.status === "completed") {
            executionLogs.push({
              timestamp: taskEnd,
              taskId: task.id,
              event: "completed",
              message: `Created task: ${task.subject}`,
              details: { blockedBy: task.blockedBy, blocks: task.blocks },
            });
          }
        });

        execution = {
          currentTaskIndex: executionLogs.length,
          completedTasks: executionLogs.filter(l => l.event === "completed").map(l => l.taskId),
          failedTasks: [],
          skippedTasks: [],
          logs: executionLogs,
        };
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
          plan,
          execution,
          workflowType: indexEntry.workflowType,
          source: "patterns",
          appId: "workflow-patterns",
        } as WorkflowEntry & { workflowType?: string; source?: string; appId?: string },
      });
    }

    // For workflows not in the index or without output, try to initialize runtime
    let state = null;
    try {
      if (!isWorkflowPatternsRuntimeInitialized()) {
        await initializeWorkflowPatternsRuntime();
      }
      // Get workflow state from Dapr
      state = await getWorkflowPatternState(instanceId);
    } catch (runtimeError) {
      console.log(`[Workflow Detail] Runtime initialization failed, checking index only:`, runtimeError);
      // Continue without runtime - we'll check the index below
    }

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
      // Check index again in case it was updated
      const refreshedIndexEntry = indexEntry || await getWorkflowFromIndex(instanceId);
      if (!refreshedIndexEntry) {
        return NextResponse.json(
          { error: `Workflow with ID "${instanceId}" not found` },
          { status: 404 }
        );
      }

      // Check for planner-dapr-agent tasks in the index entry output
      const indexOutput2 = refreshedIndexEntry.output as Record<string, unknown> | undefined;
      let plan: { id: string; title: string; summary: string; tasks: Array<{ id: string; title: string; description: string; status: "pending" | "completed" }> } | undefined;
      let execution: { currentTaskIndex: number; completedTasks: string[]; failedTasks: string[]; skippedTasks: string[]; logs: ExecutionLog[] } | undefined;

      if (indexOutput2?.tasks && Array.isArray(indexOutput2.tasks)) {
        const agentTasks = indexOutput2.tasks as Array<{ id: string; subject: string; description: string; status: string; blockedBy: string[]; blocks: string[] }>;
        const inputMessage = (indexOutput2.message as string) || (refreshedIndexEntry.input as Record<string, unknown>)?.message as string;

        plan = {
          id: instanceId,
          title: inputMessage || `${refreshedIndexEntry.workflowType} Workflow`,
          summary: `${agentTasks.length} implementation tasks with dependencies`,
          tasks: agentTasks.map(t => ({
            id: t.id,
            title: t.subject,
            description: t.description,
            status: refreshedIndexEntry.status === "completed" ? "completed" as const : "pending" as const,
          })),
        };

        // Build execution logs from tasks
        const startTime = new Date(refreshedIndexEntry.createdAt).getTime();
        const endTime = new Date(refreshedIndexEntry.updatedAt).getTime();
        const taskDuration = (endTime - startTime) / agentTasks.length;

        const executionLogs: ExecutionLog[] = [];
        agentTasks.forEach((task, i) => {
          const taskStart = new Date(startTime + i * taskDuration).toISOString();
          const taskEnd = new Date(startTime + (i + 1) * taskDuration).toISOString();

          executionLogs.push({
            timestamp: taskStart,
            taskId: task.id,
            event: "started",
            message: `Creating task: ${task.subject}`,
          });

          if (refreshedIndexEntry.status === "completed") {
            executionLogs.push({
              timestamp: taskEnd,
              taskId: task.id,
              event: "completed",
              message: `Created task: ${task.subject}`,
              details: { blockedBy: task.blockedBy, blocks: task.blocks },
            });
          }
        });

        execution = {
          currentTaskIndex: executionLogs.length,
          completedTasks: executionLogs.filter(l => l.event === "completed").map(l => l.taskId),
          failedTasks: [],
          skippedTasks: [],
          logs: executionLogs,
        };
      }

      // Return index data as a workflow entry
      return NextResponse.json({
        workflow: {
          id: refreshedIndexEntry.instanceId,
          status: refreshedIndexEntry.status.toUpperCase(),
          createdAt: refreshedIndexEntry.createdAt,
          updatedAt: refreshedIndexEntry.updatedAt,
          request: refreshedIndexEntry.input ? {
            prompt: JSON.stringify(refreshedIndexEntry.input),
            submittedAt: refreshedIndexEntry.createdAt,
          } : undefined,
          plan,
          execution,
          // Pattern-specific fields
          workflowType: refreshedIndexEntry.workflowType,
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

    // Get index entry for additional metadata (reuse if already fetched)
    const stateIndexEntry = indexEntry || await getWorkflowFromIndex(instanceId);
    console.log(`[Workflow Detail] indexEntry for ${instanceId}:`,
      stateIndexEntry ? {
        workflowType: stateIndexEntry.workflowType,
        hasOutput: !!stateIndexEntry.output,
        outputKeys: stateIndexEntry.output ? Object.keys(stateIndexEntry.output) : [],
        tasksCount: (stateIndexEntry.output as Record<string, unknown>)?.tasks ?
          ((stateIndexEntry.output as Record<string, unknown>).tasks as unknown[]).length : 0
      } : 'null');

    // Build execution logs based on pattern type
    const executionLogs = buildPatternExecutionLogs(
      stateIndexEntry?.workflowType || "unknown",
      state.runtimeStatus,
      state.createdAt.toISOString(),
      state.lastUpdatedAt.toISOString(),
      typeof customStatus === "string" ? customStatus : undefined,
      output
    );

    // Extract plan data from output if available
    let planTitle = stateIndexEntry?.workflowType ? `${stateIndexEntry.workflowType} Pattern` : "Workflow Pattern";
    let planSummary = typeof customStatus === "string" ? customStatus : "Pattern workflow execution";
    let planSteps: Array<{ title: string; description: string }> = [];
    let agentTasks: Array<{ id: string; subject: string; description: string; status: string; blockedBy: string[]; blocks: string[] }> = [];

    // Check for planner-dapr-agent tasks in the index entry output
    const stateIndexOutput = stateIndexEntry?.output as Record<string, unknown> | undefined;
    if (stateIndexOutput?.tasks && Array.isArray(stateIndexOutput.tasks)) {
      agentTasks = stateIndexOutput.tasks as typeof agentTasks;
      const inputMessage = (stateIndexOutput.message as string) || (stateIndexEntry?.input as Record<string, unknown>)?.message as string;
      if (inputMessage) {
        planTitle = inputMessage;
      }
      planSummary = `${agentTasks.length} implementation tasks with dependencies`;
    }

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

    // Build task list and execution logs from agent tasks if available
    let planTasks: Array<{ id: string; title: string; description: string; status: "pending" | "in_progress" | "completed" }>;
    let finalExecutionLogs: ExecutionLog[];

    if (agentTasks.length > 0) {
      // Use actual tasks from planner-dapr-agent
      planTasks = agentTasks.map(t => ({
        id: t.id,
        title: t.subject,
        description: t.description,
        status: state.runtimeStatus === "COMPLETED" ? "completed" as const : "pending" as const,
      }));

      // Build execution logs from tasks
      const startTime = state.createdAt.getTime();
      const endTime = state.lastUpdatedAt.getTime();
      const taskDuration = (endTime - startTime) / agentTasks.length;

      finalExecutionLogs = [];
      agentTasks.forEach((task, i) => {
        const taskStart = new Date(startTime + i * taskDuration).toISOString();
        const taskEnd = new Date(startTime + (i + 1) * taskDuration).toISOString();

        finalExecutionLogs.push({
          timestamp: taskStart,
          taskId: task.id,
          event: "started",
          message: `Creating task: ${task.subject}`,
        });

        if (state.runtimeStatus === "COMPLETED") {
          finalExecutionLogs.push({
            timestamp: taskEnd,
            taskId: task.id,
            event: "completed",
            message: `Created task: ${task.subject}`,
            details: { blockedBy: task.blockedBy, blocks: task.blocks },
          });
        }
      });
    } else {
      // Fallback to pattern steps
      planTasks = planSteps.map((s, i) => ({
        id: `step-${i}`,
        title: s.title,
        description: s.description,
        status: state.runtimeStatus === "COMPLETED" ? "completed" as const : "pending" as const,
      }));
      finalExecutionLogs = executionLogs;
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
        tasks: planTasks,
      },
      // Add execution logs for the graph
      execution: {
        currentTaskIndex: finalExecutionLogs.length,
        completedTasks: finalExecutionLogs.filter(l => l.event === "completed").map(l => l.taskId),
        failedTasks: finalExecutionLogs.filter(l => l.event === "failed").map(l => l.taskId),
        skippedTasks: [],
        logs: finalExecutionLogs,
      },
      // Pattern-specific fields
      workflowType: stateIndexEntry?.workflowType,
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
