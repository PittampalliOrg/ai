/**
 * Evaluator Loop Workflow (Dapr-Enhanced)
 *
 * Translation with iterative improvement and optional human-in-the-loop feedback.
 *
 * Dapr Features Used:
 * - setCustomStatus(): Real-time progress tracking
 * - isReplaying(): Conditional logging during replay
 * - waitForExternalEvent(): Human feedback in the evaluation loop
 * - createTimer(): Timeout for human feedback
 * - whenAny(): Race between human feedback and timeout
 * - continueAsNew(): For very long-running evaluation sessions (optional)
 *
 * Flow:
 * 1. Initial translation
 * 2. Evaluate translation quality
 * 3. If quality < threshold and iterations < max:
 *    a. If human feedback enabled: wait for human OR timeout
 *    b. Improve translation using feedback (human or AI)
 *    c. Repeat evaluation
 * 4. Return final translation with evaluation history
 */

import { type WorkflowContext, type TWorkflow, type Task } from "@dapr/dapr";
import type {
  EvaluatorInput,
  EvaluatorOutput,
  TranslationEvaluation,
  HumanFeedbackEvent,
} from "../types";
import type {
  TranslateOutput,
  ImproveTranslationOutput,
} from "../activities/evaluator-activities";

// Activity function references (resolved at runtime by name)
const translateActivity = "translateActivity";
const evaluateTranslationActivity = "evaluateTranslationActivity";
const improveTranslationActivity = "improveTranslationActivity";

const QUALITY_THRESHOLD = 8;
const DEFAULT_HUMAN_FEEDBACK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Evaluator Loop Workflow (Dapr-Enhanced)
 *
 * This workflow demonstrates the evaluator loop pattern with Dapr features:
 * - Real-time status updates via setCustomStatus()
 * - Human-in-the-loop via waitForExternalEvent()
 * - Timeout handling via createTimer() + whenAny()
 * - Graceful fallback to AI feedback on timeout
 */
export const evaluatorWorkflow: TWorkflow = async function* (
  ctx: WorkflowContext,
  input: EvaluatorInput
): AsyncGenerator<unknown, EvaluatorOutput, unknown> {
  const { text, targetLanguage, maxIterations = 3, humanOptions } = input;

  const enableHumanFeedback = humanOptions?.enableHumanFeedback ?? false;
  const humanFeedbackTimeoutMs = humanOptions?.humanFeedbackTimeoutMs ?? DEFAULT_HUMAN_FEEDBACK_TIMEOUT_MS;
  const requireHumanFeedback = humanOptions?.requireHumanFeedback ?? false;

  if (!ctx.isReplaying()) {
    console.log(`[Evaluator Workflow] Starting translation to ${targetLanguage}`);
    if (enableHumanFeedback) {
      console.log(`[Evaluator Workflow] Human feedback enabled (timeout: ${humanFeedbackTimeoutMs}ms)`);
    }
  }

  // ========================================================================
  // Step 1: Initial Translation
  // ========================================================================

  ctx.setCustomStatus("Translating...");

  const initialTranslation = (yield ctx.callActivity(translateActivity, {
    text,
    targetLanguage,
  })) as TranslateOutput;

  let currentTranslation = initialTranslation.translation;
  const evaluations: TranslationEvaluation[] = [];
  let iterations = 0;
  let humanFeedbackUsed = false;

  if (!ctx.isReplaying()) {
    console.log(`[Evaluator Workflow] Initial translation complete`);
  }

  // ========================================================================
  // Step 2: Evaluation Loop
  // ========================================================================

  while (iterations < maxIterations) {
    ctx.setCustomStatus(`Evaluating translation (iteration ${iterations + 1}/${maxIterations})...`);

    // Evaluate current translation
    const evaluation = (yield ctx.callActivity(evaluateTranslationActivity, {
      original: text,
      translation: currentTranslation,
      targetLanguage,
    })) as TranslationEvaluation;

    evaluations.push(evaluation);

    if (!ctx.isReplaying()) {
      console.log(`[Evaluator Workflow] Iteration ${iterations + 1}: Score ${evaluation.score}/10`);
    }

    // Check if quality threshold met
    if (evaluation.score >= QUALITY_THRESHOLD) {
      ctx.setCustomStatus(`Quality threshold met (${evaluation.score}/10)`);
      if (!ctx.isReplaying()) {
        console.log(`[Evaluator Workflow] Quality threshold met`);
      }
      break;
    }

    // Check if max iterations reached
    if (iterations >= maxIterations - 1) {
      ctx.setCustomStatus(`Max iterations reached (score: ${evaluation.score}/10)`);
      if (!ctx.isReplaying()) {
        console.log(`[Evaluator Workflow] Max iterations reached`);
      }
      break;
    }

    // ========================================================================
    // Step 2a: Get Feedback (Human or AI)
    // ========================================================================

    let feedbackToUse = evaluation.feedback;
    let issuesToUse = evaluation.issues;

    if (enableHumanFeedback) {
      ctx.setCustomStatus(`Awaiting human feedback (iteration ${iterations + 1})...`);

      if (!ctx.isReplaying()) {
        console.log(`[Evaluator Workflow] Waiting for human feedback (timeout: ${humanFeedbackTimeoutMs}ms)`);
      }

      // Create human feedback event task and timeout timer
      const feedbackTask = ctx.waitForExternalEvent("humanFeedback");
      const timeoutTask = ctx.createTimer(new Date(Date.now() + humanFeedbackTimeoutMs));

      // Race: human feedback OR timeout
      const raceResult = (yield ctx.whenAny([feedbackTask, timeoutTask])) as Task<unknown>;

      if (feedbackTask.isComplete) {
        // Got human feedback
        const humanFeedback = (yield feedbackTask) as HumanFeedbackEvent;
        feedbackToUse = humanFeedback.feedback;
        issuesToUse = humanFeedback.suggestions || evaluation.issues;
        humanFeedbackUsed = true;

        if (!ctx.isReplaying()) {
          console.log(`[Evaluator Workflow] Received human feedback: "${humanFeedback.feedback.substring(0, 50)}..."`);
        }
      } else {
        // Timeout - use AI feedback
        if (requireHumanFeedback) {
          // If human feedback is required, stop the loop
          ctx.setCustomStatus("Human feedback required but timed out");
          if (!ctx.isReplaying()) {
            console.log(`[Evaluator Workflow] Human feedback required but timed out - stopping`);
          }
          break;
        }

        ctx.setCustomStatus("Using AI feedback (human feedback timed out)...");
        if (!ctx.isReplaying()) {
          console.log(`[Evaluator Workflow] Human feedback timed out - using AI feedback`);
        }
      }
    }

    // ========================================================================
    // Step 2b: Improve Translation
    // ========================================================================

    ctx.setCustomStatus(`Improving translation (iteration ${iterations + 1})...`);

    if (!ctx.isReplaying()) {
      console.log(`[Evaluator Workflow] Improving translation...`);
    }

    const improved = (yield ctx.callActivity(improveTranslationActivity, {
      original: text,
      translation: currentTranslation,
      targetLanguage,
      feedback: feedbackToUse,
      issues: issuesToUse,
    })) as ImproveTranslationOutput;

    currentTranslation = improved.translation;
    iterations++;

    if (!ctx.isReplaying()) {
      console.log(`[Evaluator Workflow] Applied ${improved.changesApplied.length} improvements`);
    }
  }

  // ========================================================================
  // Return Final Result
  // ========================================================================

  const finalEvaluation = evaluations[evaluations.length - 1];

  ctx.setCustomStatus(`Complete: Score ${finalEvaluation?.score ?? 0}/10 (${iterations + 1} iterations${humanFeedbackUsed ? ", human feedback used" : ""})`);

  const result: EvaluatorOutput = {
    translation: currentTranslation,
    finalScore: finalEvaluation?.score ?? 0,
    iterations: iterations + 1, // Include initial translation
    evaluations,
  };

  if (!ctx.isReplaying()) {
    console.log(`[Evaluator Workflow] Completed with ${result.iterations} iterations, final score: ${result.finalScore}/10`);
  }

  return result;
};

/**
 * Get the workflow name for registration
 */
export function getEvaluatorWorkflowName(): string {
  return "evaluatorWorkflow";
}
