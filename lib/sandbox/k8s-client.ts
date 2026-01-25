/**
 * Kubernetes Client Wrapper
 * Handles K8s API interactions for sandbox management
 */

import * as k8s from "@kubernetes/client-node";
import type {
  SandboxClaim,
  SandboxClaimStatus,
  SandboxInfo,
  SandboxExecOptions,
  SandboxExecResult,
  Sandbox,
} from "./types";
import { getSandboxConfig } from "./types";
import { PassThrough } from "stream";

// CRD API constants for SandboxClaim
const CRD_GROUP = "extensions.agents.x-k8s.io";
const CRD_VERSION = "v1alpha1";
const CRD_PLURAL = "sandboxclaims";

// CRD API constants for Sandbox (different API group)
const SANDBOX_GROUP = "agents.x-k8s.io";
const SANDBOX_VERSION = "v1alpha1";
const SANDBOX_PLURAL = "sandboxes";

/**
 * K8s client instances
 */
interface K8sClients {
  coreApi: k8s.CoreV1Api;
  customApi: k8s.CustomObjectsApi;
  exec: k8s.Exec;
  kubeConfig: k8s.KubeConfig;
}

let clientsInstance: K8sClients | null = null;

/**
 * Initialize and return K8s client instances
 * Uses in-cluster config when running in K8s, otherwise loads from kubeconfig
 */
export function createK8sClients(): K8sClients {
  if (clientsInstance) {
    return clientsInstance;
  }

  const kc = new k8s.KubeConfig();

  // Check if running in a Kubernetes cluster
  if (process.env.KUBERNETES_SERVICE_HOST) {
    kc.loadFromCluster();
  } else {
    // Load from default kubeconfig location
    kc.loadFromDefault();
  }

  clientsInstance = {
    coreApi: kc.makeApiClient(k8s.CoreV1Api),
    customApi: kc.makeApiClient(k8s.CustomObjectsApi),
    exec: new k8s.Exec(kc),
    kubeConfig: kc,
  };

  return clientsInstance;
}

/**
 * Reset the client instance (useful for testing)
 */
export function resetK8sClients(): void {
  clientsInstance = null;
}

/**
 * Create a SandboxClaim custom resource
 */
export async function createSandboxClaim(options: {
  name: string;
  namespace: string;
  templateName: string;
  labels?: Record<string, string>;
  timeout?: string;
}): Promise<SandboxClaim> {
  const { customApi } = createK8sClients();
  const { name, namespace, templateName, labels, timeout } = options;

  const claim: SandboxClaim = {
    apiVersion: `${CRD_GROUP}/${CRD_VERSION}`,
    kind: "SandboxClaim",
    metadata: {
      name,
      namespace,
      labels: {
        "app.kubernetes.io/managed-by": "ai-chatbot",
        ...labels,
      },
    },
    spec: {
      sandboxTemplateRef: {
        name: templateName,
      },
      ...(timeout ? { timeout } : {}),
    },
  };

  try {
    const response = await customApi.createNamespacedCustomObject({
      group: CRD_GROUP,
      version: CRD_VERSION,
      namespace,
      plural: CRD_PLURAL,
      body: claim,
    });

    return response as unknown as SandboxClaim;
  } catch (error: unknown) {
    // Handle 409 Conflict - claim already exists, return the existing one
    const httpError = error as { code?: number; response?: { statusCode?: number } };
    if (httpError?.code === 409 || httpError?.response?.statusCode === 409) {
      const existing = await getSandboxClaim(name, namespace);
      if (existing) {
        return existing;
      }
    }
    throw error;
  }
}

/**
 * Get a SandboxClaim by name
 */
export async function getSandboxClaim(
  name: string,
  namespace: string
): Promise<SandboxClaim | null> {
  const { customApi } = createK8sClients();

  try {
    const response = await customApi.getNamespacedCustomObject({
      group: CRD_GROUP,
      version: CRD_VERSION,
      namespace,
      plural: CRD_PLURAL,
      name,
    });

    return response as unknown as SandboxClaim;
  } catch (error: unknown) {
    // Return null if not found (404)
    // Check for HTTP status code in the error response (different K8s client versions use different formats)
    const httpError = error as {
      response?: { statusCode?: number };
      code?: number;
      body?: string;
    };
    if (httpError?.response?.statusCode === 404 || httpError?.code === 404) {
      return null;
    }
    // Also check if body contains NotFound
    if (httpError?.body?.includes('"code":404') || httpError?.body?.includes('"reason":"NotFound"')) {
      return null;
    }
    throw error;
  }
}

/**
 * Delete a SandboxClaim
 */
export async function deleteSandboxClaim(
  name: string,
  namespace: string
): Promise<void> {
  const { customApi } = createK8sClients();

  try {
    await customApi.deleteNamespacedCustomObject({
      group: CRD_GROUP,
      version: CRD_VERSION,
      namespace,
      plural: CRD_PLURAL,
      name,
    });
  } catch (error: unknown) {
    // Ignore 404 errors (already deleted)
    // Check for HTTP status code in the error response
    const httpError = error as { response?: { statusCode?: number } };
    if (httpError?.response?.statusCode === 404) {
      return;
    }
    throw error;
  }
}

/**
 * List SandboxClaims with optional label selector
 */
export async function listSandboxClaims(
  namespace: string,
  labelSelector?: string
): Promise<SandboxClaim[]> {
  const { customApi } = createK8sClients();

  const response = await customApi.listNamespacedCustomObject({
    group: CRD_GROUP,
    version: CRD_VERSION,
    namespace,
    plural: CRD_PLURAL,
    labelSelector,
  });

  const list = response as { items: SandboxClaim[] };
  return list.items;
}

/**
 * Get a Sandbox resource by name
 * The Sandbox resource contains the pod name in its annotations
 */
export async function getSandbox(
  name: string,
  namespace: string
): Promise<Sandbox | null> {
  const { customApi } = createK8sClients();

  try {
    const response = await customApi.getNamespacedCustomObject({
      group: SANDBOX_GROUP,
      version: SANDBOX_VERSION,
      namespace,
      plural: SANDBOX_PLURAL,
      name,
    });

    return response as unknown as Sandbox;
  } catch (error: unknown) {
    const httpError = error as {
      response?: { statusCode?: number };
      code?: number;
      body?: string;
    };
    if (httpError?.response?.statusCode === 404 || httpError?.code === 404) {
      return null;
    }
    if (httpError?.body?.includes('"code":404') || httpError?.body?.includes('"reason":"NotFound"')) {
      return null;
    }
    throw error;
  }
}

/**
 * Wait for a SandboxClaim to reach the Ready phase
 */
export async function waitForSandboxReady(
  name: string,
  namespace: string,
  timeoutMs: number = 120000
): Promise<SandboxInfo> {
  const startTime = Date.now();
  const pollInterval = 500; // Poll every 500ms

  while (Date.now() - startTime < timeoutMs) {
    const claim = await getSandboxClaim(name, namespace);

    if (!claim) {
      throw new Error(`SandboxClaim ${name} not found`);
    }

    const status = claim.status;

    // Check for Ready condition (sandbox controller uses conditions, not phase)
    const isReady = status?.phase === "Ready" ||
      status?.conditions?.some((c: { type: string; status: string }) =>
        c.type === "Ready" && c.status === "True"
      );

    if (isReady) {
      const sandboxRef = status?.sandbox;
      // The sandbox name is in status.sandbox.Name
      const sandboxName = sandboxRef?.Name || sandboxRef?.podName || name;

      // Fetch the Sandbox resource to get the pod name from annotations
      const sandboxResource = await getSandbox(sandboxName, namespace);
      if (!sandboxResource) {
        throw new Error(
          `SandboxClaim ${name} is Ready but Sandbox resource ${sandboxName} not found`
        );
      }

      // Get pod name - try annotation first, fall back to sandbox name
      // The sandbox controller creates pods with the same name as the sandbox
      const podName = sandboxResource.metadata.annotations?.["agents.x-k8s.io/pod-name"]
        || sandboxResource.metadata.name
        || sandboxName;

      // Verify the pod actually exists and get its IP
      const { coreApi } = createK8sClients();
      let podIP: string | undefined = sandboxRef?.podIP;
      let sandboxNameHash: string | undefined;
      let daprEnabled = false;
      try {
        const pod = await coreApi.readNamespacedPod({ name: podName, namespace });
        // Get Pod IP from the pod status (more reliable than claim status)
        podIP = pod.status?.podIP || podIP;
        // Get the sandbox name hash for creating Dapr service
        sandboxNameHash = pod.metadata?.labels?.["agents.x-k8s.io/sandbox-name-hash"];
        // Check if Dapr sidecar was injected (look for daprd container)
        daprEnabled = pod.spec?.containers?.some(c => c.name === "daprd") || false;
        console.log(`[waitForSandboxReady] Pod ${podName} IP: ${podIP}, hash: ${sandboxNameHash}, daprEnabled: ${daprEnabled}`);
      } catch (podError: unknown) {
        const httpError = podError as { response?: { statusCode?: number } };
        if (httpError?.response?.statusCode === 404) {
          throw new Error(
            `Sandbox ${sandboxName} is Ready but pod ${podName} not found`
          );
        }
        throw podError;
      }

      // Create Dapr service for the sandbox pod if sidecar is injected
      // This enables Dapr service invocation (mTLS, retries, tracing)
      if (daprEnabled && sandboxNameHash) {
        try {
          await createDaprServiceForSandbox(podName, namespace, sandboxNameHash);
          console.log(`[waitForSandboxReady] Created Dapr service for ${podName}`);
        } catch (daprServiceError: unknown) {
          // Log but don't fail - HTTP fallback will still work
          console.warn(
            `[waitForSandboxReady] Failed to create Dapr service for ${podName}:`,
            daprServiceError instanceof Error ? daprServiceError.message : daprServiceError
          );
        }
      } else if (!daprEnabled) {
        console.log(`[waitForSandboxReady] Dapr sidecar not injected, skipping Dapr service creation`);
      } else if (!sandboxNameHash) {
        console.warn(`[waitForSandboxReady] No sandbox-name-hash label found, cannot create Dapr service`);
      }

      // Wait for HTTP API to be ready (pod Running doesn't mean services are up)
      if (podIP) {
        const httpHealthCheckTimeout = 30000; // 30 seconds for HTTP API
        const httpCheckStart = Date.now();
        const httpCheckInterval = 1000; // Check every 1 second
        let httpReady = false;

        console.log(`[waitForSandboxReady] Waiting for HTTP API at ${podIP}:8091...`);
        while (Date.now() - httpCheckStart < httpHealthCheckTimeout) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            const response = await fetch(`http://${podIP}:8091/v1/docs`, {
              method: "GET",
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (response.ok || response.status === 404) {
              // 404 is OK - it means the server is responding
              httpReady = true;
              console.log(`[waitForSandboxReady] HTTP API ready at ${podIP}:8091`);
              break;
            }
          } catch {
            // Connection failed, wait and retry
          }
          await new Promise((resolve) => setTimeout(resolve, httpCheckInterval));
        }

        if (!httpReady) {
          console.warn(`[waitForSandboxReady] HTTP API not ready after ${httpHealthCheckTimeout}ms, proceeding anyway`);
        }
      }

      return {
        claimName: name,
        namespace,
        podName,
        podIP,
        phase: "Ready",
        // AIO Sandbox uses /home/gem as the default working directory
        workdir: "/home/gem",
        provisionedAt: new Date(),
        // Dapr service invocation info - appId is podName.namespace for cross-namespace calls
        daprAppId: daprEnabled ? `${podName}.${namespace}` : undefined,
        daprEnabled,
      };
    }

    // Check for Failed condition
    const isFailed = status?.phase === "Failed" ||
      status?.conditions?.some((c: { type: string; status: string; reason?: string }) =>
        c.type === "Ready" && c.status === "False" && c.reason === "Failed"
      );

    if (isFailed) {
      const failMessage = status?.conditions?.find((c: { type: string }) => c.type === "Ready")?.message;
      throw new Error(
        `SandboxClaim ${name} failed: ${failMessage || status?.message || "Unknown error"}`
      );
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(
    `Timeout waiting for SandboxClaim ${name} to become ready (${timeoutMs}ms)`
  );
}

/**
 * Get sandbox status without waiting
 */
export async function getSandboxStatus(
  name: string,
  namespace: string
): Promise<SandboxClaimStatus | null> {
  const claim = await getSandboxClaim(name, namespace);
  return claim?.status ?? null;
}

/**
 * Execute a command in a sandbox pod
 */
export async function execInSandbox(
  options: SandboxExecOptions
): Promise<SandboxExecResult> {
  const { exec, kubeConfig } = createK8sClients();
  const {
    namespace,
    podName,
    containerName = "sandbox",
    command,
    workdir,
    timeout = 120,
  } = options;

  // Build the final command
  // Always use sh -c to handle complex commands properly
  const commandString = Array.isArray(command) ? command.join(" ") : command;

  // Only wrap with cd if workdir is explicitly provided
  // This avoids double-wrapping when the caller already included cd in the command
  const fullCommand = workdir
    ? `cd ${workdir} && ${commandString}`
    : commandString;

  const finalCmd = ["sh", "-c", fullCommand];

  // Debug logging (sanitize tokens)
  const sanitizedCmd = fullCommand.replace(/x-access-token:[^@]+@/g, "x-access-token:***@");
  console.log(`[execInSandbox] Running: sh -c "${sanitizedCmd.substring(0, 200)}..."`);
  console.log(`[execInSandbox] Pod: ${podName}, Namespace: ${namespace}`);
  console.log(`[execInSandbox] Command length: ${fullCommand.length}, finalCmd:`, JSON.stringify(finalCmd.map(c => c.length > 50 ? c.substring(0, 50) + '...' : c)));

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const stdoutStream = new PassThrough();
    const stderrStream = new PassThrough();

    stdoutStream.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    stderrStream.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    // Set up timeout
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      reject(new Error(`Command execution timed out after ${timeout}s`));
    }, timeout * 1000);

    exec
      .exec(
        namespace,
        podName,
        containerName,
        finalCmd,
        stdoutStream,
        stderrStream,
        null, // stdin
        false, // tty
        (status: k8s.V1Status) => {
          clearTimeout(timeoutHandle);

          if (timedOut) {
            return;
          }

          // Extract exit code from status
          // The status object contains the exit code in different formats
          const exitCode =
            status.status === "Success"
              ? 0
              : // biome-ignore lint: any type needed for K8s status parsing
                parseInt((status as any).details?.causes?.[0]?.message || "1");

          resolve({
            exitCode,
            stdout,
            stderr,
            result: stdout || stderr,
          });
        }
      )
      .catch((error: Error) => {
        clearTimeout(timeoutHandle);
        if (!timedOut) {
          reject(error);
        }
      });
  });
}

/**
 * Check if the K8s API is accessible
 */
export async function checkK8sConnection(): Promise<boolean> {
  try {
    const { coreApi } = createK8sClients();
    await coreApi.listNamespacedPod({ namespace: "default", limit: 1 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get pod logs for debugging
 */
export async function getSandboxLogs(
  podName: string,
  namespace: string,
  options?: {
    containerName?: string;
    tailLines?: number;
    sinceSeconds?: number;
  }
): Promise<string> {
  const { coreApi } = createK8sClients();

  const response = await coreApi.readNamespacedPodLog({
    name: podName,
    namespace,
    container: options?.containerName || "sandbox",
    tailLines: options?.tailLines,
    sinceSeconds: options?.sinceSeconds,
  });

  return response;
}

/**
 * AIO Sandbox HTTP API response type
 */
interface AIOShellExecResponse {
  success: boolean;
  message: string;
  data?: {
    session_id: string;
    command: string;
    status: string;
    output: string;
    exit_code: number;
    console?: Array<{
      ps1: string;
      command: string;
      output: string;
    }>;
  };
  error?: string;
}

/**
 * Execute a command in a sandbox via HTTP API
 * This uses the AIO Sandbox's built-in HTTP API at port 8080
 * which avoids the K8s exec WebSocket authentication issues
 */
export async function execInSandboxViaHttp(
  options: SandboxExecOptions & { podIP: string }
): Promise<SandboxExecResult> {
  const {
    podIP,
    command,
    workdir,
    timeout = 120,
  } = options;

  // Build the command string
  const commandString = Array.isArray(command) ? command.join(" ") : command;

  // Wrap with cd if workdir provided
  const fullCommand = workdir
    ? `cd ${workdir} && ${commandString}`
    : commandString;

  // Debug logging (sanitize tokens)
  const sanitizedCmd = fullCommand.replace(/x-access-token:[^@]+@/g, "x-access-token:***@");
  console.log(`[execViaHttp] Running: ${sanitizedCmd.substring(0, 200)}...`);
  console.log(`[execViaHttp] Pod IP: ${podIP}`);

  const apiUrl = `http://${podIP}:8091/v1/shell/exec`;
  const requestBody = JSON.stringify({
    command: fullCommand,
    timeout: timeout,
  });

  // Retry logic - sandbox HTTP API may not be ready immediately after pod creation
  const maxRetries = 3;
  const retryDelayMs = 2000;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout * 1000);

      console.log(`[execViaHttp] Attempt ${attempt}/${maxRetries}: Fetching ${apiUrl}, body length: ${requestBody.length}`);

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: requestBody,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        return {
          exitCode: 1,
          result: `HTTP API error: ${response.status} ${errorText}`,
          stdout: "",
          stderr: `HTTP ${response.status}: ${errorText}`,
        };
      }

      const result: AIOShellExecResponse = await response.json();

      if (!result.success || !result.data) {
        return {
          exitCode: 1,
          result: result.error || result.message || "Unknown error",
          stdout: "",
          stderr: result.error || result.message || "Unknown error",
        };
      }

      // Success - return the result
      return {
        exitCode: result.data.exit_code,
        result: result.data.output,
        stdout: result.data.output,
        stderr: "", // HTTP API combines output
      };
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if this is a connection error (ECONNREFUSED) and we should retry
      const isConnectionError = error instanceof Error &&
        (error.message.includes("ECONNREFUSED") ||
         error.message.includes("fetch failed") ||
         (error.cause && typeof error.cause === "object" &&
          "code" in error.cause && error.cause.code === "ECONNREFUSED"));

      if (isConnectionError && attempt < maxRetries) {
        console.log(`[execViaHttp] Connection failed, retrying in ${retryDelayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        continue;
      }

      // Log the error
      if (error instanceof Error) {
        console.error(`[execViaHttp] Error:`, error.name, error.message);
      }

      // Don't retry - either not a connection error or out of retries
      break;
    }
  }

  // All retries exhausted - return the error
  let errorMessage: string;
  if (lastError) {
    if (lastError.name === "AbortError") {
      errorMessage = `Command execution timed out after ${timeout}s`;
    } else {
      errorMessage = `${lastError.name}: ${lastError.message}`;
      if (lastError.cause) {
        errorMessage += ` (cause: ${JSON.stringify(lastError.cause)})`;
      }
    }
  } else {
    errorMessage = "Unknown error";
  }

  return {
    exitCode: 1,
    result: `HTTP API error: ${errorMessage}`,
    stdout: "",
    stderr: errorMessage,
  };
}

/**
 * Create a Dapr service for a sandbox pod
 *
 * Since the Dapr Operator doesn't create -dapr services for CRD-owned pods
 * (like those created by agent-sandbox-controller), we create the service
 * ourselves to enable Dapr service invocation.
 *
 * IMPORTANT: The service name MUST have a "-dapr" suffix for Dapr to resolve it.
 * Dapr looks for: {appId}-dapr.{namespace}.svc.cluster.local
 *
 * The service enables invocation via:
 *   http://localhost:3500/v1.0/invoke/{appId}.{namespace}/method/{endpoint}
 *
 * @param podName - The name of the sandbox pod (becomes the Dapr app-id)
 * @param namespace - The namespace where the pod and service reside
 * @param sandboxNameHash - The unique hash label from the sandbox pod (e.g., "8e1b27e5")
 */
export async function createDaprServiceForSandbox(
  podName: string,
  namespace: string,
  sandboxNameHash: string
): Promise<void> {
  const { coreApi } = createK8sClients();

  // Service name must have -dapr suffix for Dapr service invocation to work
  const serviceName = `${podName}-dapr`;

  const service: k8s.V1Service = {
    apiVersion: "v1",
    kind: "Service",
    metadata: {
      name: serviceName,
      namespace,
      labels: {
        "dapr.io/app-id": podName,
        "app.kubernetes.io/managed-by": "ai-chatbot",
        "app.kubernetes.io/component": "sandbox-dapr-service",
      },
      annotations: {
        "ai-chatbot/created-for": "dapr-service-invocation",
        "ai-chatbot/sandbox-hash": sandboxNameHash,
        "ai-chatbot/sandbox-pod": podName,
      },
    },
    spec: {
      selector: {
        // Use the unique hash label that matches the specific sandbox pod
        "agents.x-k8s.io/sandbox-name-hash": sandboxNameHash,
      },
      ports: [
        {
          name: "dapr-http",
          port: 3500,
          targetPort: 3500,
          protocol: "TCP",
        },
        {
          name: "dapr-grpc",
          port: 50001,
          targetPort: 50001,
          protocol: "TCP",
        },
        {
          name: "dapr-internal-grpc",
          port: 50002,
          targetPort: 50002,
          protocol: "TCP",
        },
        {
          name: "dapr-metrics",
          port: 9090,
          targetPort: 9090,
          protocol: "TCP",
        },
      ],
    },
  };

  try {
    await coreApi.createNamespacedService({ namespace, body: service });
    console.log(`[createDaprServiceForSandbox] Created Dapr service ${serviceName} for ${podName} in ${namespace}`);
  } catch (error: unknown) {
    // Handle 409 Conflict - service already exists
    const httpError = error as { code?: number; response?: { statusCode?: number } };
    if (httpError?.code === 409 || httpError?.response?.statusCode === 409) {
      console.log(`[createDaprServiceForSandbox] Dapr service ${serviceName} already exists`);
      return;
    }
    throw error;
  }
}

/**
 * Delete a Dapr service for a sandbox pod
 *
 * Called during sandbox cleanup to remove the service we created.
 *
 * @param podName - The name of the sandbox pod (service name is {podName}-dapr)
 * @param namespace - The namespace where the service resides
 */
export async function deleteDaprServiceForSandbox(
  podName: string,
  namespace: string
): Promise<void> {
  const { coreApi } = createK8sClients();

  // Service name has -dapr suffix
  const serviceName = `${podName}-dapr`;

  try {
    await coreApi.deleteNamespacedService({ name: serviceName, namespace });
    console.log(`[deleteDaprServiceForSandbox] Deleted Dapr service ${serviceName} in ${namespace}`);
  } catch (error: unknown) {
    // Ignore 404 errors (already deleted)
    const httpError = error as { response?: { statusCode?: number } };
    if (httpError?.response?.statusCode === 404) {
      return;
    }
    throw error;
  }
}
