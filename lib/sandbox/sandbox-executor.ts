/**
 * Sandbox Executor
 * Provides the same interface as shell-executor but routes to K8s sandbox pods
 */

import type {
  ExecuteResponse,
  ExecuteCommandOptions,
} from "@/lib/agent/shell-executor";
import { executeCommand as executeLocalCommand } from "@/lib/agent/shell-executor";
import type { SandboxContext, SandboxInfo } from "./types";
import { execInSandbox, execInSandboxViaHttp } from "./k8s-client";
import { execInSandboxViaDapr, isDaprAvailable } from "./dapr-client";

/**
 * Execute a command in a sandbox context
 * Routes to K8s pod exec when in sandbox mode, otherwise uses local execution
 */
export async function executeInSandbox(
  options: ExecuteCommandOptions,
  context: SandboxContext
): Promise<ExecuteResponse> {
  // If in local mode, use the existing shell executor
  if (context.mode === "local" || !context.sandbox) {
    return executeLocalCommand(options);
  }

  // Execute in K8s sandbox
  return executeInK8sSandbox(options, context.sandbox);
}

/**
 * Execute a command in a Kubernetes sandbox pod
 * Priority order:
 * 1. Dapr service invocation (when enabled and available) - provides distributed tracing
 * 2. HTTP API (when podIP is available) - avoids K8s exec WebSocket issues
 * 3. K8s exec (fallback) - direct pod exec
 */
async function executeInK8sSandbox(
  options: ExecuteCommandOptions,
  sandbox: SandboxInfo
): Promise<ExecuteResponse> {
  const {
    command,
    workdir = sandbox.workdir,
    env = {},
    timeout = 120,
  } = options;

  // Convert command to string if needed
  const commandString = Array.isArray(command) ? command.join(" ") : command;

  // Build environment variable exports
  const envExports = Object.entries(env)
    .map(([key, value]) => `export ${key}="${String(value).replace(/"/g, '\\"')}"`)
    .join("; ");

  // Build the full command with env (workdir handled separately)
  const fullCommand = envExports
    ? `${envExports}; ${commandString}`
    : commandString;

  // Convert timeout to milliseconds for API calls
  const timeoutMs = timeout * 1000;

  // Try Dapr service invocation first when available
  // Dapr is preferred for: mTLS, distributed tracing, retries, circuit breakers
  // Use DISABLE_DAPR_SERVICE_INVOCATION=true to explicitly disable
  const daprDisabled = process.env.DISABLE_DAPR_SERVICE_INVOCATION === "true";
  if (!daprDisabled && sandbox.daprAppId && sandbox.daprEnabled) {
    console.log(
      `[executeInK8sSandbox] Attempting Dapr service invocation (appId: ${sandbox.daprAppId})`
    );

    if (await isDaprAvailable()) {
      try {
        const result = await execInSandboxViaDapr(
          sandbox.daprAppId,
          fullCommand,
          workdir,
          timeoutMs
        );

        if (result.success && result.data) {
          console.log(`[executeInK8sSandbox] Dapr invocation succeeded`);
          // Sandbox API returns snake_case fields: exit_code, output
          return {
            exitCode: result.data.exit_code,
            result: result.data.output,
            stdout: result.data.output,
            stderr: "", // Sandbox API combines output into single field
          };
        }

        // Dapr invocation failed, fall back to other methods
        console.warn(
          `[executeInK8sSandbox] Dapr invocation failed, falling back to HTTP:`,
          result.error
        );
      } catch (daprError: unknown) {
        console.warn(
          `[executeInK8sSandbox] Dapr error, falling back to HTTP:`,
          daprError
        );
      }
    } else {
      console.log(`[executeInK8sSandbox] Dapr sidecar not available, using HTTP API`);
    }
  }

  // Prefer HTTP API when podIP is available (avoids K8s exec WebSocket issues)
  if (sandbox.podIP) {
    console.log(`[executeInK8sSandbox] Using HTTP API (podIP: ${sandbox.podIP})`);
    try {
      const result = await execInSandboxViaHttp({
        podIP: sandbox.podIP,
        namespace: sandbox.namespace,
        podName: sandbox.podName,
        command: fullCommand,
        workdir,
        timeout,
      });

      return {
        exitCode: result.exitCode,
        result: result.result,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (httpError: unknown) {
      // Log HTTP error and fall back to K8s exec
      console.warn(`[executeInK8sSandbox] HTTP API failed, falling back to K8s exec:`, httpError);
    }
  }

  // Fall back to K8s exec
  console.log(`[executeInK8sSandbox] Using K8s exec (no podIP or HTTP failed)`);
  try {
    // Build full command with workdir for K8s exec
    const k8sCommand = `cd ${workdir} && ${fullCommand}`;

    const result = await execInSandbox({
      namespace: sandbox.namespace,
      podName: sandbox.podName,
      command: k8sCommand,
      timeout,
    });

    return {
      exitCode: result.exitCode,
      result: result.result,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error: unknown) {
    // Properly serialize the error object
    let errorMessage: string;
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === "object" && error !== null) {
      // Handle K8s API error objects which may have various shapes
      const errorObj = error as Record<string, unknown>;
      errorMessage = errorObj.message as string
        || errorObj.body as string
        || JSON.stringify(error);
    } else {
      errorMessage = String(error);
    }
    return {
      exitCode: 1,
      result: `Sandbox execution error: ${errorMessage}`,
      stdout: "",
      stderr: errorMessage,
    };
  }
}

/**
 * Execute a command and throw if it fails (sandbox-aware version)
 */
export async function executeInSandboxOrThrow(
  options: ExecuteCommandOptions,
  context: SandboxContext
): Promise<ExecuteResponse> {
  const result = await executeInSandbox(options, context);

  if (result.exitCode !== 0) {
    throw new Error(
      `Command failed with exit code ${result.exitCode}: ${result.stderr || result.stdout}`
    );
  }

  return result;
}

/**
 * Read a file from the sandbox
 */
export async function readFileInSandbox(
  path: string,
  context: SandboxContext
): Promise<string> {
  const result = await executeInSandbox(
    {
      command: `cat "${path}"`,
      timeout: 30,
    },
    context
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to read file ${path}: ${result.stderr}`);
  }

  return result.stdout;
}

/**
 * Write a file in the sandbox
 */
export async function writeFileInSandbox(
  path: string,
  content: string,
  context: SandboxContext
): Promise<void> {
  // Use base64 encoding to handle special characters safely
  const base64Content = Buffer.from(content).toString("base64");

  const result = await executeInSandbox(
    {
      command: `echo "${base64Content}" | base64 -d > "${path}"`,
      timeout: 30,
    },
    context
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to write file ${path}: ${result.stderr}`);
  }
}

/**
 * Check if a path exists in the sandbox
 */
export async function pathExistsInSandbox(
  path: string,
  context: SandboxContext
): Promise<boolean> {
  const result = await executeInSandbox(
    {
      command: `test -e "${path}" && echo "exists" || echo "not_found"`,
      timeout: 10,
    },
    context
  );

  const output = result.stdout || result.result || "";
  return output.trim() === "exists";
}

/**
 * Check if a path is a directory in the sandbox
 */
export async function isDirectoryInSandbox(
  path: string,
  context: SandboxContext
): Promise<boolean> {
  const result = await executeInSandbox(
    {
      command: `test -d "${path}" && echo "dir" || echo "not_dir"`,
      timeout: 10,
    },
    context
  );

  const output = result.stdout || result.result || "";
  return output.trim() === "dir";
}

/**
 * List directory contents in the sandbox
 */
export async function listDirectoryInSandbox(
  path: string,
  context: SandboxContext
): Promise<
  Array<{
    name: string;
    type: "file" | "dir";
  }>
> {
  const result = await executeInSandbox(
    {
      command: `ls -la "${path}" | tail -n +2 | awk '{print $1, $NF}'`,
      timeout: 30,
    },
    context
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to list directory ${path}: ${result.stderr || result.result}`);
  }

  const entries: Array<{ name: string; type: "file" | "dir" }> = [];
  const output = result.stdout || result.result || "";

  for (const line of output.trim().split("\n")) {
    if (!line) continue;
    const [perms, name] = line.split(" ");
    if (!name || name === "." || name === "..") continue;

    entries.push({
      name,
      type: perms.startsWith("d") ? "dir" : "file",
    });
  }

  return entries;
}

/**
 * Create directory in the sandbox
 */
export async function mkdirInSandbox(
  path: string,
  context: SandboxContext
): Promise<void> {
  const result = await executeInSandbox(
    {
      command: `mkdir -p "${path}"`,
      timeout: 10,
    },
    context
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to create directory ${path}: ${result.stderr}`);
  }
}

/**
 * Clone a git repository in the sandbox
 */
export interface CloneOptions {
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** Branch to clone */
  branch: string;
  /** GitHub access token for authentication */
  accessToken?: string;
  /** Target directory path (relative to workspace or absolute) */
  targetPath?: string;
  /** Whether to do a shallow clone (default: true) */
  shallow?: boolean;
}

export async function cloneRepositoryInSandbox(
  options: CloneOptions,
  context: SandboxContext
): Promise<{ path: string; success: boolean; error?: string }> {
  const {
    owner,
    repo,
    branch,
    accessToken,
    targetPath,
    shallow = true,
  } = options;

  // Determine the target path in the sandbox
  const repoDir = targetPath || repo;
  const fullPath = repoDir.startsWith("/")
    ? repoDir
    : `${context.repoPath}/${repoDir}`;

  // Build the git clone command
  const depthFlag = shallow ? "--depth 1" : "";

  // Build clone command with or without authentication
  // Use URL-embedded token - this works reliably with kubectl exec
  let cloneCommand: string;
  if (accessToken) {
    const cloneUrl = `https://x-access-token:${accessToken}@github.com/${owner}/${repo}.git`;
    cloneCommand = `GIT_TERMINAL_PROMPT=0 git clone --branch ${branch} --single-branch ${depthFlag} ${cloneUrl} ${fullPath}`;
  } else {
    cloneCommand = `git clone --branch ${branch} --single-branch ${depthFlag} https://github.com/${owner}/${repo}.git ${fullPath}`;
  }

  // Debug: log token characteristics and sanitized clone command
  if (accessToken) {
    console.log(`[Clone] Token length: ${accessToken.length}, prefix: ${accessToken.substring(0, 10)}...`);
  }
  const sanitizedCmd = cloneCommand
    .replace(/x-access-token:[^@]+@/g, "x-access-token:***@")
    .replace(/http\.extraHeader=[^\s']+/g, "http.extraHeader=***");
  console.log(`[Clone] Executing in sandbox (${context.mode}):`, sanitizedCmd);
  console.log(`[Clone] Command length: ${cloneCommand.length}`);
  console.log(`[Clone] Sandbox info:`, context.sandbox ? `pod=${context.sandbox.podName}, ns=${context.sandbox.namespace}` : "N/A");

  try {
    const result = await executeInSandbox(
      {
        command: cloneCommand,
        timeout: 120, // 2 minutes for clone
      },
      context
    );

    // Debug: log result
    console.log(`[Clone] Exit code: ${result.exitCode}`);
    if (result.exitCode !== 0) {
      console.log(`[Clone] stderr:`, result.stderr?.replace(/x-access-token:[^@]+@/g, "x-access-token:***@"));
    }

    if (result.exitCode !== 0) {
      // Sanitize error message to remove token
      const sanitizedError = result.stderr.replace(
        /x-access-token:[^@]+@/g,
        "x-access-token:***@"
      );
      return {
        path: fullPath,
        success: false,
        error: `Clone failed: ${sanitizedError}`,
      };
    }

    return {
      path: fullPath,
      success: true,
    };
  } catch (error: unknown) {
    // Properly serialize the error object
    let errorMessage: string;
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === "object" && error !== null) {
      const errorObj = error as Record<string, unknown>;
      errorMessage = errorObj.message as string
        || errorObj.body as string
        || JSON.stringify(error);
    } else {
      errorMessage = String(error);
    }
    // Sanitize error message to remove token
    const sanitizedError = errorMessage.replace(
      /x-access-token:[^@]+@/g,
      "x-access-token:***@"
    );
    return {
      path: fullPath,
      success: false,
      error: sanitizedError,
    };
  }
}

/**
 * Check if a repository is already cloned in the sandbox
 */
export async function isRepoClonedInSandbox(
  repoPath: string,
  context: SandboxContext
): Promise<boolean> {
  const result = await executeInSandbox(
    {
      command: `test -d "${repoPath}/.git" && echo "cloned" || echo "not_cloned"`,
      timeout: 10,
    },
    context
  );

  // Handle cases where stdout might be undefined or use result field as fallback
  const output = result.stdout || result.result || "";
  return output.trim() === "cloned";
}
