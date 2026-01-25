/**
 * Dapr Client for Sandbox Communication
 * Provides service invocation for reliable, traced communication with sandboxes
 */

const DAPR_HTTP_PORT = process.env.DAPR_HTTP_PORT || "3500";

/**
 * Response from Dapr service invocation
 */
export interface DaprInvokeResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Shell execution response from sandbox API
 * Note: The actual sandbox API returns a nested structure with snake_case fields
 */
export interface SandboxShellData {
  exit_code: number;
  output: string;
  session_id?: string;
  command?: string;
  status?: string;
  console?: Array<{ ps1: string; command: string; output: string }>;
}

/**
 * Full response envelope from sandbox API
 */
export interface SandboxApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

/**
 * Alias for backward compatibility
 * @deprecated Use SandboxShellData instead
 */
export type SandboxShellResponse = SandboxShellData;

/**
 * Invoke a method on a sandbox via Dapr service invocation
 * Uses Dapr's automatic distributed tracing and retry capabilities
 *
 * @param sandboxAppId - The Dapr app ID of the sandbox (e.g., "sandbox-agent-abc12345")
 * @param method - The method/endpoint to call (e.g., "v1/shell/exec")
 * @param data - The request payload
 * @param timeout - Timeout in milliseconds (default: 120000ms = 2 minutes)
 */
export async function invokeSandboxMethod<T>(
  sandboxAppId: string,
  method: string,
  data: unknown,
  timeout = 120000
): Promise<DaprInvokeResponse<T>> {
  const url = `http://localhost:${DAPR_HTTP_PORT}/v1.0/invoke/${sandboxAppId}/method/${method}`;

  console.log(
    `[Dapr] Invoking ${sandboxAppId}/${method} via Dapr service invocation`
  );

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[Dapr] Service invocation failed: ${response.status} ${response.statusText}`,
        errorText
      );
      return {
        success: false,
        error: `Dapr invocation failed (${response.status}): ${errorText}`,
      };
    }

    const responseData = (await response.json()) as T;
    return {
      success: true,
      data: responseData,
    };
  } catch (error: unknown) {
    let errorMessage: string;
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        errorMessage = `Dapr invocation timed out after ${timeout}ms`;
      } else {
        errorMessage = error.message;
      }
    } else {
      errorMessage = String(error);
    }

    console.error(`[Dapr] Service invocation error:`, errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Execute a shell command in a sandbox via Dapr service invocation
 *
 * @param sandboxAppId - The Dapr app ID of the sandbox
 * @param command - The shell command to execute
 * @param workdir - Working directory for the command
 * @param timeout - Timeout in milliseconds
 */
export async function execInSandboxViaDapr(
  sandboxAppId: string,
  command: string,
  workdir: string,
  timeout = 120000
): Promise<DaprInvokeResponse<SandboxShellData>> {
  // Invoke and get the full API response envelope
  const result = await invokeSandboxMethod<SandboxApiResponse<SandboxShellData>>(
    sandboxAppId,
    "v1/shell/exec",
    {
      command,
      workdir,
      timeout: Math.floor(timeout / 1000), // API expects seconds
    },
    timeout
  );

  // If the Dapr invocation failed, pass through the error
  if (!result.success || !result.data) {
    return {
      success: false,
      error: result.error || "No data in response",
    };
  }

  // Check the sandbox API response envelope
  const apiResponse = result.data;
  if (!apiResponse.success || !apiResponse.data) {
    return {
      success: false,
      error: apiResponse.message || "Sandbox API returned unsuccessful response",
    };
  }

  // Return the actual shell execution data
  return {
    success: true,
    data: apiResponse.data,
  };
}

/**
 * Check if the Dapr sidecar is available and healthy
 */
export async function isDaprAvailable(): Promise<boolean> {
  try {
    const response = await fetch(
      `http://localhost:${DAPR_HTTP_PORT}/v1.0/healthz`,
      {
        method: "GET",
        signal: AbortSignal.timeout(5000), // 5 second timeout for health check
      }
    );
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get Dapr sidecar metadata (useful for debugging)
 */
export async function getDaprMetadata(): Promise<{
  available: boolean;
  appId?: string;
  version?: string;
}> {
  try {
    const response = await fetch(
      `http://localhost:${DAPR_HTTP_PORT}/v1.0/metadata`,
      {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!response.ok) {
      return { available: false };
    }

    const metadata = (await response.json()) as {
      id?: string;
      runtimeVersion?: string;
    };
    return {
      available: true,
      appId: metadata.id,
      version: metadata.runtimeVersion,
    };
  } catch {
    return { available: false };
  }
}

// ============================================================================
// State Store Operations
// ============================================================================

/**
 * Default state store component name for sandbox registry
 */
const DEFAULT_STATE_STORE = process.env.DAPR_STATE_STORE || "sandboxregistry";

/**
 * State store response type
 */
export interface StateStoreResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * State store entry with metadata
 */
export interface StateEntry<T> {
  key: string;
  value: T;
  etag?: string;
}

/**
 * Options for state operations
 */
export interface StateOptions {
  /** State store component name */
  storeName?: string;
  /** TTL in seconds (for set operations) */
  ttlInSeconds?: number;
  /** Consistency level */
  consistency?: "eventual" | "strong";
}

/**
 * Get state from Dapr state store
 */
export async function getState<T>(
  key: string,
  options: StateOptions = {}
): Promise<StateStoreResponse<T>> {
  const storeName = options.storeName || DEFAULT_STATE_STORE;
  const url = `http://localhost:${DAPR_HTTP_PORT}/v1.0/state/${storeName}/${key}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (response.status === 404 || response.status === 204) {
      return { success: true, data: undefined };
    }

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `State get failed (${response.status}): ${errorText}`,
      };
    }

    const data = (await response.json()) as T;
    return { success: true, data };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Save state to Dapr state store
 */
export async function saveState<T>(
  key: string,
  value: T,
  options: StateOptions = {}
): Promise<StateStoreResponse<void>> {
  const storeName = options.storeName || DEFAULT_STATE_STORE;
  const url = `http://localhost:${DAPR_HTTP_PORT}/v1.0/state/${storeName}`;

  const stateEntry: Record<string, unknown> = {
    key,
    value,
  };

  // Add metadata for TTL if specified
  if (options.ttlInSeconds) {
    stateEntry.metadata = {
      ttlInSeconds: String(options.ttlInSeconds),
    };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify([stateEntry]),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `State save failed (${response.status}): ${errorText}`,
      };
    }

    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Delete state from Dapr state store
 */
export async function deleteState(
  key: string,
  options: StateOptions = {}
): Promise<StateStoreResponse<void>> {
  const storeName = options.storeName || DEFAULT_STATE_STORE;
  const url = `http://localhost:${DAPR_HTTP_PORT}/v1.0/state/${storeName}/${key}`;

  try {
    const response = await fetch(url, {
      method: "DELETE",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok && response.status !== 204) {
      const errorText = await response.text();
      return {
        success: false,
        error: `State delete failed (${response.status}): ${errorText}`,
      };
    }

    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Get multiple states in bulk
 */
export async function getBulkState<T>(
  keys: string[],
  options: StateOptions = {}
): Promise<StateStoreResponse<StateEntry<T>[]>> {
  const storeName = options.storeName || DEFAULT_STATE_STORE;
  const url = `http://localhost:${DAPR_HTTP_PORT}/v1.0/state/${storeName}/bulk`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ keys }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Bulk state get failed (${response.status}): ${errorText}`,
      };
    }

    const data = (await response.json()) as Array<{
      key: string;
      data: T;
      etag?: string;
    }>;

    return {
      success: true,
      data: data.map((item) => ({
        key: item.key,
        value: item.data,
        etag: item.etag,
      })),
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

// ============================================================================
// Pub/Sub Operations
// ============================================================================

/**
 * Default pub/sub component name
 */
const DEFAULT_PUBSUB = process.env.DAPR_PUBSUB || "taskpubsub";

/**
 * Pub/Sub response type
 */
export interface PubSubResponse {
  success: boolean;
  error?: string;
}

/**
 * Options for pub/sub operations
 */
export interface PubSubOptions {
  /** Pub/sub component name */
  pubsubName?: string;
  /** Content type (default: application/json) */
  contentType?: string;
  /** CloudEvents metadata */
  metadata?: Record<string, string>;
}

/**
 * CloudEvents envelope for published messages
 */
export interface CloudEvent<T> {
  /** Event identifier */
  id: string;
  /** Event source */
  source: string;
  /** Event type (e.g., "sandbox.provisioned") */
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

/**
 * Create a CloudEvents envelope
 */
export function createCloudEvent<T>(
  type: string,
  data: T,
  source = "ai-chatbot"
): CloudEvent<T> {
  return {
    id: crypto.randomUUID(),
    source,
    type,
    specversion: "1.0",
    datacontenttype: "application/json",
    data,
    time: new Date().toISOString(),
  };
}

/**
 * Publish a message to a Dapr pub/sub topic
 */
export async function publishEvent<T>(
  topic: string,
  data: T,
  options: PubSubOptions = {}
): Promise<PubSubResponse> {
  const pubsubName = options.pubsubName || DEFAULT_PUBSUB;
  const url = `http://localhost:${DAPR_HTTP_PORT}/v1.0/publish/${pubsubName}/${topic}`;

  try {
    const headers: Record<string, string> = {
      "Content-Type": options.contentType || "application/json",
    };

    // Add CloudEvents metadata if provided
    if (options.metadata) {
      Object.entries(options.metadata).forEach(([key, value]) => {
        headers[`ce-${key}`] = value;
      });
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Publish failed (${response.status}): ${errorText}`,
      };
    }

    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Publish a CloudEvent to a topic
 */
export async function publishCloudEvent<T>(
  topic: string,
  eventType: string,
  data: T,
  options: PubSubOptions = {}
): Promise<PubSubResponse> {
  const event = createCloudEvent(eventType, data);
  return publishEvent(topic, event, {
    ...options,
    contentType: "application/cloudevents+json",
  });
}

// ============================================================================
// Sandbox Registry State Helpers
// ============================================================================

/**
 * Key prefix for sandbox registry entries
 */
const SANDBOX_REGISTRY_PREFIX = "sandbox:";

/**
 * Generate a state key for sandbox registry
 */
export function sandboxStateKey(sessionId: string): string {
  return `${SANDBOX_REGISTRY_PREFIX}${sessionId}`;
}

/**
 * Get sandbox info from Dapr state store
 */
export async function getSandboxFromRegistry<T>(
  sessionId: string
): Promise<StateStoreResponse<T>> {
  return getState<T>(sandboxStateKey(sessionId));
}

/**
 * Save sandbox info to Dapr state store with TTL
 */
export async function setSandboxInRegistry<T>(
  sessionId: string,
  info: T,
  ttlInSeconds = 1800 // 30 minutes default
): Promise<StateStoreResponse<void>> {
  return saveState(sandboxStateKey(sessionId), info, { ttlInSeconds });
}

/**
 * Delete sandbox info from Dapr state store
 */
export async function deleteSandboxFromRegistry(
  sessionId: string
): Promise<StateStoreResponse<void>> {
  return deleteState(sandboxStateKey(sessionId));
}

// ============================================================================
// Task Event Publishing Helpers
// ============================================================================

/**
 * Topic names for sandbox and agent events
 */
export const TOPICS = {
  AGENT_TASKS: "agent.tasks",
  SANDBOX_LIFECYCLE: "sandbox.lifecycle",
  AGENT_COORDINATION: "agent.coordination",
} as const;

/**
 * Event types for agent tasks
 */
export const AGENT_EVENT_TYPES = {
  TASK_STARTED: "task.started",
  TASK_STEP_COMPLETED: "task.step.completed",
  TASK_COMPLETED: "task.completed",
  TASK_FAILED: "task.failed",
} as const;

/**
 * Event types for sandbox lifecycle
 */
export const SANDBOX_EVENT_TYPES = {
  PROVISIONED: "sandbox.provisioned",
  READY: "sandbox.ready",
  RELEASED: "sandbox.released",
} as const;

/**
 * Publish a task started event
 */
export async function publishTaskStarted(data: {
  sessionId: string;
  userId?: string;
  repository?: string;
}): Promise<PubSubResponse> {
  return publishCloudEvent(
    TOPICS.AGENT_TASKS,
    AGENT_EVENT_TYPES.TASK_STARTED,
    data
  );
}

/**
 * Publish a task step completed event
 */
export async function publishTaskStepCompleted(data: {
  sessionId: string;
  stepId: string;
  output?: string;
  duration?: number;
}): Promise<PubSubResponse> {
  return publishCloudEvent(
    TOPICS.AGENT_TASKS,
    AGENT_EVENT_TYPES.TASK_STEP_COMPLETED,
    data
  );
}

/**
 * Publish a task completed event
 */
export async function publishTaskCompleted(data: {
  sessionId: string;
  status: "success" | "partial" | "cancelled";
  summary?: string;
}): Promise<PubSubResponse> {
  return publishCloudEvent(
    TOPICS.AGENT_TASKS,
    AGENT_EVENT_TYPES.TASK_COMPLETED,
    data
  );
}

/**
 * Publish a task failed event
 */
export async function publishTaskFailed(data: {
  sessionId: string;
  error: string;
  retryCount?: number;
}): Promise<PubSubResponse> {
  return publishCloudEvent(
    TOPICS.AGENT_TASKS,
    AGENT_EVENT_TYPES.TASK_FAILED,
    data
  );
}

/**
 * Publish a sandbox provisioned event
 */
export async function publishSandboxProvisioned(data: {
  sessionId: string;
  podName: string;
  podIP?: string;
}): Promise<PubSubResponse> {
  return publishCloudEvent(
    TOPICS.SANDBOX_LIFECYCLE,
    SANDBOX_EVENT_TYPES.PROVISIONED,
    data
  );
}

/**
 * Publish a sandbox ready event
 */
export async function publishSandboxReady(data: {
  sessionId: string;
  capabilities?: string[];
}): Promise<PubSubResponse> {
  return publishCloudEvent(
    TOPICS.SANDBOX_LIFECYCLE,
    SANDBOX_EVENT_TYPES.READY,
    data
  );
}

/**
 * Publish a sandbox released event
 */
export async function publishSandboxReleased(data: {
  sessionId: string;
  reason: string;
  duration?: number;
}): Promise<PubSubResponse> {
  return publishCloudEvent(
    TOPICS.SANDBOX_LIFECYCLE,
    SANDBOX_EVENT_TYPES.RELEASED,
    data
  );
}
