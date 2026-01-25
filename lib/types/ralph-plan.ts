/**
 * Ralph Loop Plan Types
 *
 * Type definitions and Zod validation schemas for the Ralph Loop workflow.
 * The plan represents a structured breakdown of tasks to be executed.
 */

import { z } from "zod";

// ============================================================================
// Plan Item Schema
// ============================================================================

/**
 * Status of a single plan item
 */
export const taskPlanItemStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
  "skipped",
]);

export type TaskPlanItemStatus = z.infer<typeof taskPlanItemStatusSchema>;

/**
 * Result of executing a plan item
 */
export const taskPlanItemResultSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  filesModified: z.array(z.string()).optional(),
  error: z.string().optional(),
  duration: z.number().optional(), // Duration in milliseconds
});

export type TaskPlanItemResult = z.infer<typeof taskPlanItemResultSchema>;

/**
 * A single item in the task plan
 */
export const taskPlanItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  status: taskPlanItemStatusSchema,
  priority: z.number().int().min(1).max(10),
  dependencies: z.array(z.string()).default([]),
  files: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.string()).optional(),
  result: taskPlanItemResultSchema.optional(),
  tokenEstimate: z.number().optional(),
});

export type TaskPlanItem = z.infer<typeof taskPlanItemSchema>;

// ============================================================================
// Plan Schema
// ============================================================================

/**
 * Status of the overall plan
 */
export const taskPlanStatusSchema = z.enum([
  "draft",
  "iterating",
  "accepted",
  "executing",
  "completed",
  "failed",
  "paused", // For context limit handling
]);

export type TaskPlanStatus = z.infer<typeof taskPlanStatusSchema>;

/**
 * PR information after successful completion
 */
export const prInfoSchema = z.object({
  number: z.number(),
  url: z.string(),
  status: z.enum(["open", "merged", "closed"]),
  branch: z.string().optional(),
});

export type PRInfo = z.infer<typeof prInfoSchema>;

/**
 * Full task plan schema
 */
export const taskPlanSchema = z.object({
  version: z.literal("1.0"),
  sessionId: z.string(),
  title: z.string(),
  objective: z.string(),
  status: taskPlanStatusSchema,
  items: z.array(taskPlanItemSchema),
  currentItemIndex: z.number().int().min(0),
  iteration: z.number().int().min(1).default(1),
  acceptedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  totalTokensUsed: z.number().optional(),
  contextLimitReached: z.boolean().optional(),
  prInfo: prInfoSchema.optional(),
  // Metadata for tracking
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type TaskPlan = z.infer<typeof taskPlanSchema>;

// ============================================================================
// Workflow Input/Output Types
// ============================================================================

/**
 * Input to start the Ralph Loop workflow
 */
export const ralphWorkflowInputSchema = z.object({
  sessionId: z.string(),
  userPrompt: z.string(),
  targetRepo: z.object({
    owner: z.string(),
    repo: z.string(),
    branch: z.string(),
    installationId: z.string().optional(),
  }),
});

export type RalphWorkflowInput = z.infer<typeof ralphWorkflowInputSchema>;

/**
 * User response for plan acceptance
 */
export const userPlanResponseSchema = z.object({
  accepted: z.boolean(),
  feedback: z.string().optional(),
});

export type UserPlanResponse = z.infer<typeof userPlanResponseSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a new task plan
 */
export function createTaskPlan(
  sessionId: string,
  title: string,
  objective: string,
  items: Omit<TaskPlanItem, "status" | "result">[]
): TaskPlan {
  const now = new Date().toISOString();
  return {
    version: "1.0",
    sessionId,
    title,
    objective,
    status: "draft",
    items: items.map((item) => ({
      ...item,
      status: "pending" as const,
      dependencies: item.dependencies || [],
      files: item.files || [],
    })),
    currentItemIndex: 0,
    iteration: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Check if a plan item's dependencies are satisfied
 */
export function areDependenciesSatisfied(
  item: TaskPlanItem,
  plan: TaskPlan
): boolean {
  return item.dependencies.every((depId) => {
    const dep = plan.items.find((i) => i.id === depId);
    return dep?.status === "completed";
  });
}

/**
 * Get the next executable item in the plan
 */
export function getNextExecutableItem(plan: TaskPlan): TaskPlanItem | null {
  for (const item of plan.items) {
    if (item.status === "pending" && areDependenciesSatisfied(item, plan)) {
      return item;
    }
  }
  return null;
}

/**
 * Check if all items in the plan are complete
 */
export function isPlanComplete(plan: TaskPlan): boolean {
  return plan.items.every(
    (item) => item.status === "completed" || item.status === "skipped"
  );
}

/**
 * Check if any items in the plan have failed
 */
export function hasPlanFailed(plan: TaskPlan): boolean {
  return plan.items.some((item) => item.status === "failed");
}

/**
 * Update plan status based on item states
 */
export function derivePlanStatus(plan: TaskPlan): TaskPlanStatus {
  if (plan.status === "draft" || plan.status === "iterating") {
    return plan.status;
  }

  if (hasPlanFailed(plan)) {
    return "failed";
  }

  if (isPlanComplete(plan)) {
    return "completed";
  }

  const hasInProgress = plan.items.some(
    (item) => item.status === "in_progress"
  );
  if (hasInProgress) {
    return "executing";
  }

  return plan.status;
}

/**
 * Calculate plan statistics
 */
export function getPlanStats(plan: TaskPlan): {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  inProgress: number;
  skipped: number;
  percentComplete: number;
} {
  const stats = {
    total: plan.items.length,
    completed: 0,
    failed: 0,
    pending: 0,
    inProgress: 0,
    skipped: 0,
    percentComplete: 0,
  };

  for (const item of plan.items) {
    switch (item.status) {
      case "completed":
        stats.completed++;
        break;
      case "failed":
        stats.failed++;
        break;
      case "pending":
        stats.pending++;
        break;
      case "in_progress":
        stats.inProgress++;
        break;
      case "skipped":
        stats.skipped++;
        break;
    }
  }

  stats.percentComplete =
    stats.total > 0
      ? Math.round(((stats.completed + stats.skipped) / stats.total) * 100)
      : 0;

  return stats;
}

// ============================================================================
// XML Parsing Helpers
// ============================================================================

/**
 * Parse XML plan from LLM response
 * Expected format:
 * <plan>
 *   <title>Plan Title</title>
 *   <objective>What this plan achieves</objective>
 *   <items>
 *     <item id="1">
 *       <title>Item Title</title>
 *       <description>Item description</description>
 *       <priority>1</priority>
 *       <dependencies></dependencies>
 *       <files>src/file.ts</files>
 *       <acceptance_criteria>
 *         <criterion>First criterion</criterion>
 *         <criterion>Second criterion</criterion>
 *       </acceptance_criteria>
 *     </item>
 *   </items>
 * </plan>
 */
export function parseXmlPlan(xml: string, sessionId: string): TaskPlan {
  const now = new Date().toISOString();

  // Extract content between tags
  const getContent = (tag: string, content: string): string => {
    const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i");
    const match = content.match(regex);
    return match ? match[1].trim() : "";
  };

  // Extract all items
  const getItems = (content: string): string[] => {
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    const items: string[] = [];
    let match;
    while ((match = itemRegex.exec(content)) !== null) {
      items.push(match[1]);
    }
    return items;
  };

  // Extract item id from opening tag
  const getItemId = (itemXml: string, index: number): string => {
    const idMatch = itemXml.match(/id=["']([^"']+)["']/i);
    return idMatch ? idMatch[1] : `item-${index + 1}`;
  };

  // Extract criteria
  const getCriteria = (itemXml: string): string[] => {
    const criteriaSection = getContent("acceptance_criteria", itemXml);
    const criterionRegex = /<criterion>([^<]+)<\/criterion>/gi;
    const criteria: string[] = [];
    let match;
    while ((match = criterionRegex.exec(criteriaSection)) !== null) {
      criteria.push(match[1].trim());
    }
    return criteria;
  };

  // Parse plan XML
  const planContent = getContent("plan", xml) || xml;
  const title = getContent("title", planContent) || "Untitled Plan";
  const objective = getContent("objective", planContent) || "";
  const itemsXml = getContent("items", planContent) || planContent;
  const rawItems = getItems(itemsXml);

  const items: TaskPlanItem[] = rawItems.map((itemXml, index) => {
    const id = getItemId(itemXml, index);
    const deps = getContent("dependencies", itemXml);
    const files = getContent("files", itemXml);

    return {
      id,
      title: getContent("title", itemXml) || `Task ${index + 1}`,
      description: getContent("description", itemXml) || "",
      status: "pending" as const,
      priority: parseInt(getContent("priority", itemXml), 10) || index + 1,
      dependencies: deps
        ? deps
            .split(",")
            .map((d) => d.trim())
            .filter(Boolean)
        : [],
      files: files
        ? files
            .split(",")
            .map((f) => f.trim())
            .filter(Boolean)
        : [],
      acceptanceCriteria: getCriteria(itemXml),
    };
  });

  return {
    version: "1.0",
    sessionId,
    title,
    objective,
    status: "draft",
    items,
    currentItemIndex: 0,
    iteration: 1,
    createdAt: now,
    updatedAt: now,
  };
}
