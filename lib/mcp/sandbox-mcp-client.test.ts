/**
 * Unit tests for Sandbox MCP Client
 * Tests MCP protocol communication with sandbox pods
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SandboxMCPClient,
  createMCPClient,
  discoverSandboxTools,
  executeMCPTool,
  listSandboxResources,
  readSandboxResource,
  type MCPTool,
  type MCPResource,
} from "./sandbox-mcp-client";
import type { SandboxInfo } from "../sandbox/types";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock sandbox info
const mockSandbox: SandboxInfo = {
  claimName: "agent-abc12345",
  namespace: "agent-sandbox",
  podName: "sandbox-pod-1",
  podIP: "10.0.0.1",
  phase: "Ready",
  workdir: "/workspace",
  provisionedAt: new Date(),
};

describe("SandboxMCPClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("creates client with valid sandbox", () => {
      const client = new SandboxMCPClient({ sandbox: mockSandbox });
      expect(client).toBeDefined();
    });

    it("throws error when sandbox has no podIP", () => {
      const sandboxNoIP = { ...mockSandbox, podIP: undefined };
      expect(() => new SandboxMCPClient({ sandbox: sandboxNoIP })).toThrow(
        "Sandbox podIP is required"
      );
    });

    it("uses custom port when provided", () => {
      const client = new SandboxMCPClient({ sandbox: mockSandbox, port: 9000 });
      expect(client).toBeDefined();
    });
  });

  describe("initialize", () => {
    it("sends correct initialize request", async () => {
      const mockResponse = {
        jsonrpc: "2.0",
        id: 1,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: "sandbox-mcp", version: "1.0.0" },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(mockResponse),
      });

      const client = new SandboxMCPClient({ sandbox: mockSandbox });
      const result = await client.initialize();

      expect(result.serverInfo.name).toBe("sandbox-mcp");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://10.0.0.1:8091",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: expect.stringContaining('"method":"initialize"'),
        })
      );
    });

    it("throws error on MCP error response", async () => {
      const mockResponse = {
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32600, message: "Invalid request" },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce(mockResponse),
      });

      const client = new SandboxMCPClient({ sandbox: mockSandbox });
      await expect(client.initialize()).rejects.toThrow("MCP error (-32600)");
    });

    it("throws error on HTTP failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValueOnce("Internal Server Error"),
      });

      const client = new SandboxMCPClient({ sandbox: mockSandbox });
      await expect(client.initialize()).rejects.toThrow("MCP request failed (500)");
    });

    it("throws timeout error", async () => {
      mockFetch.mockRejectedValueOnce(
        Object.assign(new Error("Aborted"), { name: "AbortError" })
      );

      const client = new SandboxMCPClient({ sandbox: mockSandbox, timeout: 100 });
      await expect(client.initialize()).rejects.toThrow("MCP request timed out");
    });
  });

  describe("listTools", () => {
    it("returns list of tools", async () => {
      const mockTools: MCPTool[] = [
        {
          name: "shell_exec",
          description: "Execute shell command",
          inputSchema: {
            type: "object",
            properties: {
              command: { type: "string", description: "Command to execute" },
              workdir: { type: "string", description: "Working directory" },
            },
            required: ["command"],
          },
        },
        {
          name: "file_read",
          description: "Read file contents",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string", description: "File path" },
            },
            required: ["path"],
          },
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({
          jsonrpc: "2.0",
          id: 1,
          result: { tools: mockTools },
        }),
      });

      const client = new SandboxMCPClient({ sandbox: mockSandbox });
      const result = await client.listTools();

      expect(result.tools).toHaveLength(2);
      expect(result.tools[0].name).toBe("shell_exec");
    });
  });

  describe("callTool", () => {
    it("calls tool with arguments", async () => {
      const mockResult = {
        content: [{ type: "text", text: "file1.txt\nfile2.txt" }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({
          jsonrpc: "2.0",
          id: 1,
          result: mockResult,
        }),
      });

      const client = new SandboxMCPClient({ sandbox: mockSandbox });
      const result = await client.callTool("shell_exec", {
        command: "ls",
        workdir: "/workspace",
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toBe("file1.txt\nfile2.txt");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"method":"tools/call"'),
        })
      );
    });

    it("returns error result when tool fails", async () => {
      const mockResult = {
        content: [{ type: "text", text: "Command not found" }],
        isError: true,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({
          jsonrpc: "2.0",
          id: 1,
          result: mockResult,
        }),
      });

      const client = new SandboxMCPClient({ sandbox: mockSandbox });
      const result = await client.callTool("shell_exec", { command: "invalid" });

      expect(result.isError).toBe(true);
    });
  });

  describe("listResources", () => {
    it("returns list of resources", async () => {
      const mockResources: MCPResource[] = [
        {
          uri: "file:///workspace/src/index.ts",
          name: "index.ts",
          mimeType: "text/typescript",
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({
          jsonrpc: "2.0",
          id: 1,
          result: { resources: mockResources },
        }),
      });

      const client = new SandboxMCPClient({ sandbox: mockSandbox });
      const result = await client.listResources();

      expect(result.resources).toHaveLength(1);
      expect(result.resources[0].uri).toBe("file:///workspace/src/index.ts");
    });
  });

  describe("readResource", () => {
    it("reads resource content", async () => {
      const mockContent = {
        uri: "file:///workspace/README.md",
        mimeType: "text/markdown",
        text: "# README",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({
          jsonrpc: "2.0",
          id: 1,
          result: { contents: [mockContent] },
        }),
      });

      const client = new SandboxMCPClient({ sandbox: mockSandbox });
      const result = await client.readResource("file:///workspace/README.md");

      expect(result.contents[0].text).toBe("# README");
    });
  });
});

describe("Helper functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createMCPClient", () => {
    it("creates client from sandbox info", () => {
      const client = createMCPClient(mockSandbox);
      expect(client).toBeInstanceOf(SandboxMCPClient);
    });
  });

  describe("discoverSandboxTools", () => {
    it("returns empty array when sandbox has no podIP", async () => {
      const sandboxNoIP = { ...mockSandbox, podIP: undefined };
      const tools = await discoverSandboxTools(sandboxNoIP);
      expect(tools).toEqual([]);
    });

    it("returns empty array on error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

      const tools = await discoverSandboxTools(mockSandbox);
      expect(tools).toEqual([]);
    });

    it("returns tools on success", async () => {
      // Mock initialize
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({
          jsonrpc: "2.0",
          id: 1,
          result: {
            protocolVersion: "2024-11-05",
            serverInfo: { name: "sandbox-mcp", version: "1.0.0" },
          },
        }),
      });

      // Mock listTools
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({
          jsonrpc: "2.0",
          id: 2,
          result: {
            tools: [
              {
                name: "shell_exec",
                inputSchema: { type: "object", properties: {} },
              },
            ],
          },
        }),
      });

      const tools = await discoverSandboxTools(mockSandbox);
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe("shell_exec");
    });
  });

  describe("executeMCPTool", () => {
    it("throws when sandbox has no podIP", async () => {
      const sandboxNoIP = { ...mockSandbox, podIP: undefined };
      await expect(
        executeMCPTool(sandboxNoIP, "shell_exec", { command: "ls" })
      ).rejects.toThrow("sandbox has no podIP");
    });

    it("executes tool and returns result", async () => {
      // Mock initialize
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({
          jsonrpc: "2.0",
          id: 1,
          result: {
            protocolVersion: "2024-11-05",
            serverInfo: { name: "sandbox-mcp", version: "1.0.0" },
          },
        }),
      });

      // Mock callTool
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValueOnce({
          jsonrpc: "2.0",
          id: 2,
          result: {
            content: [{ type: "text", text: "output" }],
          },
        }),
      });

      const result = await executeMCPTool(mockSandbox, "shell_exec", {
        command: "ls",
      });
      expect(result.content[0].text).toBe("output");
    });
  });

  describe("listSandboxResources", () => {
    it("returns empty array when sandbox has no podIP", async () => {
      const sandboxNoIP = { ...mockSandbox, podIP: undefined };
      const resources = await listSandboxResources(sandboxNoIP);
      expect(resources).toEqual([]);
    });
  });

  describe("readSandboxResource", () => {
    it("throws when sandbox has no podIP", async () => {
      const sandboxNoIP = { ...mockSandbox, podIP: undefined };
      await expect(
        readSandboxResource(sandboxNoIP, "file:///test.txt")
      ).rejects.toThrow("sandbox has no podIP");
    });
  });
});
