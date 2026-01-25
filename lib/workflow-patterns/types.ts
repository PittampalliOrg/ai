/**
 * Workflow Patterns Type Definitions
 *
 * Shared types for all workflow patterns.
 */

import { z } from "zod";

// ============================================================================
// Pattern Metadata
// ============================================================================

export type WorkflowPatternId =
  | "sequential"
  | "parallel"
  | "routing"
  | "orchestrator"
  | "evaluator";

export interface WorkflowPatternMetadata {
  id: WorkflowPatternId;
  name: string;
  description: string;
  complexity: "beginner" | "intermediate" | "advanced";
  icon: string;
  useCases: string[];
}

// ============================================================================
// Workflow Execution
// ============================================================================

export type WorkflowExecutionStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface WorkflowStep {
  id: string;
  name: string;
  status: WorkflowExecutionStatus;
  startedAt?: string;
  completedAt?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  duration?: number;
}

export interface WorkflowExecution {
  instanceId: string;
  patternId: WorkflowPatternId;
  status: WorkflowExecutionStatus;
  input: unknown;
  output?: unknown;
  steps: WorkflowStep[];
  startedAt: string;
  completedAt?: string;
  error?: string;
}

// ============================================================================
// Pattern Input Schemas
// ============================================================================

// Dapr feature options schemas
const humanInTheLoopOptionsSchema = z.object({
  enableHumanFeedback: z.boolean().default(false),
  humanFeedbackTimeoutMs: z.number().default(5 * 60 * 1000), // 5 minutes
  requireApproval: z.boolean().default(false),
  approvalTimeoutMs: z.number().default(24 * 60 * 60 * 1000), // 24 hours
}).optional();

const timeoutOptionsSchema = z.object({
  workflowTimeoutMs: z.number().optional(),
  stepTimeoutMs: z.number().default(2 * 60 * 1000), // 2 minutes per step
}).optional();

export const sequentialInputSchema = z.object({
  repository: z.object({
    owner: z.string().min(1, "Repository owner is required"),
    repo: z.string().min(1, "Repository name is required"),
    branch: z.string().default("main"),
    token: z.string().optional(),
  }),
  prompt: z.string().min(10, "Prompt must be at least 10 characters"),
  // Dapr advanced options
  humanOptions: humanInTheLoopOptionsSchema,
  timeoutOptions: timeoutOptionsSchema,
});
export type SequentialInput = z.infer<typeof sequentialInputSchema>;

export const parallelInputSchema = z.object({
  code: z.string().min(10, "Code must be at least 10 characters"),
  language: z.string().default("typescript"),
  // Dapr advanced options - timeout is particularly useful for parallel
  timeoutOptions: z.object({
    workflowTimeoutMs: z.number().default(3 * 60 * 1000), // 3 minutes total
    stepTimeoutMs: z.number().default(2 * 60 * 1000), // 2 minutes per review
  }).optional(),
});
export type ParallelInput = z.infer<typeof parallelInputSchema>;

export const routingInputSchema = z.object({
  query: z.string().min(5, "Query must be at least 5 characters"),
  customerId: z.string().optional(),
  // Dapr advanced options - approval for high-stakes routes
  humanOptions: z.object({
    requireApproval: z.boolean().default(false),
    approvalTimeoutMs: z.number().default(24 * 60 * 60 * 1000),
    // Auto-approve threshold (0-1): routes with confidence above this skip approval
    autoApproveThreshold: z.number().min(0).max(1).default(0.9),
    // High-stakes route types that always require approval
    alwaysRequireApprovalFor: z.array(z.string()).default(["refund", "complaint"]),
  }).optional(),
});
export type RoutingInput = z.infer<typeof routingInputSchema>;

export const orchestratorInputSchema = z.object({
  featureRequest: z.string().min(10, "Feature request must be at least 10 characters"),
  codebaseContext: z.string().optional(),
  // Dapr advanced options - use child workflows for durability
  daprOptions: z.object({
    useChildWorkflows: z.boolean().default(true), // Use child workflows instead of activities
    parallelFileChanges: z.boolean().default(false), // Execute file changes in parallel
  }).optional(),
});
export type OrchestratorInput = z.infer<typeof orchestratorInputSchema>;

export const evaluatorInputSchema = z.object({
  text: z.string().min(10, "Text must be at least 10 characters"),
  targetLanguage: z.string().min(2, "Target language is required"),
  maxIterations: z.number().min(1).max(5).default(3),
  // Dapr advanced options - human-in-the-loop for feedback
  humanOptions: z.object({
    enableHumanFeedback: z.boolean().default(false),
    humanFeedbackTimeoutMs: z.number().default(5 * 60 * 1000), // 5 minutes
    // If true, always wait for human. If false, use AI feedback after timeout
    requireHumanFeedback: z.boolean().default(false),
  }).optional(),
});
export type EvaluatorInput = z.infer<typeof evaluatorInputSchema>;

// ============================================================================
// Pattern Output Types
// ============================================================================

export interface QualityEvaluation {
  score: number;
  feedback: string;
  aspects: {
    clarity: number;
    engagement: number;
    accuracy: number;
    persuasiveness: number;
  };
}

export interface PlanStep {
  title: string;
  description: string;
  filesAffected?: string[];
  complexity?: "low" | "medium" | "high";
}

export interface SequentialPlan {
  id: string;
  title: string;
  summary: string;
  steps: PlanStep[];
  criticalFiles?: string[];
  considerations?: string[];
  status: "draft" | "approved" | "rejected";
}

export interface SequentialOutput {
  repository: {
    owner: string;
    repo: string;
    branch: string;
    clonePath: string;
  };
  plan: SequentialPlan | null;
  status: "completed" | "failed" | "awaiting_approval";
  error?: string;
  /** Execution results (present after plan is approved and executed) */
  execution?: {
    tasksCompleted: number;
    tasksTotal: number;
    filesChanged: string[];
  };
}

export interface CodeReview {
  category: "security" | "performance" | "maintainability";
  score: number;
  issues: Array<{
    severity: "critical" | "major" | "minor" | "suggestion";
    line?: number;
    message: string;
    suggestion?: string;
  }>;
  summary: string;
}

export interface ParallelOutput {
  reviews: CodeReview[];
  summary: string;
  overallScore: number;
}

export interface QueryClassification {
  type: "general" | "refund" | "technical" | "billing" | "complaint";
  confidence: number;
  reasoning: string;
}

export interface RoutingOutput {
  classification: QueryClassification;
  response: string;
  handlerModel: string;
  escalationNeeded: boolean;
}

export interface FileChange {
  path: string;
  operation: "create" | "modify" | "delete";
  content?: string;
  diff?: string;
  description: string;
}

export interface ImplementationPlan {
  title: string;
  summary: string;
  files: Array<{
    path: string;
    operation: "create" | "modify" | "delete";
    description: string;
  }>;
  steps: string[];
}

export interface OrchestratorOutput {
  plan: ImplementationPlan;
  changes: FileChange[];
  summary: string;
}

export interface TranslationEvaluation {
  score: number;
  feedback: string;
  issues: string[];
  preservesMeaning: boolean;
  naturalSounding: boolean;
}

export interface EvaluatorOutput {
  translation: string;
  finalScore: number;
  iterations: number;
  evaluations: TranslationEvaluation[];
}

// ============================================================================
// SSE Event Types
// ============================================================================

export type WorkflowEventType =
  | "workflow:started"
  | "workflow:step:started"
  | "workflow:step:completed"
  | "workflow:step:failed"
  | "workflow:completed"
  | "workflow:failed"
  | "workflow:waiting"  // NEW: Waiting for external event
  | "workflow:timeout"; // NEW: Timeout occurred

export interface WorkflowEvent {
  type: WorkflowEventType;
  instanceId: string;
  timestamp: string;
  data: {
    stepId?: string;
    stepName?: string;
    input?: unknown;
    output?: unknown;
    error?: string;
    status?: WorkflowExecutionStatus;
    customStatus?: string;      // NEW: Custom status from workflow
    waitingForEvent?: string;   // NEW: Event name workflow is waiting for
    timeoutMs?: number;         // NEW: Timeout duration
  };
}

// ============================================================================
// Dapr Advanced Features - External Events
// ============================================================================

/**
 * External event types that can be raised to workflows
 */
export type ExternalEventType =
  | "humanFeedback"     // Human provides feedback for improvement
  | "managerApproval"   // Manager approves high-stakes action
  | "plan_approval"     // Plan approval for sequential workflow
  | "continue"          // Continue after pause
  | "cancel";           // Cancel the workflow

/**
 * Human feedback event payload
 */
export interface HumanFeedbackEvent {
  feedback: string;
  approved?: boolean;
  suggestions?: string[];
}

/**
 * Manager approval event payload
 */
export interface ManagerApprovalEvent {
  approved: boolean;
  approverEmail?: string;
  reason?: string;
}

/**
 * Plan approval event payload (for sequential planner workflow)
 */
export interface PlanApprovalEvent {
  approved: boolean;
  comments?: string;
}

// ============================================================================
// Enhanced Input Schemas with Dapr Features
// ============================================================================

/**
 * Options for workflows that support human-in-the-loop
 */
export interface HumanInTheLoopOptions {
  /** Enable human feedback loop (default: false) */
  enableHumanFeedback?: boolean;
  /** Timeout in milliseconds to wait for human input (default: 5 minutes) */
  humanFeedbackTimeoutMs?: number;
  /** Require manager approval for high-stakes actions (default: false) */
  requireApproval?: boolean;
  /** Timeout in milliseconds for approval (default: 24 hours) */
  approvalTimeoutMs?: number;
}

/**
 * Options for workflows that support timeouts
 */
export interface TimeoutOptions {
  /** Overall workflow timeout in milliseconds */
  workflowTimeoutMs?: number;
  /** Individual step timeout in milliseconds */
  stepTimeoutMs?: number;
}

// ============================================================================
// Pattern Registry
// ============================================================================

export const PATTERN_METADATA: Record<WorkflowPatternId, WorkflowPatternMetadata> = {
  sequential: {
    id: "sequential",
    name: "Planner Agent",
    description: "Clone a GitHub repository, generate an implementation plan using AI, and wait for approval.",
    complexity: "intermediate",
    icon: "GitBranch",
    useCases: [
      "Feature implementation planning",
      "Codebase analysis and planning",
      "AI-assisted code review and planning",
    ],
  },
  parallel: {
    id: "parallel",
    name: "Parallel Processing",
    description: "Execute multiple independent tasks concurrently and aggregate results.",
    complexity: "intermediate",
    icon: "GitBranch",
    useCases: [
      "Multi-perspective code reviews",
      "Parallel content generation",
      "Concurrent data analysis",
    ],
  },
  routing: {
    id: "routing",
    name: "Intelligent Routing",
    description: "Classify input and route to specialized handlers based on the classification.",
    complexity: "intermediate",
    icon: "GitMerge",
    useCases: [
      "Customer support ticket routing",
      "Query classification and handling",
      "Dynamic model selection",
    ],
  },
  orchestrator: {
    id: "orchestrator",
    name: "Orchestrator/Worker",
    description: "A central orchestrator plans and delegates work to specialized workers.",
    complexity: "advanced",
    icon: "Network",
    useCases: [
      "Feature implementation planning",
      "Complex task decomposition",
      "Multi-agent coordination",
    ],
  },
  evaluator: {
    id: "evaluator",
    name: "Evaluator Loop",
    description: "Iteratively improve output until it meets quality criteria or max iterations.",
    complexity: "advanced",
    icon: "RefreshCw",
    useCases: [
      "Translation with iterative refinement",
      "Code generation with testing",
      "Content optimization",
    ],
  },
};
