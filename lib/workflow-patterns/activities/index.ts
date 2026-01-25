/**
 * Workflow Patterns Activities
 *
 * Exports all Dapr Workflow activities for workflow patterns.
 */

// Base activities
export {
  generateTextActivity,
  type GenerateTextInput,
  type GenerateTextOutput,
} from "./generate-text";

export {
  generateObjectActivity,
  type GenerateObjectInput,
  type GenerateObjectOutput,
} from "./generate-object";

// Sequential workflow activities
export {
  generateCopyActivity,
  evaluateQualityActivity,
  improveCopyActivity,
  type GenerateCopyInput,
  type EvaluateQualityInput,
  type ImproveCopyInput,
  type GenerateCopyOutput,
} from "./sequential-activities";

// Parallel workflow activities
export {
  securityReviewActivity,
  performanceReviewActivity,
  maintainabilityReviewActivity,
  summarizeReviewsActivity,
  type CodeReviewInput,
  type SummarizeReviewsInput,
  type SummarizeReviewsOutput,
} from "./parallel-activities";

// Routing workflow activities
export {
  classifyQueryActivity,
  generateResponseActivity,
  HANDLER_CONFIGS,
  type ClassifyQueryInput,
  type GenerateResponseInput,
  type GenerateResponseOutput,
} from "./routing-activities";

// Orchestrator workflow activities
export {
  planImplementationActivity,
  implementFileActivity,
  type PlanImplementationInput,
  type ImplementFileInput,
} from "./orchestrator-activities";

// Evaluator workflow activities
export {
  translateActivity,
  evaluateTranslationActivity,
  improveTranslationActivity,
  type TranslateInput,
  type EvaluateTranslationInput,
  type ImproveTranslationInput,
  type TranslateOutput,
  type ImproveTranslationOutput,
} from "./evaluator-activities";

// Repository activities (for Planner Agent workflow)
export {
  validateRepositoryActivity,
  cloneRepositoryActivity,
  createPlanActivity,
  executePlanActivity,
  type RepositoryInput,
  type ValidateRepositoryInput,
  type ValidateRepositoryOutput,
  type CloneRepositoryInput,
  type CloneRepositoryOutput,
  type CreatePlanInput,
  type CreatePlanOutput,
  type ExecutePlanInput,
  type ExecutePlanOutput,
} from "./repository-activities";
