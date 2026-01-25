/**
 * Unit tests for Dapr Client
 * Tests service invocation, health checks, metadata retrieval,
 * state store operations, and pub/sub event publishing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  invokeSandboxMethod,
  execInSandboxViaDapr,
  isDaprAvailable,
  getDaprMetadata,
  getState,
  saveState,
  deleteState,
  getBulkState,
  publishEvent,
  publishCloudEvent,
  createCloudEvent,
  getSandboxFromRegistry,
  setSandboxInRegistry,
  deleteSandboxFromRegistry,
  sandboxStateKey,
  publishTaskStarted,
  publishSandboxProvisioned,
  TOPICS,
  AGENT_EVENT_TYPES,
  SANDBOX_EVENT_TYPES,
  type DaprInvokeResponse,
  type SandboxShellResponse,
} from "./dapr-client";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("dapr-client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset console spies
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("isDaprAvailable", () => {
    it("returns true when sidecar is healthy", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await isDaprAvailable();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3500/v1.0/healthz",
        expect.objectContaining({
          method: "GET",
        })
      );
    });

    it("returns false on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const result = await isDaprAvailable();

      expect(result).toBe(false);
    });

    it("returns false on non-200 response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      });

      const result = await isDaprAvailable();

      expect(result).toBe(false);
    });

    it("returns false on timeout", async () => {
      mockFetch.mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));

      const result = await isDaprAvailable();

      expect(result).toBe(false);
    });
  });

  describe("invokeSandboxMethod", () => {
    it("returns success on valid response", async () => {
      const mockData = { foo: "bar" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(mockData),
      });

      const result = await invokeSandboxMethod<typeof mockData>(
        "sandbox-test-pod",
        "v1/health",
        {}
      );

      expect(result).toEqual({
        success: true,
        data: mockData,
      });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3500/v1.0/invoke/sandbox-test-pod/method/v1/health",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      );
    });

    it("returns error on non-OK response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: vi.fn().mockResolvedValueOnce("Service unavailable"),
      });

      const result = await invokeSandboxMethod(
        "sandbox-test-pod",
        "v1/shell/exec",
        { command: "ls" }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("500");
      expect(result.error).toContain("Service unavailable");
    });

    it("handles timeout correctly", async () => {
      const abortError = new DOMException("Aborted", "AbortError");
      mockFetch.mockRejectedValueOnce(abortError);

      const result = await invokeSandboxMethod(
        "sandbox-test-pod",
        "v1/shell/exec",
        { command: "sleep 1000" },
        100 // 100ms timeout
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("timed out");
    });

    it("handles network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await invokeSandboxMethod(
        "sandbox-test-pod",
        "v1/shell/exec",
        { command: "ls" }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
    });

    it("handles non-Error exceptions", async () => {
      mockFetch.mockRejectedValueOnce("String error");

      const result = await invokeSandboxMethod(
        "sandbox-test-pod",
        "v1/shell/exec",
        { command: "ls" }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("String error");
    });
  });

  describe("execInSandboxViaDapr", () => {
    it("maps response correctly for successful command", async () => {
      const shellResponse: SandboxShellResponse = {
        exitCode: 0,
        stdout: "file1.txt\nfile2.txt",
        stderr: "",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(shellResponse),
      });

      const result = await execInSandboxViaDapr(
        "sandbox-agent-12345",
        "ls -la",
        "/workspace"
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(shellResponse);
    });

    it("passes correct timeout in seconds to API", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({
          exitCode: 0,
          stdout: "",
          stderr: "",
        }),
      });

      await execInSandboxViaDapr(
        "sandbox-agent-12345",
        "ls",
        "/workspace",
        30000 // 30 seconds in ms
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"timeout":30'),
        })
      );
    });

    it("maps response correctly for failed command", async () => {
      const shellResponse: SandboxShellResponse = {
        exitCode: 1,
        stdout: "",
        stderr: "command not found",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(shellResponse),
      });

      const result = await execInSandboxViaDapr(
        "sandbox-agent-12345",
        "invalid-command",
        "/workspace"
      );

      expect(result.success).toBe(true);
      expect(result.data?.exitCode).toBe(1);
      expect(result.data?.stderr).toBe("command not found");
    });
  });

  describe("getDaprMetadata", () => {
    it("returns metadata when available", async () => {
      const mockMetadata = {
        id: "ai-chatbot",
        runtimeVersion: "1.12.0",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(mockMetadata),
      });

      const result = await getDaprMetadata();

      expect(result).toEqual({
        available: true,
        appId: "ai-chatbot",
        version: "1.12.0",
      });
    });

    it("returns unavailable on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const result = await getDaprMetadata();

      expect(result).toEqual({ available: false });
    });

    it("returns unavailable on non-OK response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      });

      const result = await getDaprMetadata();

      expect(result).toEqual({ available: false });
    });
  });

  // ============================================================================
  // State Store Tests
  // ============================================================================

  describe("getState", () => {
    it("returns state when found", async () => {
      const mockData = { foo: "bar", count: 42 };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(mockData),
      });

      const result = await getState<typeof mockData>("test-key");

      expect(result).toEqual({ success: true, data: mockData });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3500/v1.0/state/sandboxregistry/test-key",
        expect.objectContaining({
          method: "GET",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    it("returns undefined when key not found (404)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await getState("missing-key");

      expect(result).toEqual({ success: true, data: undefined });
    });

    it("returns undefined when key not found (204)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      const result = await getState("empty-key");

      expect(result).toEqual({ success: true, data: undefined });
    });

    it("returns error on failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValueOnce("Internal server error"),
      });

      const result = await getState("test-key");

      expect(result.success).toBe(false);
      expect(result.error).toContain("500");
    });

    it("uses custom store name when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({ data: "test" }),
      });

      await getState("test-key", { storeName: "customstore" });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3500/v1.0/state/customstore/test-key",
        expect.any(Object)
      );
    });
  });

  describe("saveState", () => {
    it("saves state successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      const result = await saveState("test-key", { foo: "bar" });

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3500/v1.0/state/sandboxregistry",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([{ key: "test-key", value: { foo: "bar" } }]),
        })
      );
    });

    it("includes TTL metadata when specified", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await saveState("test-key", { foo: "bar" }, { ttlInSeconds: 300 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify([
            {
              key: "test-key",
              value: { foo: "bar" },
              metadata: { ttlInSeconds: "300" },
            },
          ]),
        })
      );
    });

    it("returns error on failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValueOnce("Save failed"),
      });

      const result = await saveState("test-key", { foo: "bar" });

      expect(result.success).toBe(false);
      expect(result.error).toContain("500");
    });
  });

  describe("deleteState", () => {
    it("deletes state successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      const result = await deleteState("test-key");

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3500/v1.0/state/sandboxregistry/test-key",
        expect.objectContaining({
          method: "DELETE",
        })
      );
    });

    it("returns error on failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValueOnce("Delete failed"),
      });

      const result = await deleteState("test-key");

      expect(result.success).toBe(false);
      expect(result.error).toContain("500");
    });
  });

  describe("getBulkState", () => {
    it("returns multiple states", async () => {
      const mockResponse = [
        { key: "key1", data: { value: 1 }, etag: "etag1" },
        { key: "key2", data: { value: 2 }, etag: "etag2" },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(mockResponse),
      });

      const result = await getBulkState<{ value: number }>(["key1", "key2"]);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([
        { key: "key1", value: { value: 1 }, etag: "etag1" },
        { key: "key2", value: { value: 2 }, etag: "etag2" },
      ]);
    });
  });

  // ============================================================================
  // Sandbox Registry Helpers Tests
  // ============================================================================

  describe("sandboxStateKey", () => {
    it("generates correct key format", () => {
      expect(sandboxStateKey("session-123")).toBe("sandbox:session-123");
    });
  });

  describe("getSandboxFromRegistry", () => {
    it("retrieves sandbox info", async () => {
      const mockSandbox = {
        claimName: "agent-abc12345",
        namespace: "agent-sandbox",
        podName: "sandbox-pod-1",
        phase: "Ready",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(mockSandbox),
      });

      const result = await getSandboxFromRegistry("session-123");

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockSandbox);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3500/v1.0/state/sandboxregistry/sandbox:session-123",
        expect.any(Object)
      );
    });
  });

  describe("setSandboxInRegistry", () => {
    it("saves sandbox info with TTL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      const sandboxInfo = {
        claimName: "agent-abc12345",
        podName: "sandbox-pod-1",
      };

      await setSandboxInRegistry("session-123", sandboxInfo, 600);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"ttlInSeconds":"600"'),
        })
      );
    });
  });

  describe("deleteSandboxFromRegistry", () => {
    it("deletes sandbox info", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await deleteSandboxFromRegistry("session-123");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3500/v1.0/state/sandboxregistry/sandbox:session-123",
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  // ============================================================================
  // Pub/Sub Tests
  // ============================================================================

  describe("createCloudEvent", () => {
    it("creates valid CloudEvent structure", () => {
      const event = createCloudEvent("test.event", { foo: "bar" });

      expect(event.specversion).toBe("1.0");
      expect(event.type).toBe("test.event");
      expect(event.source).toBe("ai-chatbot");
      expect(event.datacontenttype).toBe("application/json");
      expect(event.data).toEqual({ foo: "bar" });
      expect(event.id).toBeDefined();
      expect(event.time).toBeDefined();
    });

    it("allows custom source", () => {
      const event = createCloudEvent("test.event", {}, "custom-source");

      expect(event.source).toBe("custom-source");
    });
  });

  describe("publishEvent", () => {
    it("publishes event to topic successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      const result = await publishEvent("test.topic", { foo: "bar" });

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3500/v1.0/publish/taskpubsub/test.topic",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ foo: "bar" }),
        })
      );
    });

    it("uses custom pubsub name when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await publishEvent("test.topic", { foo: "bar" }, { pubsubName: "custompubsub" });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3500/v1.0/publish/custompubsub/test.topic",
        expect.any(Object)
      );
    });

    it("returns error on failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValueOnce("Publish failed"),
      });

      const result = await publishEvent("test.topic", { foo: "bar" });

      expect(result.success).toBe(false);
      expect(result.error).toContain("500");
    });
  });

  describe("publishCloudEvent", () => {
    it("publishes CloudEvent with correct content type", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await publishCloudEvent("test.topic", "test.event.type", { foo: "bar" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: { "Content-Type": "application/cloudevents+json" },
          body: expect.stringContaining('"type":"test.event.type"'),
        })
      );
    });
  });

  // ============================================================================
  // Event Publisher Helper Tests
  // ============================================================================

  describe("publishTaskStarted", () => {
    it("publishes task started event", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await publishTaskStarted({
        sessionId: "session-123",
        userId: "user-456",
        repository: "owner/repo",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `http://localhost:3500/v1.0/publish/taskpubsub/${TOPICS.AGENT_TASKS}`,
        expect.objectContaining({
          body: expect.stringContaining(AGENT_EVENT_TYPES.TASK_STARTED),
        })
      );
    });
  });

  describe("publishSandboxProvisioned", () => {
    it("publishes sandbox provisioned event", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await publishSandboxProvisioned({
        sessionId: "session-123",
        podName: "sandbox-pod-1",
        podIP: "10.0.0.1",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `http://localhost:3500/v1.0/publish/taskpubsub/${TOPICS.SANDBOX_LIFECYCLE}`,
        expect.objectContaining({
          body: expect.stringContaining(SANDBOX_EVENT_TYPES.PROVISIONED),
        })
      );
    });
  });

  // ============================================================================
  // Constants Tests
  // ============================================================================

  describe("TOPICS", () => {
    it("has correct topic names", () => {
      expect(TOPICS.AGENT_TASKS).toBe("agent.tasks");
      expect(TOPICS.SANDBOX_LIFECYCLE).toBe("sandbox.lifecycle");
      expect(TOPICS.AGENT_COORDINATION).toBe("agent.coordination");
    });
  });

  describe("AGENT_EVENT_TYPES", () => {
    it("has correct event types", () => {
      expect(AGENT_EVENT_TYPES.TASK_STARTED).toBe("task.started");
      expect(AGENT_EVENT_TYPES.TASK_COMPLETED).toBe("task.completed");
      expect(AGENT_EVENT_TYPES.TASK_FAILED).toBe("task.failed");
    });
  });

  describe("SANDBOX_EVENT_TYPES", () => {
    it("has correct event types", () => {
      expect(SANDBOX_EVENT_TYPES.PROVISIONED).toBe("sandbox.provisioned");
      expect(SANDBOX_EVENT_TYPES.READY).toBe("sandbox.ready");
      expect(SANDBOX_EVENT_TYPES.RELEASED).toBe("sandbox.released");
    });
  });
});
