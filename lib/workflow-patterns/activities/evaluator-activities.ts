/**
 * Evaluator Workflow Activities
 *
 * Activities for the Evaluator Loop workflow pattern:
 * Translation with iterative improvement.
 */

import { type WorkflowActivityContext } from "@dapr/dapr";
import { type TActivity } from "../runtime";
import { generateObject, generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { TranslationEvaluation } from "../types";

// ============================================================================
// Input Types
// ============================================================================

export interface TranslateInput {
  text: string;
  targetLanguage: string;
  sourceLanguage?: string;
  context?: string;
}

export interface EvaluateTranslationInput {
  original: string;
  translation: string;
  targetLanguage: string;
  sourceLanguage?: string;
}

export interface ImproveTranslationInput {
  original: string;
  translation: string;
  targetLanguage: string;
  feedback: string;
  issues: string[];
}

// ============================================================================
// Output Types
// ============================================================================

export interface TranslateOutput {
  translation: string;
  preservedElements?: string[];
}

export interface ImproveTranslationOutput {
  translation: string;
  changesApplied: string[];
}

// ============================================================================
// Schemas
// ============================================================================

const evaluationSchema = z.object({
  score: z.number().min(1).max(10).describe("Overall translation quality score"),
  feedback: z.string().describe("Detailed feedback for improvement"),
  issues: z.array(z.string()).describe("Specific issues found in the translation"),
  preservesMeaning: z.boolean().describe("Whether the translation preserves the original meaning"),
  naturalSounding: z.boolean().describe("Whether the translation sounds natural in the target language"),
});

const translationSchema = z.object({
  translation: z.string().describe("The translated text"),
  preservedElements: z.array(z.string()).optional().describe("Elements preserved from original (names, numbers, etc.)"),
});

const improvedTranslationSchema = z.object({
  translation: z.string().describe("The improved translation"),
  changesApplied: z.array(z.string()).describe("List of changes made to address the feedback"),
});

// ============================================================================
// Language Names
// ============================================================================

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
  ar: "Arabic",
  hi: "Hindi",
  nl: "Dutch",
  pl: "Polish",
  tr: "Turkish",
  vi: "Vietnamese",
  th: "Thai",
  sv: "Swedish",
  da: "Danish",
  no: "Norwegian",
  fi: "Finnish",
  cs: "Czech",
  el: "Greek",
  he: "Hebrew",
  id: "Indonesian",
  ms: "Malay",
  ro: "Romanian",
  uk: "Ukrainian",
};

function getLanguageName(code: string): string {
  return LANGUAGE_NAMES[code.toLowerCase()] || code;
}

// ============================================================================
// Activities
// ============================================================================

/**
 * Translate Activity
 *
 * Translates text to the target language.
 */
export const translateActivity: TActivity<TranslateInput, TranslateOutput> = async (
  _ctx: WorkflowActivityContext,
  input: TranslateInput
): Promise<TranslateOutput> => {
  const { text, targetLanguage, sourceLanguage, context } = input;

  const targetLangName = getLanguageName(targetLanguage);
  const sourceLangName = sourceLanguage ? getLanguageName(sourceLanguage) : "auto-detected";

  console.log(`[Translate] Translating from ${sourceLangName} to ${targetLangName}`);

  const contextPrompt = context ? `\nContext: ${context}` : '';

  const result = await generateObject({
    model: anthropic("claude-sonnet-4-20250514"),
    system: `You are an expert translator fluent in multiple languages. Translate text accurately while preserving the original meaning, tone, and style. Pay attention to idioms, cultural nuances, and technical terminology.`,
    prompt: `Translate the following text to ${targetLangName}:${contextPrompt}

Original text (${sourceLangName}):
"${text}"

Provide an accurate and natural-sounding translation.`,
    schema: translationSchema,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "evaluator-translate",
      metadata: {
        targetLanguage,
        sourceLanguage: sourceLanguage || "auto",
      },
    },
  });

  return result.object;
};

/**
 * Evaluate Translation Activity
 *
 * Evaluates the quality of a translation.
 */
export const evaluateTranslationActivity: TActivity<EvaluateTranslationInput, TranslationEvaluation> = async (
  _ctx: WorkflowActivityContext,
  input: EvaluateTranslationInput
): Promise<TranslationEvaluation> => {
  const { original, translation, targetLanguage, sourceLanguage } = input;

  const targetLangName = getLanguageName(targetLanguage);
  const sourceLangName = sourceLanguage ? getLanguageName(sourceLanguage) : "the source language";

  console.log(`[EvaluateTranslation] Evaluating translation quality`);

  const result = await generateObject({
    model: anthropic("claude-sonnet-4-20250514"),
    system: `You are an expert translation quality evaluator. Assess translations for accuracy, naturalness, and preservation of meaning. Be constructive in your feedback.`,
    prompt: `Evaluate the following translation from ${sourceLangName} to ${targetLangName}:

Original:
"${original}"

Translation:
"${translation}"

Evaluate the translation quality and provide specific feedback for improvement.`,
    schema: evaluationSchema,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "evaluator-evaluate-translation",
    },
  });

  return result.object;
};

/**
 * Improve Translation Activity
 *
 * Improves a translation based on feedback.
 */
export const improveTranslationActivity: TActivity<ImproveTranslationInput, ImproveTranslationOutput> = async (
  _ctx: WorkflowActivityContext,
  input: ImproveTranslationInput
): Promise<ImproveTranslationOutput> => {
  const { original, translation, targetLanguage, feedback, issues } = input;

  const targetLangName = getLanguageName(targetLanguage);

  console.log(`[ImproveTranslation] Improving translation based on ${issues.length} issues`);

  const result = await generateObject({
    model: anthropic("claude-sonnet-4-20250514"),
    system: `You are an expert translator. Improve the provided translation based on specific feedback while maintaining accuracy and naturalness.`,
    prompt: `Improve the following translation to ${targetLangName} based on the feedback:

Original text:
"${original}"

Current translation:
"${translation}"

Feedback:
${feedback}

Specific issues to address:
${issues.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}

Provide an improved translation that addresses all the issues.`,
    schema: improvedTranslationSchema,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "evaluator-improve-translation",
    },
  });

  return result.object;
};
