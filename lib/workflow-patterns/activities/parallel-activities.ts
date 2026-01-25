/**
 * Parallel Workflow Activities
 *
 * Activities for the Parallel workflow pattern:
 * Concurrent code reviews from multiple perspectives.
 */

import { type WorkflowActivityContext } from "@dapr/dapr";
import { type TActivity } from "../runtime";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { CodeReview } from "../types";

// ============================================================================
// Input Types
// ============================================================================

export interface CodeReviewInput {
  code: string;
  language: string;
  context?: string;
}

export interface SummarizeReviewsInput {
  reviews: CodeReview[];
  code: string;
}

// ============================================================================
// Output Types
// ============================================================================

export interface SummarizeReviewsOutput {
  summary: string;
  overallScore: number;
  prioritizedIssues: Array<{
    category: string;
    issue: string;
    priority: "high" | "medium" | "low";
  }>;
}

// ============================================================================
// Schemas
// ============================================================================

const codeReviewSchema = z.object({
  category: z.enum(["security", "performance", "maintainability"]),
  score: z.number().min(1).max(10).describe("Overall score for this category"),
  issues: z.array(z.object({
    severity: z.enum(["critical", "major", "minor", "suggestion"]),
    line: z.number().optional().describe("Line number if applicable"),
    message: z.string().describe("Description of the issue"),
    suggestion: z.string().optional().describe("Suggested fix"),
  })),
  summary: z.string().describe("Brief summary of the review findings"),
});

const reviewSummarySchema = z.object({
  summary: z.string().describe("Overall summary of all reviews"),
  overallScore: z.number().min(1).max(10).describe("Aggregated overall score"),
  prioritizedIssues: z.array(z.object({
    category: z.string(),
    issue: z.string(),
    priority: z.enum(["high", "medium", "low"]),
  })),
});

// ============================================================================
// Activities
// ============================================================================

/**
 * Security Review Activity
 *
 * Reviews code for security vulnerabilities.
 */
export const securityReviewActivity: TActivity<CodeReviewInput, CodeReview> = async (
  _ctx: WorkflowActivityContext,
  input: CodeReviewInput
): Promise<CodeReview> => {
  const { code, language } = input;

  console.log(`[SecurityReview] Reviewing ${language} code for security issues`);

  const result = await generateObject({
    model: anthropic("claude-sonnet-4-20250514"),
    system: `You are a security expert specializing in ${language} code review. Focus on identifying security vulnerabilities, injection risks, authentication issues, data exposure, and OWASP top 10 vulnerabilities.`,
    prompt: `Review the following ${language} code for security issues:

\`\`\`${language}
${code}
\`\`\`

Provide a detailed security review with specific issues and recommendations.`,
    schema: codeReviewSchema,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "parallel-security-review",
    },
  });

  return { ...result.object, category: "security" };
};

/**
 * Performance Review Activity
 *
 * Reviews code for performance issues.
 */
export const performanceReviewActivity: TActivity<CodeReviewInput, CodeReview> = async (
  _ctx: WorkflowActivityContext,
  input: CodeReviewInput
): Promise<CodeReview> => {
  const { code, language } = input;

  console.log(`[PerformanceReview] Reviewing ${language} code for performance issues`);

  const result = await generateObject({
    model: anthropic("claude-sonnet-4-20250514"),
    system: `You are a performance optimization expert specializing in ${language}. Focus on identifying algorithmic complexity issues, memory leaks, unnecessary computations, caching opportunities, and resource management.`,
    prompt: `Review the following ${language} code for performance issues:

\`\`\`${language}
${code}
\`\`\`

Provide a detailed performance review with specific issues and optimization recommendations.`,
    schema: codeReviewSchema,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "parallel-performance-review",
    },
  });

  return { ...result.object, category: "performance" };
};

/**
 * Maintainability Review Activity
 *
 * Reviews code for maintainability and code quality.
 */
export const maintainabilityReviewActivity: TActivity<CodeReviewInput, CodeReview> = async (
  _ctx: WorkflowActivityContext,
  input: CodeReviewInput
): Promise<CodeReview> => {
  const { code, language } = input;

  console.log(`[MaintainabilityReview] Reviewing ${language} code for maintainability`);

  const result = await generateObject({
    model: anthropic("claude-sonnet-4-20250514"),
    system: `You are a code quality expert specializing in ${language}. Focus on code readability, naming conventions, documentation, modularity, SOLID principles, and technical debt.`,
    prompt: `Review the following ${language} code for maintainability:

\`\`\`${language}
${code}
\`\`\`

Provide a detailed maintainability review with specific issues and improvement recommendations.`,
    schema: codeReviewSchema,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "parallel-maintainability-review",
    },
  });

  return { ...result.object, category: "maintainability" };
};

/**
 * Summarize Reviews Activity
 *
 * Aggregates multiple code reviews into a summary.
 */
export const summarizeReviewsActivity: TActivity<SummarizeReviewsInput, SummarizeReviewsOutput> = async (
  _ctx: WorkflowActivityContext,
  input: SummarizeReviewsInput
): Promise<SummarizeReviewsOutput> => {
  const { reviews } = input;

  console.log(`[SummarizeReviews] Aggregating ${reviews.length} code reviews`);

  const result = await generateObject({
    model: anthropic("claude-sonnet-4-20250514"),
    system: `You are a technical lead reviewing multiple code review perspectives. Synthesize the findings into a coherent summary with prioritized action items.`,
    prompt: `Summarize the following code reviews into a cohesive report:

${reviews.map(r => `
## ${r.category.toUpperCase()} Review (Score: ${r.score}/10)
${r.summary}

Issues:
${r.issues.map(i => `- [${i.severity}] ${i.message}${i.suggestion ? ` (Fix: ${i.suggestion})` : ''}`).join('\n')}
`).join('\n---\n')}

Provide an overall summary with prioritized issues.`,
    schema: reviewSummarySchema,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "parallel-summarize-reviews",
    },
  });

  return result.object;
};
