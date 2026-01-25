/**
 * Sandbox Module
 * Exports all sandbox-related functionality
 */

// Types
export type {
  SandboxPhase,
  SandboxMode,
  SandboxConfig,
  SandboxTemplateRef,
  SandboxClaimSpec,
  SandboxClaimStatus,
  SandboxClaim,
  SandboxInfo,
  SandboxExecOptions,
  SandboxExecResult,
  SandboxContext,
  ProvisionOptions,
  ReleaseOptions,
} from "./types";

export { getSandboxConfig } from "./types";

// Manager functions
export {
  provisionSandbox,
  getSandbox,
  getSandboxPhase,
  releaseSandbox,
  createSandboxContext,
  isSandboxModeAvailable,
  getActiveSandboxes,
  clearSandboxCache,
} from "./sandbox-manager";

// Executor functions
export {
  executeInSandbox,
  executeInSandboxOrThrow,
  readFileInSandbox,
  writeFileInSandbox,
  pathExistsInSandbox,
  isDirectoryInSandbox,
  listDirectoryInSandbox,
  mkdirInSandbox,
  cloneRepositoryInSandbox,
  isRepoClonedInSandbox,
} from "./sandbox-executor";

export type { CloneOptions } from "./sandbox-executor";

// K8s client functions (for advanced use cases)
export {
  createK8sClients,
  checkK8sConnection,
  getSandboxLogs,
} from "./k8s-client";

// Dapr client functions (for service invocation and tracing)
export {
  invokeSandboxMethod,
  execInSandboxViaDapr,
  isDaprAvailable,
  getDaprMetadata,
  // State store operations
  getState,
  saveState,
  deleteState,
  getBulkState,
  // Pub/Sub operations
  publishEvent,
  publishCloudEvent,
  createCloudEvent,
  // Sandbox registry helpers
  getSandboxFromRegistry,
  setSandboxInRegistry,
  deleteSandboxFromRegistry,
  sandboxStateKey,
  // Task event publishers
  publishTaskStarted,
  publishTaskStepCompleted,
  publishTaskCompleted,
  publishTaskFailed,
  // Sandbox lifecycle event publishers
  publishSandboxProvisioned,
  publishSandboxReady,
  publishSandboxReleased,
  // Constants
  TOPICS,
  AGENT_EVENT_TYPES,
  SANDBOX_EVENT_TYPES,
} from "./dapr-client";

export type {
  DaprInvokeResponse,
  SandboxShellResponse,
  StateStoreResponse,
  StateEntry,
  StateOptions,
  PubSubResponse,
  PubSubOptions,
  CloudEvent,
} from "./dapr-client";

// Event types
export type {
  BaseEventPayload,
  TaskStartedEvent,
  TaskStepCompletedEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  SandboxProvisionedEvent,
  SandboxReadyEvent,
  SandboxReleasedEvent,
  TaskEvent,
  SandboxLifecycleEvent,
  CloudEventEnvelope,
} from "./types";
