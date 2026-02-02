/**
 * Dapr Client for Platform Services
 * Provides metadata, state store, and pub/sub operations for the platform UI
 */

const DAPR_HTTP_PORT = process.env.DAPR_HTTP_PORT || "3500";
const DAPR_HOST = process.env.DAPR_HOST || "localhost";

function daprUrl(path: string): string {
  return `http://${DAPR_HOST}:${DAPR_HTTP_PORT}${path}`;
}

// ============================================================================
// Types
// ============================================================================

export interface DaprComponent {
  name: string;
  type: string;
  version: string;
  capabilities?: string[];
}

export interface DaprSubscription {
  pubsubname: string;
  topic: string;
  rules?: {
    match?: string;
    path: string;
  }[];
  deadLetterTopic?: string;
  type?: "DECLARATIVE" | "STREAMING" | "PROGRAMMATIC";
  metadata?: Record<string, string>;
}

export interface DaprMetadata {
  id: string;
  runtimeVersion: string;
  enabledFeatures?: string[];
  components: DaprComponent[];
  subscriptions?: DaprSubscription[];
  httpEndpoints?: Array<{ name: string }>;
  actors?: Array<{ type: string; count: number }>;
}

export interface StateQueryFilter {
  [key: string]: unknown;
}

export interface StateQuerySort {
  key: string;
  order?: "ASC" | "DESC";
}

export interface StateQueryRequest {
  filter?: StateQueryFilter;
  sort?: StateQuerySort[];
  page?: {
    limit?: number;
    token?: string;
  };
}

export interface StateQueryResult<T = unknown> {
  results: Array<{
    key: string;
    data: T;
    etag?: string;
  }>;
  token?: string;
}

// ============================================================================
// Metadata API
// ============================================================================

/**
 * Get Dapr sidecar metadata including components and subscriptions
 */
export async function getMetadata(): Promise<DaprMetadata | null> {
  try {
    const response = await fetch(daprUrl("/v1.0/metadata"), {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      console.error(`[Dapr] Metadata fetch failed: ${response.status}`);
      return null;
    }

    return (await response.json()) as DaprMetadata;
  } catch (error) {
    console.error("[Dapr] Failed to get metadata:", error);
    return null;
  }
}

/**
 * Check if Dapr sidecar is available
 */
export async function isAvailable(): Promise<boolean> {
  try {
    const response = await fetch(daprUrl("/v1.0/healthz"), {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ============================================================================
// State Store API
// ============================================================================

/**
 * Get a single state value
 */
export async function getState<T>(
  storeName: string,
  key: string
): Promise<{ data: T | null; etag?: string }> {
  try {
    const response = await fetch(
      daprUrl(`/v1.0/state/${storeName}/${encodeURIComponent(key)}`),
      {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      }
    );

    if (response.status === 204 || response.status === 404) {
      return { data: null };
    }

    if (!response.ok) {
      throw new Error(`State get failed: ${response.status}`);
    }

    const etag = response.headers.get("ETag") || undefined;
    const data = (await response.json()) as T;
    return { data, etag };
  } catch (error) {
    console.error(`[Dapr] Failed to get state ${storeName}/${key}:`, error);
    throw error;
  }
}

/**
 * Get multiple states in bulk
 */
export async function getBulkState<T>(
  storeName: string,
  keys: string[]
): Promise<Array<{ key: string; data: T; etag?: string }>> {
  try {
    const response = await fetch(daprUrl(`/v1.0/state/${storeName}/bulk`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Bulk state get failed: ${response.status}`);
    }

    const results = (await response.json()) as Array<{
      key: string;
      data: T;
      etag?: string;
    }>;
    return results;
  } catch (error) {
    console.error(`[Dapr] Failed to get bulk state from ${storeName}:`, error);
    throw error;
  }
}

/**
 * Query state store (Alpha API - requires state store support)
 * Note: Only works with state stores that support querying (e.g., MongoDB, PostgreSQL)
 * Redis does NOT support this API
 */
export async function queryState<T>(
  storeName: string,
  query: StateQueryRequest
): Promise<StateQueryResult<T>> {
  try {
    const response = await fetch(
      daprUrl(`/v1.0-alpha1/state/${storeName}/query`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`State query failed: ${response.status} - ${errorText}`);
    }

    return (await response.json()) as StateQueryResult<T>;
  } catch (error) {
    console.error(`[Dapr] Failed to query state ${storeName}:`, error);
    throw error;
  }
}

/**
 * Save state entries
 */
export async function saveState<T>(
  storeName: string,
  entries: Array<{ key: string; value: T; metadata?: Record<string, string> }>
): Promise<void> {
  try {
    const response = await fetch(daprUrl(`/v1.0/state/${storeName}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entries),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`State save failed: ${response.status}`);
    }
  } catch (error) {
    console.error(`[Dapr] Failed to save state to ${storeName}:`, error);
    throw error;
  }
}

// ============================================================================
// Pub/Sub API
// ============================================================================

/**
 * Publish an event to a topic
 */
export async function publish<T>(
  pubsubName: string,
  topic: string,
  data: T,
  metadata?: Record<string, string>
): Promise<void> {
  const url = new URL(daprUrl(`/v1.0/publish/${pubsubName}/${topic}`));

  // Add metadata as query params
  if (metadata) {
    Object.entries(metadata).forEach(([key, value]) => {
      url.searchParams.set(`metadata.${key}`, value);
    });
  }

  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Publish failed: ${response.status}`);
    }
  } catch (error) {
    console.error(`[Dapr] Failed to publish to ${pubsubName}/${topic}:`, error);
    throw error;
  }
}

// ============================================================================
// Service Invocation API
// ============================================================================

/**
 * Configuration for Dapr service invocation
 */
export interface ServiceInvokeOptions {
  /** Target app ID (the Dapr app-id of the service to call) */
  appId: string;
  /** HTTP method */
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Request path (e.g., "/api/workflow/123/status") */
  path: string;
  /** Request body (will be JSON stringified) */
  body?: unknown;
  /** Additional headers */
  headers?: Record<string, string>;
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Query string parameters */
  query?: Record<string, string>;
}

/**
 * Response from Dapr service invocation
 */
export interface ServiceInvokeResponse<T = unknown> {
  ok: boolean;
  status: number;
  statusText: string;
  data: T | null;
  headers: Headers;
}

/**
 * Invoke a Dapr service using the dapr-app-id header pattern.
 *
 * This is the recommended approach for service-to-service calls as it:
 * - Requires minimal code changes (just add header)
 * - Provides automatic mTLS encryption
 * - Enables built-in retries and circuit breakers
 * - Adds distributed tracing automatically
 *
 * @example
 * ```ts
 * // Call planner-agent's status endpoint
 * const response = await invokeService<WorkflowStatus>({
 *   appId: "planner-agent",
 *   method: "GET",
 *   path: `/api/workflow/${instanceId}/status`,
 * });
 *
 * // Call planner-agent's approve endpoint
 * const response = await invokeService({
 *   appId: "planner-agent",
 *   method: "POST",
 *   path: `/api/workflow/${instanceId}/approve`,
 *   body: { plan_id: "plan-123", approved: true },
 * });
 * ```
 */
export async function invokeService<T = unknown>(
  options: ServiceInvokeOptions
): Promise<ServiceInvokeResponse<T>> {
  const {
    appId,
    method = "GET",
    path,
    body,
    headers = {},
    timeout = 30000,
    query,
  } = options;

  // Build URL with query params
  let url = daprUrl(path);
  if (query && Object.keys(query).length > 0) {
    const params = new URLSearchParams(query);
    url += (url.includes("?") ? "&" : "?") + params.toString();
  }

  // Prepare request headers with dapr-app-id
  const requestHeaders: Record<string, string> = {
    "dapr-app-id": appId,
    "Content-Type": "application/json",
    ...headers,
  };

  try {
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    });

    // Try to parse JSON response
    let data: T | null = null;
    const contentType = response.headers.get("Content-Type") || "";

    if (contentType.includes("application/json")) {
      try {
        data = (await response.json()) as T;
      } catch {
        // Response body might be empty or invalid JSON
        data = null;
      }
    } else if (response.ok && response.status !== 204) {
      // Try to get text for non-JSON responses
      const text = await response.text();
      if (text) {
        try {
          data = JSON.parse(text) as T;
        } catch {
          // Not JSON, keep as null
        }
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      data,
      headers: response.headers,
    };
  } catch (error) {
    console.error(`[Dapr] Service invocation failed for ${appId}${path}:`, error);

    // Return a structured error response
    const isTimeout = error instanceof DOMException && error.name === "TimeoutError";
    const isConnectionError = error instanceof TypeError && error.message.includes("fetch");

    return {
      ok: false,
      status: isTimeout ? 504 : isConnectionError ? 503 : 500,
      statusText: isTimeout
        ? "Gateway Timeout"
        : isConnectionError
          ? "Service Unavailable"
          : "Internal Server Error",
      data: null,
      headers: new Headers(),
    };
  }
}

/**
 * Check if Dapr service invocation is available for a target app
 */
export async function isServiceAvailable(appId: string): Promise<boolean> {
  try {
    // Try to invoke health endpoint via Dapr
    const response = await invokeService({
      appId,
      method: "GET",
      path: "/health",
      timeout: 5000,
    });
    // Accept 200, 404 (endpoint might not exist), or other non-connection errors
    return response.status !== 503 && response.status !== 504;
  } catch {
    return false;
  }
}

// ============================================================================
// Helper functions for known key patterns
// ============================================================================

/**
 * Known state key prefixes used in the application
 */
export const STATE_KEY_PREFIXES = {
  WORKFLOW: "workflow||",
  SESSION: "session||",
  CACHE: "cache||",
  SANDBOX: "sandbox:",
  USER: "user||",
  CONFIG: "config||",
} as const;

/**
 * Parse a state key into its components
 */
export function parseStateKey(key: string): {
  prefix: string;
  parts: string[];
} {
  // Handle || separator (workflow keys)
  if (key.includes("||")) {
    const parts = key.split("||");
    return {
      prefix: parts[0] || "",
      parts: parts.slice(1),
    };
  }

  // Handle : separator (sandbox keys)
  if (key.includes(":")) {
    const parts = key.split(":");
    return {
      prefix: parts[0] || "",
      parts: parts.slice(1),
    };
  }

  return { prefix: "", parts: [key] };
}

// ============================================================================
// Configuration API
// ============================================================================

/**
 * Configuration item returned from Dapr Configuration API
 */
export interface ConfigurationItem {
  value: string;
  version?: string;
  metadata?: Record<string, string>;
}

/**
 * Options for configuration retrieval
 */
export interface ConfigurationOptions {
  /** Label to filter configuration items (e.g., "ai-chatbot") */
  label?: string;
  /** Additional metadata parameters */
  metadata?: Record<string, string>;
}

/**
 * Get configuration values from a Dapr configuration store
 *
 * @param storeName - Name of the configuration store component
 * @param keys - Array of configuration keys to retrieve
 * @param options - Optional configuration options (label, metadata)
 * @returns Record of key to ConfigurationItem
 *
 * @example
 * ```ts
 * const config = await getConfiguration("azureappconfig", ["WORKFLOW_PATTERNS_ENABLED"], { label: "ai-chatbot" });
 * console.log(config["WORKFLOW_PATTERNS_ENABLED"]?.value); // "true"
 * ```
 */
export async function getConfiguration(
  storeName: string,
  keys: string[],
  options?: ConfigurationOptions
): Promise<Record<string, ConfigurationItem>> {
  try {
    const url = new URL(daprUrl(`/v1.0/configuration/${storeName}`));

    // Add keys as query parameters
    keys.forEach((k) => url.searchParams.append("key", k));

    // Add label if provided
    if (options?.label) {
      url.searchParams.set("metadata.label", options.label);
    }

    // Add any additional metadata
    if (options?.metadata) {
      Object.entries(options.metadata).forEach(([key, value]) => {
        url.searchParams.set(`metadata.${key}`, value);
      });
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Configuration get failed: ${response.status}`);
    }

    return (await response.json()) as Record<string, ConfigurationItem>;
  } catch (error) {
    console.error(`[Dapr] Failed to get configuration from ${storeName}:`, error);
    throw error;
  }
}

/**
 * Get all configuration values from a Dapr configuration store
 *
 * @param storeName - Name of the configuration store component
 * @returns Record of key to ConfigurationItem
 */
export async function getAllConfiguration(
  storeName: string
): Promise<Record<string, ConfigurationItem>> {
  try {
    const response = await fetch(daprUrl(`/v1.0/configuration/${storeName}`), {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Configuration get all failed: ${response.status}`);
    }

    return (await response.json()) as Record<string, ConfigurationItem>;
  } catch (error) {
    console.error(`[Dapr] Failed to get all configuration from ${storeName}:`, error);
    throw error;
  }
}

// ============================================================================
// Secrets API
// ============================================================================

/**
 * Get a single secret from a Dapr secrets store
 *
 * @param storeName - Name of the secrets store component (e.g., "azurekeyvault", "kubernetes")
 * @param secretName - Name of the secret to retrieve
 * @param metadata - Optional metadata for the request
 * @returns The secret value
 *
 * @example
 * ```ts
 * const apiKey = await getSecret("azurekeyvault", "OPENAI-API-KEY");
 * ```
 */
export async function getSecret(
  storeName: string,
  secretName: string,
  metadata?: Record<string, string>
): Promise<string> {
  try {
    const url = new URL(daprUrl(`/v1.0/secrets/${storeName}/${encodeURIComponent(secretName)}`));

    // Add metadata as query params if provided
    if (metadata) {
      Object.entries(metadata).forEach(([key, value]) => {
        url.searchParams.set(`metadata.${key}`, value);
      });
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error(`Secret get failed: ${response.status}`);
    }

    const data = (await response.json()) as Record<string, string>;
    // Dapr returns { secretName: secretValue }
    return data[secretName] ?? "";
  } catch (error) {
    console.error(`[Dapr] Failed to get secret ${secretName} from ${storeName}:`, error);
    throw error;
  }
}

/**
 * Get all secrets from a Dapr secrets store (bulk operation)
 *
 * Note: Not all secret stores support bulk operations.
 * Azure Key Vault and Kubernetes secrets do support this.
 *
 * @param storeName - Name of the secrets store component
 * @returns Record of secret name to secret value
 *
 * @example
 * ```ts
 * const secrets = await getBulkSecrets("azurekeyvault");
 * console.log(secrets["OPENAI-API-KEY"]); // "sk-..."
 * ```
 */
export async function getBulkSecrets(
  storeName: string
): Promise<Record<string, string>> {
  try {
    const response = await fetch(daprUrl(`/v1.0/secrets/${storeName}/bulk`), {
      method: "GET",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Bulk secrets get failed: ${response.status}`);
    }

    // Dapr returns { secretName: { secretName: value } } for bulk
    const data = (await response.json()) as Record<string, Record<string, string>>;

    // Flatten to { secretName: value }
    const flattened: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      // The inner object has the same key as outer, value is the secret
      flattened[key] = Object.values(value)[0] ?? "";
    }

    return flattened;
  } catch (error) {
    console.error(`[Dapr] Failed to get bulk secrets from ${storeName}:`, error);
    throw error;
  }
}
