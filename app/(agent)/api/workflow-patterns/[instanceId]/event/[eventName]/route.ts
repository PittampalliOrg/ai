/**
 * Workflow Pattern External Event API
 *
 * POST /api/workflow-patterns/[instanceId]/event/[eventName]
 *
 * Raises an external event to a running workflow instance.
 * This enables human-in-the-loop patterns like approval workflows
 * and human feedback loops.
 *
 * Dapr Feature: raiseEvent() on DaprWorkflowClient
 */

import { NextRequest, NextResponse } from "next/server";
import {
  initializeWorkflowPatternsRuntime,
  getWorkflowPatternsClient,
  getWorkflowPatternState,
} from "@/lib/workflow-patterns/runtime";
import type {
  HumanFeedbackEvent,
  ManagerApprovalEvent,
  PlanApprovalEvent,
  ExternalEventType,
} from "@/lib/workflow-patterns/types";

/**
 * Validate event payload based on event type
 */
function validateEventPayload(
  eventName: ExternalEventType,
  payload: unknown
): { valid: boolean; error?: string } {
  switch (eventName) {
    case "humanFeedback": {
      const event = payload as Partial<HumanFeedbackEvent>;
      if (!event.feedback || typeof event.feedback !== "string") {
        return { valid: false, error: "humanFeedback event requires 'feedback' string" };
      }
      return { valid: true };
    }

    case "managerApproval": {
      const event = payload as Partial<ManagerApprovalEvent>;
      if (typeof event.approved !== "boolean") {
        return { valid: false, error: "managerApproval event requires 'approved' boolean" };
      }
      return { valid: true };
    }

    case "plan_approval": {
      const event = payload as Partial<PlanApprovalEvent>;
      if (typeof event.approved !== "boolean") {
        return { valid: false, error: "plan_approval event requires 'approved' boolean" };
      }
      return { valid: true };
    }

    case "continue":
      // No validation needed - any payload is fine
      return { valid: true };

    case "cancel":
      // No validation needed
      return { valid: true };

    default:
      return { valid: false, error: `Unknown event type: ${eventName}` };
  }
}

/**
 * POST /api/workflow-patterns/[instanceId]/event/[eventName]
 *
 * Raises an external event to a workflow instance.
 *
 * Request body (depends on event type):
 * - humanFeedback: { feedback: string, suggestions?: string[], approved?: boolean }
 * - managerApproval: { approved: boolean, approverEmail?: string, reason?: string }
 * - continue: any (or empty)
 * - cancel: any (or empty)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ instanceId: string; eventName: string }> }
) {
  try {
    const { instanceId, eventName } = await params;

    // Initialize workflow runtime
    await initializeWorkflowPatternsRuntime();
    const client = getWorkflowPatternsClient();

    // Get workflow state to verify it exists and is running
    const state = await getWorkflowPatternState(instanceId);

    if (!state) {
      return NextResponse.json(
        { error: "Workflow instance not found", instanceId },
        { status: 404 }
      );
    }

    // Check if workflow is in a state that can receive events
    if (state.runtimeStatus !== "RUNNING") {
      return NextResponse.json(
        {
          error: `Workflow is not running (status: ${state.runtimeStatus})`,
          instanceId,
          status: state.runtimeStatus,
        },
        { status: 400 }
      );
    }

    // Parse event payload
    let eventData: unknown;
    try {
      const body = await request.text();
      eventData = body ? JSON.parse(body) : {};
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    // Validate event type and payload
    const validation = validateEventPayload(eventName as ExternalEventType, eventData);
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error, eventName },
        { status: 400 }
      );
    }

    // Raise the event
    console.log(`[Workflow Patterns] Raising event '${eventName}' for workflow ${instanceId}`);
    await client.raiseEvent(instanceId, eventName, eventData);

    return NextResponse.json({
      success: true,
      instanceId,
      eventName,
      eventData,
      message: `Event '${eventName}' raised successfully`,
    });
  } catch (error) {
    console.error("[Workflow Patterns Event] Error:", error);

    const message = error instanceof Error ? error.message : "Unknown error";

    // Check for specific error types
    if (message.includes("disabled")) {
      return NextResponse.json(
        { error: message },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: `Failed to raise event: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/workflow-patterns/[instanceId]/event/[eventName]
 *
 * Get information about what events a workflow is waiting for.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ instanceId: string; eventName: string }> }
) {
  try {
    const { instanceId, eventName } = await params;

    // Initialize workflow runtime
    await initializeWorkflowPatternsRuntime();

    // Get workflow state
    const state = await getWorkflowPatternState(instanceId);

    if (!state) {
      return NextResponse.json(
        { error: "Workflow instance not found", instanceId },
        { status: 404 }
      );
    }

    // Parse custom status to see if we're waiting for this event
    const customStatus = state.serializedCustomStatus
      ? JSON.parse(state.serializedCustomStatus)
      : null;

    const isWaitingForEvent =
      state.runtimeStatus === "RUNNING" &&
      customStatus &&
      typeof customStatus === "string" &&
      customStatus.toLowerCase().includes("awaiting");

    return NextResponse.json({
      instanceId,
      eventName,
      workflowStatus: state.runtimeStatus,
      customStatus,
      isWaitingForEvent,
      eventSchema: getEventSchema(eventName as ExternalEventType),
    });
  } catch (error) {
    console.error("[Workflow Patterns Event] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to get event info: ${message}` },
      { status: 500 }
    );
  }
}

/**
 * Get the expected schema for an event type
 */
function getEventSchema(eventName: ExternalEventType): Record<string, unknown> {
  switch (eventName) {
    case "humanFeedback":
      return {
        type: "object",
        required: ["feedback"],
        properties: {
          feedback: { type: "string", description: "Human feedback text" },
          suggestions: { type: "array", items: { type: "string" }, description: "List of suggestions" },
          approved: { type: "boolean", description: "Whether the human approves" },
        },
      };

    case "managerApproval":
      return {
        type: "object",
        required: ["approved"],
        properties: {
          approved: { type: "boolean", description: "Whether the manager approves" },
          approverEmail: { type: "string", description: "Email of the approver" },
          reason: { type: "string", description: "Reason for approval/rejection" },
        },
      };

    case "plan_approval":
      return {
        type: "object",
        required: ["approved"],
        properties: {
          approved: { type: "boolean", description: "Whether the plan is approved" },
          comments: { type: "string", description: "Optional comments about approval/rejection" },
        },
      };

    case "continue":
      return {
        type: "object",
        properties: {},
        description: "Signal to continue the workflow",
      };

    case "cancel":
      return {
        type: "object",
        properties: {},
        description: "Signal to cancel the workflow",
      };

    default:
      return {};
  }
}
