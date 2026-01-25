/**
 * Unit tests for Sandbox Executor
 * Tests execution routing: Dapr → HTTP → K8s exec fallback chain
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SandboxContext, SandboxInfo } from "./types";
import type { ExecuteResponse } from "@/lib/agent/shell-executor";

// Mock modules before importing the module under test
vi.mock("./dapr-client", () => ({
  execInSandboxViaDapr: vi.fn(),
  isDaprAvailable: vi.fn(),
}));

vi.mock("./k8s-client", () => ({
  execInSandbox: vi.fn(),
  execInSandboxViaHttp: vi.fn(),
}));

vi.mock("@/lib/agent/shell-executor", () => ({
  executeCommand: vi.fn(),
}));

// Import after mocking
import { executeInSandbox } from "./sandbox-executor";
import { execInSandboxViaDapr, isDaprAvailable } from "./dapr-client";
import { execInSandbox, execInSandboxViaHttp } from "./k8s-client";
import { executeCommand } from "@/lib/agent/shell-executor";

// Type the mocks
const mockExecViaDapr = execInSandboxViaDapr as ReturnType<typeof vi.fn>;
const mockIsDaprAvailable = isDaprAvailable as ReturnType<typeof vi.fn>;
const mockExecInSandbox = execInSandbox as ReturnType<typeof vi.fn>;
const mockExecViaHttp = execInSandboxViaHttp as ReturnType<typeof vi.fn>;
const mockExecuteLocal = executeCommand as ReturnType<typeof vi.fn>;

describe("sandbox-executor", () => {
  // Store original env
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env
    process.env = { ...originalEnv };
    // Suppress console output
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  // Helper to create sandbox info
  function createSandboxInfo(overrides: Partial<SandboxInfo> = {}): SandboxInfo {
    return {
      claimName: "agent-test1234",
      namespace: "agent-sandbox",
      podName: "agent-test1234-sandbox-xyz",
      podIP: "10.0.0.100",
      phase: "Ready",
      workdir: "/workspace",
      provisionedAt: new Date(),
      daprAppId: "sandbox-agent-test1234-sandbox-xyz",
      daprEnabled: true,
      ...overrides,
    };
  }

  // Helper to create sandbox context
  function createK8sContext(
    sandboxOverrides: Partial<SandboxInfo> = {}
  ): SandboxContext {
    return {
      mode: "k8s",
      sandbox: createSandboxInfo(sandboxOverrides),
      repoPath: "/workspace",
    };
  }

  function createLocalContext(): SandboxContext {
    return {
      mode: "local",
      repoPath: "/home/user/project",
    };
  }

  describe("executeInSandbox - local mode", () => {
    it("uses local executor when mode is local", async () => {
      const localResponse: ExecuteResponse = {
        exitCode: 0,
        result: "local output",
        stdout: "local output",
        stderr: "",
      };
      mockExecuteLocal.mockResolvedValueOnce(localResponse);

      const result = await executeInSandbox(
        { command: "ls -la" },
        createLocalContext()
      );

      expect(result).toEqual(localResponse);
      expect(mockExecuteLocal).toHaveBeenCalledWith({ command: "ls -la" });
      expect(mockExecViaDapr).not.toHaveBeenCalled();
      expect(mockExecViaHttp).not.toHaveBeenCalled();
      expect(mockExecInSandbox).not.toHaveBeenCalled();
    });

    it("uses local executor when sandbox is undefined", async () => {
      const localResponse: ExecuteResponse = {
        exitCode: 0,
        result: "output",
        stdout: "output",
        stderr: "",
      };
      mockExecuteLocal.mockResolvedValueOnce(localResponse);

      const context: SandboxContext = {
        mode: "k8s",
        sandbox: undefined,
        repoPath: "/workspace",
      };

      const result = await executeInSandbox({ command: "pwd" }, context);

      expect(result).toEqual(localResponse);
      expect(mockExecuteLocal).toHaveBeenCalled();
    });
  });

  describe("executeInSandbox - Dapr routing", () => {
    it("uses Dapr when enabled and available", async () => {
      process.env.USE_DAPR_SERVICE_INVOCATION = "true";
      mockIsDaprAvailable.mockResolvedValueOnce(true);
      mockExecViaDapr.mockResolvedValueOnce({
        success: true,
        data: {
          exitCode: 0,
          stdout: "dapr output",
          stderr: "",
        },
      });

      const result = await executeInSandbox(
        { command: "echo hello", timeout: 60 },
        createK8sContext()
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("dapr output");
      expect(mockIsDaprAvailable).toHaveBeenCalled();
      expect(mockExecViaDapr).toHaveBeenCalledWith(
        "sandbox-agent-test1234-sandbox-xyz",
        "echo hello",
        "/workspace",
        60000 // timeout in ms
      );
      // Should NOT fall through to HTTP or K8s exec
      expect(mockExecViaHttp).not.toHaveBeenCalled();
      expect(mockExecInSandbox).not.toHaveBeenCalled();
    });

    it("falls back to HTTP when Dapr unavailable", async () => {
      process.env.USE_DAPR_SERVICE_INVOCATION = "true";
      mockIsDaprAvailable.mockResolvedValueOnce(false);
      mockExecViaHttp.mockResolvedValueOnce({
        exitCode: 0,
        result: "http output",
        stdout: "http output",
        stderr: "",
      });

      const result = await executeInSandbox(
        { command: "ls" },
        createK8sContext()
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("http output");
      expect(mockIsDaprAvailable).toHaveBeenCalled();
      expect(mockExecViaDapr).not.toHaveBeenCalled();
      expect(mockExecViaHttp).toHaveBeenCalled();
    });

    it("falls back to HTTP when Dapr invocation fails", async () => {
      process.env.USE_DAPR_SERVICE_INVOCATION = "true";
      mockIsDaprAvailable.mockResolvedValueOnce(true);
      mockExecViaDapr.mockResolvedValueOnce({
        success: false,
        error: "Service unavailable",
      });
      mockExecViaHttp.mockResolvedValueOnce({
        exitCode: 0,
        result: "http fallback",
        stdout: "http fallback",
        stderr: "",
      });

      const result = await executeInSandbox(
        { command: "pwd" },
        createK8sContext()
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("http fallback");
      expect(mockExecViaDapr).toHaveBeenCalled();
      expect(mockExecViaHttp).toHaveBeenCalled();
    });

    it("falls back to HTTP when Dapr throws exception", async () => {
      process.env.USE_DAPR_SERVICE_INVOCATION = "true";
      mockIsDaprAvailable.mockResolvedValueOnce(true);
      mockExecViaDapr.mockRejectedValueOnce(new Error("Connection refused"));
      mockExecViaHttp.mockResolvedValueOnce({
        exitCode: 0,
        result: "http fallback",
        stdout: "http fallback",
        stderr: "",
      });

      const result = await executeInSandbox(
        { command: "whoami" },
        createK8sContext()
      );

      expect(result.exitCode).toBe(0);
      expect(mockExecViaHttp).toHaveBeenCalled();
    });

    it("skips Dapr when USE_DAPR_SERVICE_INVOCATION=false", async () => {
      process.env.USE_DAPR_SERVICE_INVOCATION = "false";
      mockExecViaHttp.mockResolvedValueOnce({
        exitCode: 0,
        result: "http output",
        stdout: "http output",
        stderr: "",
      });

      const result = await executeInSandbox(
        { command: "ls" },
        createK8sContext()
      );

      expect(result.exitCode).toBe(0);
      expect(mockIsDaprAvailable).not.toHaveBeenCalled();
      expect(mockExecViaDapr).not.toHaveBeenCalled();
      expect(mockExecViaHttp).toHaveBeenCalled();
    });

    it("skips Dapr when daprAppId is missing", async () => {
      process.env.USE_DAPR_SERVICE_INVOCATION = "true";
      mockExecViaHttp.mockResolvedValueOnce({
        exitCode: 0,
        result: "http output",
        stdout: "http output",
        stderr: "",
      });

      const result = await executeInSandbox(
        { command: "ls" },
        createK8sContext({ daprAppId: undefined })
      );

      expect(result.exitCode).toBe(0);
      expect(mockIsDaprAvailable).not.toHaveBeenCalled();
      expect(mockExecViaDapr).not.toHaveBeenCalled();
      expect(mockExecViaHttp).toHaveBeenCalled();
    });

    it("skips Dapr when daprEnabled is false", async () => {
      process.env.USE_DAPR_SERVICE_INVOCATION = "true";
      mockExecViaHttp.mockResolvedValueOnce({
        exitCode: 0,
        result: "http output",
        stdout: "http output",
        stderr: "",
      });

      const result = await executeInSandbox(
        { command: "ls" },
        createK8sContext({ daprEnabled: false })
      );

      expect(result.exitCode).toBe(0);
      expect(mockIsDaprAvailable).not.toHaveBeenCalled();
      expect(mockExecViaDapr).not.toHaveBeenCalled();
      expect(mockExecViaHttp).toHaveBeenCalled();
    });
  });

  describe("executeInSandbox - HTTP and K8s exec fallback", () => {
    it("uses HTTP when available and Dapr disabled", async () => {
      process.env.USE_DAPR_SERVICE_INVOCATION = "false";
      mockExecViaHttp.mockResolvedValueOnce({
        exitCode: 0,
        result: "http result",
        stdout: "http result",
        stderr: "",
      });

      const result = await executeInSandbox(
        { command: "cat file.txt" },
        createK8sContext()
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("http result");
      expect(mockExecViaHttp).toHaveBeenCalledWith(
        expect.objectContaining({
          podIP: "10.0.0.100",
          namespace: "agent-sandbox",
          podName: "agent-test1234-sandbox-xyz",
          command: "cat file.txt",
          workdir: "/workspace",
        })
      );
    });

    it("falls back to K8s exec when HTTP fails", async () => {
      process.env.USE_DAPR_SERVICE_INVOCATION = "false";
      mockExecViaHttp.mockRejectedValueOnce(new Error("HTTP connection failed"));
      mockExecInSandbox.mockResolvedValueOnce({
        exitCode: 0,
        result: "k8s exec result",
        stdout: "k8s exec result",
        stderr: "",
      });

      const result = await executeInSandbox(
        { command: "ls" },
        createK8sContext()
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("k8s exec result");
      expect(mockExecViaHttp).toHaveBeenCalled();
      expect(mockExecInSandbox).toHaveBeenCalled();
    });

    it("uses K8s exec when no podIP available", async () => {
      process.env.USE_DAPR_SERVICE_INVOCATION = "false";
      mockExecInSandbox.mockResolvedValueOnce({
        exitCode: 0,
        result: "k8s result",
        stdout: "k8s result",
        stderr: "",
      });

      const result = await executeInSandbox(
        { command: "pwd" },
        createK8sContext({ podIP: undefined })
      );

      expect(result.exitCode).toBe(0);
      expect(mockExecViaHttp).not.toHaveBeenCalled();
      expect(mockExecInSandbox).toHaveBeenCalled();
    });

    it("returns error response when all methods fail", async () => {
      process.env.USE_DAPR_SERVICE_INVOCATION = "false";
      mockExecViaHttp.mockRejectedValueOnce(new Error("HTTP failed"));
      mockExecInSandbox.mockRejectedValueOnce(new Error("K8s exec failed"));

      const result = await executeInSandbox(
        { command: "failing-command" },
        createK8sContext()
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("K8s exec failed");
    });
  });

  describe("executeInSandbox - environment variables", () => {
    it("passes environment variables to sandbox", async () => {
      process.env.USE_DAPR_SERVICE_INVOCATION = "false";
      mockExecViaHttp.mockResolvedValueOnce({
        exitCode: 0,
        result: "",
        stdout: "",
        stderr: "",
      });

      await executeInSandbox(
        {
          command: "echo $MY_VAR",
          env: { MY_VAR: "test_value" },
        },
        createK8sContext()
      );

      expect(mockExecViaHttp).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.stringContaining('export MY_VAR="test_value"'),
        })
      );
    });

    it("escapes double quotes in env values", async () => {
      process.env.USE_DAPR_SERVICE_INVOCATION = "false";
      mockExecViaHttp.mockResolvedValueOnce({
        exitCode: 0,
        result: "",
        stdout: "",
        stderr: "",
      });

      await executeInSandbox(
        {
          command: "echo $MSG",
          env: { MSG: 'Hello "World"' },
        },
        createK8sContext()
      );

      expect(mockExecViaHttp).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.stringContaining('export MSG="Hello \\"World\\""'),
        })
      );
    });
  });

  describe("executeInSandbox - result mapping", () => {
    it("maps Dapr response correctly for successful command", async () => {
      process.env.USE_DAPR_SERVICE_INVOCATION = "true";
      mockIsDaprAvailable.mockResolvedValueOnce(true);
      mockExecViaDapr.mockResolvedValueOnce({
        success: true,
        data: {
          exitCode: 0,
          stdout: "success output",
          stderr: "",
        },
      });

      const result = await executeInSandbox(
        { command: "echo success" },
        createK8sContext()
      );

      expect(result).toEqual({
        exitCode: 0,
        result: "success output",
        stdout: "success output",
        stderr: "",
      });
    });

    it("maps Dapr response correctly for failed command", async () => {
      process.env.USE_DAPR_SERVICE_INVOCATION = "true";
      mockIsDaprAvailable.mockResolvedValueOnce(true);
      mockExecViaDapr.mockResolvedValueOnce({
        success: true,
        data: {
          exitCode: 1,
          stdout: "",
          stderr: "command not found",
        },
      });

      const result = await executeInSandbox(
        { command: "invalid-cmd" },
        createK8sContext()
      );

      expect(result).toEqual({
        exitCode: 1,
        result: "command not found",
        stdout: "",
        stderr: "command not found",
      });
    });
  });
});
