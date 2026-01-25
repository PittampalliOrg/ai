/**
 * Parallel Workflow (Dapr-Enhanced)
 *
 * Concurrent code reviews from multiple perspectives with timeout handling.
 *
 * Dapr Features Used:
 * - setCustomStatus(): Real-time progress tracking
 * - isReplaying(): Conditional logging during replay
 * - whenAll(): Parallel task execution
 * - whenAny(): Race condition for timeout handling
 * - createTimer(): Timeout implementation
 *
 * Flow:
 * 1. Launch security, performance, and maintainability reviews concurrently
 * 2. Wait for all reviews OR timeout (whichever comes first)
 * 3. Aggregate and summarize the results (with partial results if timed out)
 */

import { type WorkflowContext, type TWorkflow, type Task } from "@dapr/dapr";
import type {
  ParallelInput,
  ParallelOutput,
  CodeReview,
} from "../types";
import type { SummarizeReviewsOutput } from "../activities/parallel-activities";

// Activity function references (resolved at runtime by name)
const securityReviewActivity = "securityReviewActivity";
const performanceReviewActivity = "performanceReviewActivity";
const maintainabilityReviewActivity = "maintainabilityReviewActivity";
const summarizeReviewsActivity = "summarizeReviewsActivity";

// Default timeout: 3 minutes for all reviews
const DEFAULT_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * Parallel Workflow (Dapr-Enhanced)
 *
 * This workflow demonstrates the parallel processing pattern with Dapr features:
 * - Real-time status updates via setCustomStatus()
 * - Parallel execution via whenAll()
 * - Timeout handling via whenAny() + createTimer()
 * - Graceful degradation with partial results
 */
export const parallelWorkflow: TWorkflow = async function* (
  ctx: WorkflowContext,
  input: ParallelInput
): AsyncGenerator<unknown, ParallelOutput, unknown> {
  const { code, language, timeoutOptions } = input;
  const timeoutMs = timeoutOptions?.workflowTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (!ctx.isReplaying()) {
    console.log(`[Parallel Workflow] Starting concurrent code reviews for ${language}`);
  }

  // ========================================================================
  // Step 1: Launch Parallel Reviews
  // ========================================================================

  ctx.setCustomStatus("Launching parallel code reviews...");

  // Create tasks for parallel execution
  const securityTask = ctx.callActivity(securityReviewActivity, { code, language });
  const performanceTask = ctx.callActivity(performanceReviewActivity, { code, language });
  const maintainabilityTask = ctx.callActivity(maintainabilityReviewActivity, { code, language });

  // Bundle all reviews into a single parallel task
  const allReviewsTask = ctx.whenAll([
    securityTask,
    performanceTask,
    maintainabilityTask,
  ]);

  // Create timeout timer - must pass Date object, not timestamp
  const timeoutTask = ctx.createTimer(new Date(Date.now() + timeoutMs));

  if (!ctx.isReplaying()) {
    console.log(`[Parallel Workflow] Launched 3 parallel review tasks with ${timeoutMs}ms timeout`);
  }

  // ========================================================================
  // Step 2: Wait for All Reviews OR Timeout
  // ========================================================================

  ctx.setCustomStatus("Waiting for reviews (with timeout)...");

  // Race: all reviews complete OR timeout
  const raceResult = (yield ctx.whenAny([allReviewsTask, timeoutTask])) as Task<unknown>;

  let reviews: CodeReview[];
  let timedOut = false;

  // Check if we got the reviews or timed out
  if (allReviewsTask.isComplete) {
    // All reviews completed before timeout
    const [securityReview, performanceReview, maintainabilityReview] =
      (yield allReviewsTask) as [CodeReview, CodeReview, CodeReview];

    reviews = [securityReview, performanceReview, maintainabilityReview];

    if (!ctx.isReplaying()) {
      console.log(`[Parallel Workflow] All reviews completed`);
      console.log(`[Parallel Workflow] Security: ${securityReview.score}/10`);
      console.log(`[Parallel Workflow] Performance: ${performanceReview.score}/10`);
      console.log(`[Parallel Workflow] Maintainability: ${maintainabilityReview.score}/10`);
    }
  } else {
    // Timeout occurred - collect partial results
    timedOut = true;
    reviews = [];

    ctx.setCustomStatus("Timeout - collecting partial results...");

    if (!ctx.isReplaying()) {
      console.log(`[Parallel Workflow] Timeout after ${timeoutMs}ms - collecting partial results`);
    }

    // Check which reviews completed
    if (securityTask.isComplete) {
      reviews.push((yield securityTask) as CodeReview);
      if (!ctx.isReplaying()) {
        console.log(`[Parallel Workflow] Security review completed`);
      }
    }
    if (performanceTask.isComplete) {
      reviews.push((yield performanceTask) as CodeReview);
      if (!ctx.isReplaying()) {
        console.log(`[Parallel Workflow] Performance review completed`);
      }
    }
    if (maintainabilityTask.isComplete) {
      reviews.push((yield maintainabilityTask) as CodeReview);
      if (!ctx.isReplaying()) {
        console.log(`[Parallel Workflow] Maintainability review completed`);
      }
    }

    if (!ctx.isReplaying()) {
      console.log(`[Parallel Workflow] Got ${reviews.length}/3 reviews before timeout`);
    }
  }

  // ========================================================================
  // Step 3: Summarize Results
  // ========================================================================

  ctx.setCustomStatus(`Summarizing ${reviews.length} reviews...`);

  // Only summarize if we have at least one review
  let summary: SummarizeReviewsOutput;

  if (reviews.length > 0) {
    summary = (yield ctx.callActivity(summarizeReviewsActivity, {
      reviews,
      code,
      timedOut,
      expectedReviews: 3,
    })) as SummarizeReviewsOutput;

    if (!ctx.isReplaying()) {
      console.log(`[Parallel Workflow] Summary generated, overall score: ${summary.overallScore}/10`);
    }
  } else {
    // No reviews completed - provide default summary
    summary = {
      summary: "No reviews completed before timeout. Please try again with a longer timeout.",
      overallScore: 0,
      prioritizedIssues: [],
    };
  }

  // ========================================================================
  // Return Final Result
  // ========================================================================

  const statusMessage = timedOut
    ? `Complete (partial: ${reviews.length}/3 reviews)`
    : "Complete (all reviews)";
  ctx.setCustomStatus(statusMessage);

  const result: ParallelOutput = {
    reviews,
    summary: timedOut
      ? `[PARTIAL RESULTS - ${reviews.length}/3 reviews completed] ${summary.summary}`
      : summary.summary,
    overallScore: summary.overallScore,
  };

  return result;
};

/**
 * Get the workflow name for registration
 */
export function getParallelWorkflowName(): string {
  return "parallelWorkflow";
}
