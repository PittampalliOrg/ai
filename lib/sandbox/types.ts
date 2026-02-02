/**
 * Kubernetes Sandbox Types
 * TypeScript interfaces for the agent-sandbox Kubernetes integration
 */

/**
 * Sandbox status phases from the SandboxClaim CRD
 */
export type SandboxPhase = "Pending" | "Bound" | "Ready" | "Failed";

/**
 * Sandbox execution mode
 */
export type SandboxMode = "local" | "k8s";

/**
 * Configuration for the sandbox system
 */
export interface SandboxConfig {
  /** Sandbox execution mode: 'local' for development, 'k8s' for Kubernetes */
  mode: SandboxMode;
  /** Kubernetes namespace where sandbox claims are created */
  namespace: string;
  /** Name of the SandboxTemplate to use */
  templateName: string;
  /** Default timeout for sandbox operations (e.g., "30m") */
  timeout: string;
  /** Namespace where the application is deployed (for RBAC) */
  appNamespace: string;
}

/**
 * Reference to a SandboxTemplate
 */
export interface SandboxTemplateRef {
  /** Name of the SandboxTemplate */
  name: string;
  /** Namespace of the SandboxTemplate (optional, defaults to claim namespace) */
  namespace?: string;
}

/**
 * SandboxClaim spec for creating claims
 */
export interface SandboxClaimSpec {
  /** Reference to the SandboxTemplate to use */
  sandboxTemplateRef: SandboxTemplateRef;
  /** Optional overrides to apply to the template */
  overrides?: Record<string, unknown>;
  /** Optional timeout override */
  timeout?: string;
}

/**
 * SandboxClaim status from the controller
 */
export interface SandboxClaimStatus {
  /** Current phase of the claim */
  phase?: SandboxPhase;
  /** Details of the allocated sandbox (includes pod info) */
  sandbox?: {
    /** Name of the Sandbox resource (capital N from controller) */
    Name?: string;
    podName?: string;
    podIP?: string;
    nodeName?: string;
    [key: string]: unknown;
  };
  /** Reference to the allocated Sandbox CR */
  sandboxRef?: {
    name: string;
    namespace: string;
  };
  /** Condition entries */
  conditions?: Array<{
    type: string;
    status: string;
    lastTransitionTime?: string;
    observedGeneration?: number;
    reason?: string;
    message?: string;
  }>;
  /** Human-readable status message */
  message?: string;
}

/**
 * Full SandboxClaim resource
 */
export interface SandboxClaim {
  apiVersion: "extensions.agents.x-k8s.io/v1alpha1";
  kind: "SandboxClaim";
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec: SandboxClaimSpec;
  status?: SandboxClaimStatus;
}

/**
 * Sandbox resource status
 */
export interface SandboxStatus {
  /** Condition entries */
  conditions?: Array<{
    type: string;
    status: string;
    lastTransitionTime?: string;
    observedGeneration?: number;
    reason?: string;
    message?: string;
  }>;
  /** Number of replicas */
  replicas?: number;
  /** Selector for pods */
  selector?: string;
  /** Service name */
  service?: string;
  /** Service FQDN */
  serviceFqdn?: string;
}

/**
 * Full Sandbox resource (from agents.x-k8s.io API group)
 */
export interface Sandbox {
  apiVersion: "agents.x-k8s.io/v1alpha1";
  kind: "Sandbox";
  metadata: {
    name: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    ownerReferences?: Array<{
      apiVersion: string;
      kind: string;
      name: string;
      uid: string;
      controller?: boolean;
      blockOwnerDeletion?: boolean;
    }>;
  };
  spec: {
    podTemplate?: unknown;
  };
  status?: SandboxStatus;
}

/**
 * Sandbox information returned to callers
 */
export interface SandboxInfo {
  /** Name of the SandboxClaim */
  claimName: string;
  /** Namespace of the claim */
  namespace: string;
  /** Name of the allocated pod */
  podName: string;
  /** IP address of the pod */
  podIP?: string;
  /** Current status phase */
  phase: SandboxPhase;
  /** Working directory inside the sandbox */
  workdir: string;
  /** Timestamp when the sandbox was provisioned */
  provisionedAt: Date;
  /** Dapr app ID for service invocation (e.g., "sandbox-agent-abc12345") */
  daprAppId?: string;
  /** Whether Dapr service invocation is enabled */
  daprEnabled?: boolean;
}

/**
 * Options for executing commands in a sandbox
 */
export interface SandboxExecOptions {
  /** Kubernetes namespace */
  namespace: string;
  /** Pod name to execute in */
  podName: string;
  /** Container name (defaults to 'sandbox') */
  containerName?: string;
  /** Command to execute */
  command: string | string[];
  /** Working directory for the command */
  workdir?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout in seconds */
  timeout?: number;
  /** Whether to stream output */
  stream?: boolean;
}

/**
 * Result from sandbox command execution
 */
export interface SandboxExecResult {
  /** Exit code of the command */
  exitCode: number;
  /** Combined result (stdout or stderr) */
  result: string;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
}

/**
 * Context passed to agent tools when running in sandbox mode
 */
export interface SandboxContext {
  /** The sandbox mode being used */
  mode: SandboxMode;
  /** Sandbox information (only present when mode is 'k8s') */
  sandbox?: SandboxInfo;
  /** Repository path inside the sandbox */
  repoPath: string;
}

/**
 * Sandbox provisioning options
 */
export interface ProvisionOptions {
  /** Session ID to associate with the sandbox */
  sessionId: string;
  /** Optional labels to add to the SandboxClaim */
  labels?: Record<string, string>;
  /** Optional timeout override */
  timeout?: string;
}

/**
 * Sandbox release options
 */
export interface ReleaseOptions {
  /** Session ID of the sandbox to release */
  sessionId: string;
  /** Whether to force deletion even if pod is still running */
  force?: boolean;
}

/**
 * Get sandbox configuration from Dapr Configuration store or environment variables
 */
export function getSandboxConfig(): SandboxConfig {
  // Import dynamically to avoid circular dependencies at module load time
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getConfig } = require("../dapr/config-provider");

  return {
    mode: (getConfig("SANDBOX_MODE", "local") as SandboxMode),
    namespace: getConfig("SANDBOX_NAMESPACE", "agent-sandbox"),
    templateName: getConfig("SANDBOX_TEMPLATE", "open-swe-dev"),
    timeout: getConfig("SANDBOX_TIMEOUT", "30m"),
    appNamespace: getConfig("APP_NAMESPACE", "ai-chatbot"),
  };
}

// ============================================================================
// Event Types for Pub/Sub
// ============================================================================

/**
 * Base event payload with common fields
 */
export interface BaseEventPayload {
  /** Session ID this event relates to */
  sessionId: string;
  /** Timestamp when the event occurred */
  timestamp?: string;
}

/**
 * Task started event payload
 */
export interface TaskStartedEvent extends BaseEventPayload {
  /** User ID who initiated the task */
  userId?: string;
  /** Repository being worked on */
  repository?: string;
}

/**
 * Task step completed event payload
 */
export interface TaskStepCompletedEvent extends BaseEventPayload {
  /** Unique step identifier */
  stepId: string;
  /** Output from the step */
  output?: string;
  /** Duration in milliseconds */
  duration?: number;
}

/**
 * Task completed event payload
 */
export interface TaskCompletedEvent extends BaseEventPayload {
  /** Completion status */
  status: "success" | "partial" | "cancelled";
  /** Summary of what was accomplished */
  summary?: string;
}

/**
 * Task failed event payload
 */
export interface TaskFailedEvent extends BaseEventPayload {
  /** Error message */
  error: string;
  /** Number of retry attempts */
  retryCount?: number;
}

/**
 * Sandbox provisioned event payload
 */
export interface SandboxProvisionedEvent extends BaseEventPayload {
  /** Pod name of the sandbox */
  podName: string;
  /** Pod IP address */
  podIP?: string;
}

/**
 * Sandbox ready event payload
 */
export interface SandboxReadyEvent extends BaseEventPayload {
  /** Capabilities available in the sandbox */
  capabilities?: string[];
}

/**
 * Sandbox released event payload
 */
export interface SandboxReleasedEvent extends BaseEventPayload {
  /** Reason for release */
  reason: string;
  /** Duration the sandbox was active (in ms) */
  duration?: number;
}

/**
 * Union type for all task events
 */
export type TaskEvent =
  | { type: "task.started"; data: TaskStartedEvent }
  | { type: "task.step.completed"; data: TaskStepCompletedEvent }
  | { type: "task.completed"; data: TaskCompletedEvent }
  | { type: "task.failed"; data: TaskFailedEvent };

/**
 * Union type for all sandbox lifecycle events
 */
export type SandboxLifecycleEvent =
  | { type: "sandbox.provisioned"; data: SandboxProvisionedEvent }
  | { type: "sandbox.ready"; data: SandboxReadyEvent }
  | { type: "sandbox.released"; data: SandboxReleasedEvent };

/**
 * CloudEvents envelope for received events
 */
export interface CloudEventEnvelope<T = unknown> {
  /** Event identifier */
  id: string;
  /** Event source */
  source: string;
  /** Event type */
  type: string;
  /** Spec version */
  specversion: "1.0";
  /** Content type */
  datacontenttype: string;
  /** Event data */
  data: T;
  /** Event timestamp */
  time: string;
  /** Optional trace context */
  traceparent?: string;
}
