/**
 * Sandbox Manager
 * Handles sandbox lifecycle management (provisioning, status, release)
 *
 * State Management Strategy:
 * - Primary: Dapr state store (distributed, TTL-based cleanup)
 * - Fallback: In-memory cache (when Dapr is unavailable)
 *
 * The Dapr state store provides:
 * - Distributed state across replicas
 * - Automatic TTL-based cleanup (30m inactivity)
 * - Persistence across pod restarts
 */

import type {
  SandboxInfo,
  SandboxContext,
  ProvisionOptions,
  ReleaseOptions,
  SandboxPhase,
} from "./types";
import { getSandboxConfig } from "./types";
import {
  createSandboxClaim,
  deleteSandboxClaim,
  getSandboxClaim,
  getSandboxStatus,
  waitForSandboxReady,
  checkK8sConnection,
  getSandbox as getSandboxResource,
} from "./k8s-client";
import {
  isDaprAvailable,
  getSandboxFromRegistry,
  setSandboxInRegistry,
  deleteSandboxFromRegistry,
  publishSandboxProvisioned,
  publishSandboxReady,
  publishSandboxReleased,
} from "./dapr-client";

// In-memory cache of active sandboxes (fallback when Dapr unavailable)
const activeSandboxes = new Map<string, SandboxInfo>();

// Default TTL for sandbox registry entries (30 minutes)
const SANDBOX_REGISTRY_TTL_SECONDS = 1800;

/**
 * Check if Dapr state store should be used
 */
function useDaprStateStore(): boolean {
  return process.env.USE_DAPR_STATE_STORE !== "false";
}

/**
 * Get sandbox from registry (Dapr state store with in-memory fallback)
 */
async function getFromRegistry(sessionId: string): Promise<SandboxInfo | null> {
  // Try in-memory cache first (faster)
  const cached = activeSandboxes.get(sessionId);
  if (cached) {
    return cached;
  }

  // Try Dapr state store if enabled
  if (useDaprStateStore() && (await isDaprAvailable())) {
    try {
      const result = await getSandboxFromRegistry<SandboxInfo>(sessionId);
      if (result.success && result.data) {
        // Reconstitute Date objects
        const info = {
          ...result.data,
          provisionedAt: new Date(result.data.provisionedAt),
        };
        // Update local cache
        activeSandboxes.set(sessionId, info);
        return info;
      }
    } catch (error) {
      console.warn(
        `[SandboxManager] Dapr state get failed, using local cache:`,
        error
      );
    }
  }

  return null;
}

/**
 * Save sandbox to registry (Dapr state store with in-memory fallback)
 */
async function saveToRegistry(
  sessionId: string,
  info: SandboxInfo
): Promise<void> {
  // Always update in-memory cache
  activeSandboxes.set(sessionId, info);

  // Try to save to Dapr state store if enabled
  if (useDaprStateStore() && (await isDaprAvailable())) {
    try {
      const result = await setSandboxInRegistry(
        sessionId,
        info,
        SANDBOX_REGISTRY_TTL_SECONDS
      );
      if (!result.success) {
        console.warn(
          `[SandboxManager] Dapr state save failed:`,
          result.error
        );
      }
    } catch (error) {
      console.warn(
        `[SandboxManager] Dapr state save error, using local cache only:`,
        error
      );
    }
  }
}

/**
 * Delete sandbox from registry (both Dapr and in-memory)
 */
async function deleteFromRegistry(sessionId: string): Promise<void> {
  // Always remove from in-memory cache
  activeSandboxes.delete(sessionId);

  // Try to delete from Dapr state store if enabled
  if (useDaprStateStore() && (await isDaprAvailable())) {
    try {
      const result = await deleteSandboxFromRegistry(sessionId);
      if (!result.success) {
        console.warn(
          `[SandboxManager] Dapr state delete failed:`,
          result.error
        );
      }
    } catch (error) {
      console.warn(
        `[SandboxManager] Dapr state delete error:`,
        error
      );
    }
  }
}

/**
 * Generate a unique claim name from session ID
 */
function generateClaimName(sessionId: string): string {
  // Use first 8 chars of session ID for uniqueness while keeping name short
  const shortId = sessionId.slice(0, 8).toLowerCase().replace(/[^a-z0-9]/g, "");
  return `agent-${shortId}`;
}

/**
 * Provision a new sandbox for an agent session
 * Creates a SandboxClaim and waits for it to become ready
 */
export async function provisionSandbox(
  options: ProvisionOptions
): Promise<SandboxInfo> {
  const config = getSandboxConfig();

  // Check if sandbox mode is enabled
  if (config.mode !== "k8s") {
    throw new Error(
      "Sandbox mode is not enabled. Set SANDBOX_MODE=k8s to use Kubernetes sandboxes."
    );
  }

  const { sessionId, labels = {}, timeout } = options;
  const claimName = generateClaimName(sessionId);

  // Check if we already have a sandbox for this session (in registry)
  const existing = await getFromRegistry(sessionId);
  if (existing) {
    return existing;
  }

  // Check if claim already exists (resume case)
  const existingClaim = await getSandboxClaim(claimName, config.namespace);
  if (existingClaim) {
    // Check if sandbox is ready by looking at conditions
    const isReady = existingClaim.status?.phase === "Ready" ||
      existingClaim.status?.conditions?.some(
        (c) => c.type === "Ready" && c.status === "True"
      );

    if (isReady) {
      // Get the sandbox name from the claim status
      const sandboxName = existingClaim.status?.sandbox?.Name ||
        existingClaim.status?.sandbox?.podName ||
        claimName;

      // Fetch the Sandbox resource - pod name is same as sandbox name
      const sandboxResource = await getSandboxResource(sandboxName, config.namespace);
      // Pod name is the same as sandbox name (per agent-sandbox convention)
      const podName = sandboxResource?.metadata.annotations?.["agents.x-k8s.io/pod-name"]
        || sandboxResource?.metadata.name
        || sandboxName;

      if (sandboxResource) {
        // Determine Dapr app ID for service invocation
        // Format: {podName}.{namespace} for cross-namespace Dapr service invocation
        // Dapr uses pod name as app-id by default when dapr.io/app-id annotation is not set
        const daprEnabled = process.env.USE_DAPR_SERVICE_INVOCATION === "true";
        const info: SandboxInfo = {
          claimName,
          namespace: config.namespace,
          podName,
          podIP: existingClaim.status?.sandbox?.podIP,
          phase: "Ready",
          workdir: "/home/gem",
          provisionedAt: new Date(),
          daprAppId: daprEnabled ? `${podName}.${config.namespace}` : undefined,
          daprEnabled,
        };
        await saveToRegistry(sessionId, info);
        return info;
      }
    }
  }

  // Create new SandboxClaim
  await createSandboxClaim({
    name: claimName,
    namespace: config.namespace,
    templateName: config.templateName,
    labels: {
      sessionId,
      ...labels,
    },
    timeout: timeout || config.timeout,
  });

  // Wait for sandbox to become ready (from warm pool: typically <5s, cold start can take longer)
  const sandboxInfo = await waitForSandboxReady(
    claimName,
    config.namespace,
    120000 // 120 second timeout for cold starts
  );

  // Enrich with Dapr information
  // Format: {podName}.{namespace} for cross-namespace Dapr service invocation
  const daprEnabled = process.env.USE_DAPR_SERVICE_INVOCATION === "true";
  sandboxInfo.daprEnabled = daprEnabled;
  sandboxInfo.daprAppId = daprEnabled
    ? `${sandboxInfo.podName}.${config.namespace}`
    : undefined;

  // Save to registry (Dapr state store + local cache)
  await saveToRegistry(sessionId, sandboxInfo);

  // Publish sandbox lifecycle events (fire-and-forget, don't block on errors)
  publishSandboxProvisioned({
    sessionId,
    podName: sandboxInfo.podName,
    podIP: sandboxInfo.podIP,
  }).catch((err) =>
    console.warn("[SandboxManager] Failed to publish provisioned event:", err)
  );

  publishSandboxReady({
    sessionId,
    capabilities: ["shell", "browser", "file", "mcp"],
  }).catch((err) =>
    console.warn("[SandboxManager] Failed to publish ready event:", err)
  );

  return sandboxInfo;
}

/**
 * Get sandbox info for a session
 */
export async function getSandbox(sessionId: string): Promise<SandboxInfo | null> {
  // Check registry (Dapr state store + local cache)
  const cached = await getFromRegistry(sessionId);
  if (cached) {
    return cached;
  }

  const config = getSandboxConfig();
  if (config.mode !== "k8s") {
    return null;
  }

  // Try to find the claim
  const claimName = generateClaimName(sessionId);
  const claim = await getSandboxClaim(claimName, config.namespace);

  if (!claim) {
    return null;
  }

  // Check if sandbox is ready
  const isReady = claim.status?.phase === "Ready" ||
    claim.status?.conditions?.some(
      (c) => c.type === "Ready" && c.status === "True"
    );

  if (!isReady) {
    return null;
  }

  // Get the sandbox name from the claim status
  const sandboxName = claim.status?.sandbox?.Name ||
    claim.status?.sandbox?.podName ||
    claimName;

  // Fetch the Sandbox resource to get the actual pod name from annotations
  const sandboxResource = await getSandboxResource(sandboxName, config.namespace);
  const podName = sandboxResource?.metadata.annotations?.["agents.x-k8s.io/pod-name"];

  if (!podName) {
    return null;
  }

  // Enrich with Dapr information
  // Format: {podName}.{namespace} for cross-namespace Dapr service invocation
  const daprEnabled = process.env.USE_DAPR_SERVICE_INVOCATION === "true";
  const info: SandboxInfo = {
    claimName,
    namespace: config.namespace,
    podName,
    podIP: claim.status?.sandbox?.podIP,
    phase: "Ready",
    workdir: "/home/gem",
    provisionedAt: new Date(), // Approximate
    daprAppId: daprEnabled ? `${podName}.${config.namespace}` : undefined,
    daprEnabled,
  };

  // Save to registry
  await saveToRegistry(sessionId, info);

  return info;
}

/**
 * Get current sandbox status
 */
export async function getSandboxPhase(
  sessionId: string
): Promise<SandboxPhase | null> {
  const config = getSandboxConfig();
  if (config.mode !== "k8s") {
    return null;
  }

  const claimName = generateClaimName(sessionId);
  const status = await getSandboxStatus(claimName, config.namespace);

  return status?.phase ?? null;
}

/**
 * Release a sandbox (delete the SandboxClaim)
 * The controller will handle cleanup of the actual pod
 */
export async function releaseSandbox(options: ReleaseOptions): Promise<void> {
  const config = getSandboxConfig();

  if (config.mode !== "k8s") {
    return;
  }

  const { sessionId } = options;
  const claimName = generateClaimName(sessionId);

  // Get sandbox info before deleting (for duration calculation)
  const sandboxInfo = await getFromRegistry(sessionId);
  const duration = sandboxInfo
    ? Date.now() - sandboxInfo.provisionedAt.getTime()
    : undefined;

  // Remove from registry (Dapr state store + local cache)
  await deleteFromRegistry(sessionId);

  // Delete the claim (controller handles pod cleanup)
  await deleteSandboxClaim(claimName, config.namespace);

  // Publish sandbox released event (fire-and-forget)
  publishSandboxReleased({
    sessionId,
    reason: options.force ? "force-released" : "released",
    duration,
  }).catch((err) =>
    console.warn("[SandboxManager] Failed to publish released event:", err)
  );
}

/**
 * Create a sandbox context for tools
 * Returns local context when not in K8s mode
 */
export async function createSandboxContext(
  sessionId: string,
  repoPath: string
): Promise<SandboxContext> {
  const config = getSandboxConfig();

  if (config.mode !== "k8s") {
    return {
      mode: "local",
      repoPath,
    };
  }

  // Get or provision sandbox
  let sandbox = await getSandbox(sessionId);

  if (!sandbox) {
    // Provision a new sandbox
    sandbox = await provisionSandbox({ sessionId });
  }

  return {
    mode: "k8s",
    sandbox,
    repoPath: "/home/gem", // User home directory in sandbox
  };
}

/**
 * Check if sandbox mode is available
 */
export async function isSandboxModeAvailable(): Promise<{
  available: boolean;
  reason?: string;
}> {
  const config = getSandboxConfig();

  if (config.mode !== "k8s") {
    return {
      available: false,
      reason: "Sandbox mode not enabled (SANDBOX_MODE != k8s)",
    };
  }

  const connected = await checkK8sConnection();
  if (!connected) {
    return {
      available: false,
      reason: "Cannot connect to Kubernetes API",
    };
  }

  return { available: true };
}

/**
 * Get all active sandboxes (for monitoring/debugging)
 */
export function getActiveSandboxes(): Map<string, SandboxInfo> {
  return new Map(activeSandboxes);
}

/**
 * Clear sandbox cache (for testing)
 */
export function clearSandboxCache(): void {
  activeSandboxes.clear();
}
