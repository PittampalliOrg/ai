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
