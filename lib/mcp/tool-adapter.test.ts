/**
 * Unit tests for MCP Tool Adapter
 * Tests conversion of MCP tools to AI SDK format
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mcpToolsToAISDK,
  MCPToolRegistry,
  SANDBOX_TOOL_SETS,
} from "./tool-adapter";
import type { MCPTool } from "./sandbox-mcp-client";
import type { SandboxInfo } from "../sandbox/types";

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

// Mock MCP tools
const mockMCPTools: MCPTool[] = [
  {
    name: "shell_exec",
    description: "Execute shell command",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Command to execute" },
        workdir: { type: "string", description: "Working directory" },
        timeout: { type: "number", description: "Timeout in seconds" },
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
  {
    name: "browser_navigate",
    description: "Navigate browser to URL",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to navigate to" },
      },
      required: ["url"],
    },
  },
];

describe("mcpToolsToAISDK", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("converts MCP tools to AI SDK format", () => {
    const tools = mcpToolsToAISDK(mockMCPTools, { sandbox: mockSandbox });

    expect(Object.keys(tools)).toHaveLength(3);
    expect(tools.shell_exec).toBeDefined();
    expect(tools.file_read).toBeDefined();
    expect(tools.browser_navigate).toBeDefined();
  });

  it("applies name prefix when provided", () => {
    const tools = mcpToolsToAISDK(mockMCPTools, {
      sandbox: mockSandbox,
      namePrefix: "sandbox_",
    });

    expect(tools.sandbox_shell_exec).toBeDefined();
    expect(tools.sandbox_file_read).toBeDefined();
    expect(tools.shell_exec).toBeUndefined();
  });

  it("filters tools with includeTools option", () => {
    const tools = mcpToolsToAISDK(mockMCPTools, {
      sandbox: mockSandbox,
      includeTools: ["shell_exec"],
    });

    expect(Object.keys(tools)).toHaveLength(1);
    expect(tools.shell_exec).toBeDefined();
    expect(tools.file_read).toBeUndefined();
  });

  it("filters tools with excludeTools option", () => {
    const tools = mcpToolsToAISDK(mockMCPTools, {
      sandbox: mockSandbox,
      excludeTools: ["browser_navigate"],
    });

    expect(Object.keys(tools)).toHaveLength(2);
    expect(tools.shell_exec).toBeDefined();
    expect(tools.file_read).toBeDefined();
    expect(tools.browser_navigate).toBeUndefined();
  });

  it("returns empty object for empty tools array", () => {
    const tools = mcpToolsToAISDK([], { sandbox: mockSandbox });
    expect(tools).toEqual({});
  });
});

describe("MCPToolRegistry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with no tools discovered", () => {
    const registry = new MCPToolRegistry();
    expect(registry.isDiscovered()).toBe(false);
  });

  it("throws error when getting tools without sandbox", async () => {
    const registry = new MCPToolRegistry();
    await expect(registry.getTools()).rejects.toThrow("Sandbox not set");
  });

  it("resets state when sandbox changes", () => {
    const registry = new MCPToolRegistry();

    registry.setSandbox(mockSandbox);

    // Simulate discovered state
    (registry as unknown as { discovered: boolean }).discovered = true;

    // Set different sandbox
    const newSandbox = { ...mockSandbox, podName: "sandbox-pod-2" };
    registry.setSandbox(newSandbox);

    expect(registry.isDiscovered()).toBe(false);
  });

  it("preserves state when same sandbox is set", () => {
    const registry = new MCPToolRegistry();

    registry.setSandbox(mockSandbox);
    (registry as unknown as { discovered: boolean }).discovered = true;

    // Set same sandbox
    registry.setSandbox(mockSandbox);

    expect(registry.isDiscovered()).toBe(true);
  });

  it("reset clears all state", () => {
    const registry = new MCPToolRegistry();

    registry.setSandbox(mockSandbox);
    (registry as unknown as { discovered: boolean }).discovered = true;

    registry.reset();

    expect(registry.isDiscovered()).toBe(false);
  });
});

describe("SANDBOX_TOOL_SETS", () => {
  it("has correct shell-only tools", () => {
    expect(SANDBOX_TOOL_SETS.SHELL_ONLY).toContain("shell_exec");
    expect(SANDBOX_TOOL_SETS.SHELL_ONLY).toHaveLength(1);
  });

  it("has correct file operation tools", () => {
    expect(SANDBOX_TOOL_SETS.FILE_OPS).toContain("file_read");
    expect(SANDBOX_TOOL_SETS.FILE_OPS).toContain("file_write");
    expect(SANDBOX_TOOL_SETS.FILE_OPS).toContain("file_list");
  });

  it("has correct browser tools", () => {
    expect(SANDBOX_TOOL_SETS.BROWSER).toContain("browser_navigate");
    expect(SANDBOX_TOOL_SETS.BROWSER).toContain("browser_screenshot");
    expect(SANDBOX_TOOL_SETS.BROWSER).toContain("browser_click");
  });

  it("ALL is undefined (no filter)", () => {
    expect(SANDBOX_TOOL_SETS.ALL).toBeUndefined();
  });
});

describe("JSON Schema to Zod conversion", () => {
  it("handles string type", () => {
    const mcpTool: MCPTool = {
      name: "test",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name" },
        },
        required: ["name"],
      },
    };

    const tools = mcpToolsToAISDK([mcpTool], { sandbox: mockSandbox });
    expect(tools.test).toBeDefined();
  });

  it("handles number type", () => {
    const mcpTool: MCPTool = {
      name: "test",
      inputSchema: {
        type: "object",
        properties: {
          count: { type: "number", description: "Count" },
        },
        required: ["count"],
      },
    };

    const tools = mcpToolsToAISDK([mcpTool], { sandbox: mockSandbox });
    expect(tools.test).toBeDefined();
  });

  it("handles boolean type", () => {
    const mcpTool: MCPTool = {
      name: "test",
      inputSchema: {
        type: "object",
        properties: {
          enabled: { type: "boolean", description: "Enabled" },
        },
      },
    };

    const tools = mcpToolsToAISDK([mcpTool], { sandbox: mockSandbox });
    expect(tools.test).toBeDefined();
  });

  it("handles array type", () => {
    const mcpTool: MCPTool = {
      name: "test",
      inputSchema: {
        type: "object",
        properties: {
          items: { type: "array", description: "Items" },
        },
      },
    };

    const tools = mcpToolsToAISDK([mcpTool], { sandbox: mockSandbox });
    expect(tools.test).toBeDefined();
  });

  it("handles enum type", () => {
    const mcpTool: MCPTool = {
      name: "test",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "inactive"], description: "Status" },
        },
      },
    };

    const tools = mcpToolsToAISDK([mcpTool], { sandbox: mockSandbox });
    expect(tools.test).toBeDefined();
  });

  it("handles optional parameters", () => {
    const mcpTool: MCPTool = {
      name: "test",
      inputSchema: {
        type: "object",
        properties: {
          required_param: { type: "string" },
          optional_param: { type: "string" },
        },
        required: ["required_param"],
      },
    };

    const tools = mcpToolsToAISDK([mcpTool], { sandbox: mockSandbox });
    expect(tools.test).toBeDefined();
  });

  it("handles empty properties", () => {
    const mcpTool: MCPTool = {
      name: "test",
      inputSchema: {
        type: "object",
      },
    };

    const tools = mcpToolsToAISDK([mcpTool], { sandbox: mockSandbox });
    expect(tools.test).toBeDefined();
  });
});
