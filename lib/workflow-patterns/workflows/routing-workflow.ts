/**
 * Routing Workflow (Dapr-Enhanced)
 *
 * Customer query classification and routing to specialized handlers.
 * With optional human approval for high-stakes routes.
 *
 * Dapr Features Used:
 * - setCustomStatus(): Real-time progress tracking
 * - isReplaying(): Conditional logging during replay
 * - waitForExternalEvent(): Human approval for high-stakes actions
 * - createTimer(): Approval timeout handling
 * - whenAny(): Race between approval and timeout
 *
 * Flow:
 * 1. Classify the customer query
 * 2. If high-stakes route AND approval required:
 *    a. Wait for manager approval OR timeout
 *    b. If rejected or timed out, escalate
 * 3. Route to appropriate handler based on classification
 * 4. Generate response using specialized handler
 */

import { type WorkflowContext, type TWorkflow, type Task } from "@dapr/dapr";
import type {
  RoutingInput,
  RoutingOutput,
  QueryClassification,
  ManagerApprovalEvent,
} from "../types";
import { HANDLER_CONFIGS } from "../activities/routing-activities";
import type { GenerateResponseOutput } from "../activities/routing-activities";

// Activity function references (resolved at runtime by name)
const classifyQueryActivity = "classifyQueryActivity";
const generateResponseActivity = "generateResponseActivity";

// Default approval timeout: 1 hour
const DEFAULT_APPROVAL_TIMEOUT_MS = 60 * 60 * 1000;

// High-stakes routes that may require approval
const HIGH_STAKES_ROUTES = ["refund", "complaint"];

/**
 * Routing Workflow (Dapr-Enhanced)
 *
 * This workflow demonstrates the intelligent routing pattern with Dapr features:
 * - Real-time status updates via setCustomStatus()
 * - Human approval via waitForExternalEvent()
 * - Timeout handling via createTimer() + whenAny()
 */
export const routingWorkflow: TWorkflow = async function* (
  ctx: WorkflowContext,
  input: RoutingInput
): AsyncGenerator<unknown, RoutingOutput, unknown> {
  const { query, customerId, humanOptions } = input;

  const requireApproval = humanOptions?.requireApproval ?? false;
  const approvalTimeout = humanOptions?.approvalTimeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS;
  const autoApproveThreshold = humanOptions?.autoApproveThreshold ?? 0.9;
  const alwaysRequireApprovalFor = humanOptions?.alwaysRequireApprovalFor ?? HIGH_STAKES_ROUTES;

  if (!ctx.isReplaying()) {
    console.log(`[Routing Workflow] Processing customer query${customerId ? ` for customer ${customerId}` : ""}`);
  }

  // ========================================================================
  // Step 1: Classify the Query
  // ========================================================================

  ctx.setCustomStatus("Classifying query...");

  const classification = (yield ctx.callActivity(classifyQueryActivity, {
    query,
    customerId,
  })) as QueryClassification;

  if (!ctx.isReplaying()) {
    console.log(`[Routing Workflow] Query classified as: ${classification.type} (confidence: ${(classification.confidence * 100).toFixed(0)}%)`);
  }

  // ========================================================================
  // Step 2: Check if Human Approval is Required
  // ========================================================================

  const isHighStakes = alwaysRequireApprovalFor.includes(classification.type);
  const belowAutoApproveThreshold = classification.confidence < autoApproveThreshold;
  const needsApproval = requireApproval && (isHighStakes || belowAutoApproveThreshold);

  let approvalResult: {
    approved: boolean;
    approverEmail?: string;
    reason?: string;
    timedOut?: boolean;
  } = { approved: true };

  if (needsApproval) {
    ctx.setCustomStatus(`Awaiting manager approval for ${classification.type} route...`);

    if (!ctx.isReplaying()) {
      console.log(`[Routing Workflow] Requesting manager approval (${isHighStakes ? "high-stakes route" : "low confidence"})`);
    }

    // Create approval event task and timeout timer
    const approvalTask = ctx.waitForExternalEvent("managerApproval");
    const timeoutTask = ctx.createTimer(new Date(Date.now() + approvalTimeout));

    // Race: approval OR timeout
    const raceResult = (yield ctx.whenAny([approvalTask, timeoutTask])) as Task<unknown>;

    if (approvalTask.isComplete) {
      // Got approval response
      const approval = (yield approvalTask) as ManagerApprovalEvent;
      approvalResult = {
        approved: approval.approved,
        approverEmail: approval.approverEmail,
        reason: approval.reason,
        timedOut: false,
      };

      if (!ctx.isReplaying()) {
        console.log(`[Routing Workflow] Manager ${approval.approved ? "approved" : "rejected"}: ${approval.reason || "no reason given"}`);
      }
    } else {
      // Timeout - treat as rejection for safety
      approvalResult = {
        approved: false,
        reason: `Approval timed out after ${approvalTimeout / 1000}s`,
        timedOut: true,
      };

      if (!ctx.isReplaying()) {
        console.log(`[Routing Workflow] Approval timed out after ${approvalTimeout}ms`);
      }
    }
  }

  // ========================================================================
  // Step 3: Handle Rejection/Timeout - Escalate
  // ========================================================================

  if (!approvalResult.approved) {
    ctx.setCustomStatus(`Escalated: ${approvalResult.reason}`);

    if (!ctx.isReplaying()) {
      console.log(`[Routing Workflow] Escalating due to: ${approvalResult.reason}`);
    }

    // Return escalation result
    const result: RoutingOutput = {
      classification,
      response: `Your request has been escalated for manual review. ${approvalResult.timedOut ? "The approval request timed out." : `Reason: ${approvalResult.reason}`} A support specialist will contact you within 24 hours.`,
      handlerModel: "escalation",
      escalationNeeded: true,
    };

    return result;
  }

  // ========================================================================
  // Step 4: Get Handler Configuration
  // ========================================================================

  const handlerConfig = HANDLER_CONFIGS[classification.type];

  ctx.setCustomStatus(`Routing to ${classification.type} handler...`);

  if (!ctx.isReplaying()) {
    console.log(`[Routing Workflow] Routing to ${classification.type} handler using ${handlerConfig.model}`);
  }

  // ========================================================================
  // Step 5: Generate Response with Specialized Handler
  // ========================================================================

  ctx.setCustomStatus(`Generating ${classification.type} response...`);

  const responseResult = (yield ctx.callActivity(generateResponseActivity, {
    query,
    classification,
    customerId,
    handlerConfig,
    approvalInfo: needsApproval ? approvalResult : undefined,
  })) as GenerateResponseOutput;

  if (!ctx.isReplaying()) {
    console.log(`[Routing Workflow] Response generated, escalation needed: ${responseResult.escalationNeeded}`);
  }

  // ========================================================================
  // Return Final Result
  // ========================================================================

  ctx.setCustomStatus(`Complete: ${classification.type} (${responseResult.escalationNeeded ? "escalated" : "resolved"})`);

  const result: RoutingOutput = {
    classification,
    response: responseResult.response,
    handlerModel: responseResult.handlerModel,
    escalationNeeded: responseResult.escalationNeeded,
  };

  return result;
};

/**
 * Get the workflow name for registration
 */
export function getRoutingWorkflowName(): string {
  return "routingWorkflow";
}
