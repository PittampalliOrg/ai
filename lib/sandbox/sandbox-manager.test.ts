/**
 * Unit tests for Sandbox Manager
 * Tests sandbox provisioning, Dapr enrichment, and lifecycle management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SandboxClaim, Sandbox, SandboxClaimStatus } from "./types";

// Mock the k8s-client module
vi.mock("./k8s-client", () => ({
  createSandboxClaim: vi.fn(),
  deleteSandboxClaim: vi.fn(),
  getSandboxClaim: vi.fn(),
  getSandboxStatus: vi.fn(),
  waitForSandboxReady: vi.fn(),
  checkK8sConnection: vi.fn(),
  getSandbox: vi.fn(),
}));

// Import after mocking
import {
  provisionSandbox,
  getSandbox,
  getSandboxPhase,
  releaseSandbox,
  createSandboxContext,
  isSandboxModeAvailable,
  clearSandboxCache,
} from "./sandbox-manager";

import {
  createSandboxClaim,
  deleteSandboxClaim,
  getSandboxClaim,
  getSandboxStatus,
  waitForSandboxReady,
  checkK8sConnection,
  getSandbox as getSandboxResource,
} from "./k8s-client";

// Type the mocks
const mockCreateClaim = createSandboxClaim as ReturnType<typeof vi.fn>;
const mockDeleteClaim = deleteSandboxClaim as ReturnType<typeof vi.fn>;
const mockGetClaim = getSandboxClaim as ReturnType<typeof vi.fn>;
const mockGetStatus = getSandboxStatus as ReturnType<typeof vi.fn>;
const mockWaitReady = waitForSandboxReady as ReturnType<typeof vi.fn>;
const mockCheckK8s = checkK8sConnection as ReturnType<typeof vi.fn>;
const mockGetSandboxResource = getSandboxResource as ReturnType<typeof vi.fn>;

describe("sandbox-manager", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    clearSandboxCache();
    // Set up K8s mode
    process.env = {
      ...originalEnv,
      SANDBOX_MODE: "k8s",
      SANDBOX_NAMESPACE: "agent-sandbox",
      SANDBOX_TEMPLATE: "open-swe-dev",
    };
    // Suppress console output
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  // Helper to create a mock SandboxClaim
  function createMockClaim(
    name: string,
    phase: "Pending" | "Bound" | "Ready" | "Failed" = "Ready",
    podIP?: string
  ): SandboxClaim {
    return {
      apiVersion: "extensions.agents.x-k8s.io/v1alpha1",
      kind: "SandboxClaim",
      metadata: {
        name,
        namespace: "agent-sandbox",
      },
      spec: {
        sandboxTemplateRef: { name: "open-swe-dev" },
      },
      status: {
        phase,
        sandbox: {
          Name: name,
          podName: `${name}-pod`,
          podIP: podIP || "10.0.0.100",
        },
        conditions: [
          {
            type: "Ready",
            status: phase === "Ready" ? "True" : "False",
          },
        ],
      },
    };
  }

  // Helper to create a mock Sandbox resource
  function createMockSandboxResource(name: string): Sandbox {
    return {
      apiVersion: "agents.x-k8s.io/v1alpha1",
      kind: "Sandbox",
      metadata: {
        name,
        namespace: "agent-sandbox",
        annotations: {
          "agents.x-k8s.io/pod-name": `${name}-pod`,
        },
      },
      spec: {},
      status: {
        conditions: [{ type: "Ready", status: "True" }],
      },
    };
  }

  describe("provisionSandbox", () => {
    it("throws error when sandbox mode is not k8s", async () => {
      process.env.SANDBOX_MODE = "local";

      await expect(
        provisionSandbox({ sessionId: "test-session-123" })
      ).rejects.toThrow("Sandbox mode is not enabled");
    });

    it("sets daprAppId on provision when enabled", async () => {
      process.env.USE_DAPR_SERVICE_INVOCATION = "true";
      mockGetClaim.mockResolvedValueOnce(null);
      mockCreateClaim.mockResolvedValueOnce(undefined);
      mockWaitReady.mockResolvedValueOnce({
        claimName: "agent-test1234",
        namespace: "agent-sandbox",
        podName: "agent-test1234-pod",
        podIP: "10.0.0.100",
        phase: "Ready",
        workdir: "/workspace",
        provisionedAt: new Date(),
      });

      const result = await provisionSandbox({ sessionId: "test1234-abcd-efgh" });

      expect(result.daprAppId).toBe("agent-test1234-pod.agent-sandbox");
      expect(result.daprEnabled).toBe(true);
    });

    it("sets daprEnabled=true when env var set", async () => {
      process.env.USE_DAPR_SERVICE_INVOCATION = "true";
      mockGetClaim.mockResolvedValueOnce(null);
      mockCreateClaim.mockResolvedValueOnce(undefined);
      mockWaitReady.mockResolvedValueOnce({
        claimName: "agent-abc12345",
        namespace: "agent-sandbox",
        podName: "sandbox-abc",
        podIP: "10.0.0.50",
        phase: "Ready",
        workdir: "/workspace",
        provisionedAt: new Date(),
      });

      const result = await provisionSandbox({ sessionId: "abc12345" });

      expect(result.daprEnabled).toBe(true);
    });

    it("omits Dapr fields when disabled", async () => {
      process.env.USE_DAPR_SERVICE_INVOCATION = "false";
      mockGetClaim.mockResolvedValueOnce(null);
      mockCreateClaim.mockResolvedValueOnce(undefined);
      mockWaitReady.mockResolvedValueOnce({
        claimName: "agent-xyz98765",
        namespace: "agent-sandbox",
        podName: "sandbox-xyz",
        phase: "Ready",
        workdir: "/workspace",
        provisionedAt: new Date(),
      });

      const result = await provisionSandbox({ sessionId: "xyz98765" });

      expect(result.daprAppId).toBeUndefined();
      expect(result.daprEnabled).toBe(false);
    });

    it("returns existing sandbox if already provisioned", async () => {
      process.env.USE_DAPR_SERVICE_INVOCATION = "false";
      mockGetClaim.mockResolvedValueOnce(null);
      mockCreateClaim.mockResolvedValueOnce(undefined);
      mockWaitReady.mockResolvedValueOnce({
        claimName: "agent-repeat12",
        namespace: "agent-sandbox",
        podName: "sandbox-repeat",
        phase: "Ready",
        workdir: "/workspace",
        provisionedAt: new Date(),
      });

      // First call provisions
      const first = await provisionSandbox({ sessionId: "repeat12" });

      // Second call should return cached
      const second = await provisionSandbox({ sessionId: "repeat12" });

      expect(first.podName).toBe(second.podName);
      expect(mockCreateClaim).toHaveBeenCalledTimes(1);
    });

    it("resumes existing ready claim", async () => {
      process.env.USE_DAPR_SERVICE_INVOCATION = "true";
      const existingClaim = createMockClaim("agent-resume12");
      mockGetClaim.mockResolvedValueOnce(existingClaim);
      mockGetSandboxResource.mockResolvedValueOnce(
        createMockSandboxResource("agent-resume12")
      );

      const result = await provisionSandbox({ sessionId: "resume12" });

      expect(result.phase).toBe("Ready");
      expect(result.daprEnabled).toBe(true);
      expect(result.daprAppId).toBe("agent-resume12-pod.agent-sandbox");
      expect(mockCreateClaim).not.toHaveBeenCalled();
    });
  });

  describe("getSandbox", () => {
    it("returns cached sandbox", async () => {
      process.env.USE_DAPR_SERVICE_INVOCATION = "true";
      // Provision first
      mockGetClaim.mockResolvedValueOnce(null);
      mockCreateClaim.mockResolvedValueOnce(undefined);
      mockWaitReady.mockResolvedValueOnce({
        claimName: "agent-cached12",
        namespace: "agent-sandbox",
        podName: "sandbox-cached",
        phase: "Ready",
        workdir: "/workspace",
        provisionedAt: new Date(),
      });

      await provisionSandbox({ sessionId: "cached12" });

      // Now get should return cached
      const result = await getSandbox("cached12");

      expect(result).not.toBeNull();
      expect(result!.podName).toBe("sandbox-cached");
      expect(result!.daprEnabled).toBe(true);
    });

    it("returns null when mode is local", async () => {
      process.env.SANDBOX_MODE = "local";

      const result = await getSandbox("any-session");

      expect(result).toBeNull();
    });

    it("fetches claim if not cached", async () => {
      process.env.USE_DAPR_SERVICE_INVOCATION = "true";
      const claim = createMockClaim("agent-fetch123");
      mockGetClaim.mockResolvedValueOnce(claim);
      mockGetSandboxResource.mockResolvedValueOnce(
        createMockSandboxResource("agent-fetch123")
      );

      const result = await getSandbox("fetch123");

      expect(result).not.toBeNull();
      expect(result!.daprEnabled).toBe(true);
      expect(result!.daprAppId).toBe("agent-fetch123-pod.agent-sandbox");
    });

    it("returns null if claim not found", async () => {
      mockGetClaim.mockResolvedValueOnce(null);

      const result = await getSandbox("nonexistent");

      expect(result).toBeNull();
    });

    it("returns null if claim not ready", async () => {
      const pendingClaim = createMockClaim("agent-pending1", "Pending");
      mockGetClaim.mockResolvedValueOnce(pendingClaim);

      const result = await getSandbox("pending1");

      expect(result).toBeNull();
    });
  });

  describe("getSandboxPhase", () => {
    it("returns phase from status", async () => {
      mockGetStatus.mockResolvedValueOnce({ phase: "Ready" });

      const result = await getSandboxPhase("test-session");

      expect(result).toBe("Ready");
    });

    it("returns null when mode is local", async () => {
      process.env.SANDBOX_MODE = "local";

      const result = await getSandboxPhase("any-session");

      expect(result).toBeNull();
    });

    it("returns null when status not found", async () => {
      mockGetStatus.mockResolvedValueOnce(null);

      const result = await getSandboxPhase("missing");

      expect(result).toBeNull();
    });
  });

  describe("releaseSandbox", () => {
    it("deletes claim and clears cache", async () => {
      process.env.USE_DAPR_SERVICE_INVOCATION = "false";
      // Provision first
      mockGetClaim.mockResolvedValueOnce(null);
      mockCreateClaim.mockResolvedValueOnce(undefined);
      mockWaitReady.mockResolvedValueOnce({
        claimName: "agent-release1",
        namespace: "agent-sandbox",
        podName: "sandbox-release",
        phase: "Ready",
        workdir: "/workspace",
        provisionedAt: new Date(),
      });
      mockDeleteClaim.mockResolvedValueOnce(undefined);

      await provisionSandbox({ sessionId: "release1" });
      await releaseSandbox({ sessionId: "release1" });

      expect(mockDeleteClaim).toHaveBeenCalledWith(
        "agent-release1",
        "agent-sandbox"
      );
    });

    it("does nothing when mode is local", async () => {
      process.env.SANDBOX_MODE = "local";

      await releaseSandbox({ sessionId: "any" });

      expect(mockDeleteClaim).not.toHaveBeenCalled();
    });
  });

  describe("createSandboxContext", () => {
    it("returns local context when mode is local", async () => {
      process.env.SANDBOX_MODE = "local";

      const result = await createSandboxContext("session123", "/home/user/repo");

      expect(result.mode).toBe("local");
      expect(result.repoPath).toBe("/home/user/repo");
      expect(result.sandbox).toBeUndefined();
    });

    it("returns k8s context with sandbox when mode is k8s", async () => {
      process.env.USE_DAPR_SERVICE_INVOCATION = "true";
      mockGetClaim.mockResolvedValueOnce(null);
      mockCreateClaim.mockResolvedValueOnce(undefined);
      mockWaitReady.mockResolvedValueOnce({
        claimName: "agent-context1",
        namespace: "agent-sandbox",
        podName: "sandbox-context",
        phase: "Ready",
        workdir: "/workspace",
        provisionedAt: new Date(),
      });

      const result = await createSandboxContext(
        "context1",
        "/home/user/repo"
      );

      expect(result.mode).toBe("k8s");
      expect(result.repoPath).toBe("/workspace");
      expect(result.sandbox).toBeDefined();
      expect(result.sandbox!.daprEnabled).toBe(true);
    });

    it("provisions sandbox if not exists", async () => {
      mockGetClaim.mockResolvedValueOnce(null); // First getSandbox call
      mockGetClaim.mockResolvedValueOnce(null); // Second getSandbox call in provision
      mockCreateClaim.mockResolvedValueOnce(undefined);
      mockWaitReady.mockResolvedValueOnce({
        claimName: "agent-newctx12",
        namespace: "agent-sandbox",
        podName: "sandbox-new",
        phase: "Ready",
        workdir: "/workspace",
        provisionedAt: new Date(),
      });

      await createSandboxContext("newctx12", "/any/path");

      expect(mockCreateClaim).toHaveBeenCalled();
    });
  });

  describe("isSandboxModeAvailable", () => {
    it("returns unavailable when mode is local", async () => {
      process.env.SANDBOX_MODE = "local";

      const result = await isSandboxModeAvailable();

      expect(result.available).toBe(false);
      expect(result.reason).toContain("not enabled");
    });

    it("returns unavailable when K8s connection fails", async () => {
      mockCheckK8s.mockResolvedValueOnce(false);

      const result = await isSandboxModeAvailable();

      expect(result.available).toBe(false);
      expect(result.reason).toContain("Cannot connect");
    });

    it("returns available when everything works", async () => {
      mockCheckK8s.mockResolvedValueOnce(true);

      const result = await isSandboxModeAvailable();

      expect(result.available).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });

  describe("Dapr app ID format", () => {
    it("uses sandbox-{podName} format for daprAppId", async () => {
      process.env.USE_DAPR_SERVICE_INVOCATION = "true";
      mockGetClaim.mockResolvedValueOnce(null);
      mockCreateClaim.mockResolvedValueOnce(undefined);
      mockWaitReady.mockResolvedValueOnce({
        claimName: "agent-format12",
        namespace: "agent-sandbox",
        podName: "my-special-pod-name",
        phase: "Ready",
        workdir: "/workspace",
        provisionedAt: new Date(),
      });

      const result = await provisionSandbox({ sessionId: "format12" });

      expect(result.daprAppId).toBe("my-special-pod-name.agent-sandbox");
    });
  });
});
