/**
 * MCP Module
 * Exports MCP client and tool adapter functionality
 */

// Client exports
export {
  SandboxMCPClient,
  createMCPClient,
  discoverSandboxTools,
  executeMCPTool,
  listSandboxResources,
  readSandboxResource,
} from "./sandbox-mcp-client";

export type {
  MCPTool,
  MCPResource,
  MCPToolResult,
  MCPResourceContent,
  MCPClientOptions,
} from "./sandbox-mcp-client";

// Tool adapter exports
export {
  mcpToolToAISDK,
  mcpToolsToAISDK,
  MCPToolRegistry,
  defaultMCPToolRegistry,
  createSandboxTools,
  SANDBOX_TOOL_SETS,
} from "./tool-adapter";

export type { AISDKTool, ToolAdapterOptions } from "./tool-adapter";
