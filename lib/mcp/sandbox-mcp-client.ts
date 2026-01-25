/**
 * Sandbox MCP Client
 * Communicates with the MCP Server running in AIO Sandbox pods
 *
 * The AIO Sandbox image includes an MCP server at port 8091 that provides:
 * - Tool discovery and execution (shell, browser, file operations)
 * - Resource listing and reading (workspace files, browser state)
 *
 * MCP Protocol: https://modelcontextprotocol.io/
 */

import type { SandboxInfo } from "../sandbox/types";

/**
 * MCP JSON-RPC request structure
 */
interface MCPRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * MCP JSON-RPC response structure
 */
interface MCPResponse<T = unknown> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * MCP Tool definition from the server
 */
export interface MCPTool {
  /** Tool name (e.g., "shell_exec", "file_read") */
  name: string;
  /** Human-readable description */
  description?: string;
  /** JSON Schema for tool input */
  inputSchema: {
    type: "object";
    properties?: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
      default?: unknown;
    }>;
    required?: string[];
  };
}

/**
 * MCP Resource definition
 */
export interface MCPResource {
  /** Resource URI (e.g., "file:///workspace/src/index.ts") */
  uri: string;
  /** Resource name */
  name: string;
  /** MIME type */
  mimeType?: string;
  /** Human-readable description */
  description?: string;
}

/**
 * MCP Tool call result
 */
export interface MCPToolResult {
  /** Content items returned by the tool */
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
    resource?: MCPResource;
  }>;
  /** Whether the tool execution encountered an error */
  isError?: boolean;
}

/**
 * MCP Resource content
 */
export interface MCPResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

/**
 * MCP Client options
 */
export interface MCPClientOptions {
  /** Sandbox info for the target pod */
  sandbox: SandboxInfo;
  /** MCP server port (default: 8091) */
  port?: number;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
}

/**
 * MCP Client for communicating with sandbox MCP servers
 */
export class SandboxMCPClient {
  private sandbox: SandboxInfo;
  private port: number;
  private timeout: number;
  private requestId = 0;
  private baseUrl: string;

  constructor(options: MCPClientOptions) {
    this.sandbox = options.sandbox;
    this.port = options.port || 8091;
    this.timeout = options.timeout || 30000;

    if (!this.sandbox.podIP) {
      throw new Error("Sandbox podIP is required for MCP communication");
    }

    this.baseUrl = `http://${this.sandbox.podIP}:${this.port}`;
  }

  /**
   * Send a JSON-RPC request to the MCP server
   */
  private async sendRequest<T>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    const request: MCPRequest = {
      jsonrpc: "2.0",
      id: ++this.requestId,
      method,
      params,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`MCP request failed (${response.status}): ${errorText}`);
      }

      const result = (await response.json()) as MCPResponse<T>;

      if (result.error) {
        throw new Error(`MCP error (${result.error.code}): ${result.error.message}`);
      }

      return result.result as T;
    } catch (error: unknown) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`MCP request timed out after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Initialize the MCP connection
   */
  async initialize(): Promise<{
    protocolVersion: string;
    capabilities: Record<string, unknown>;
    serverInfo: { name: string; version: string };
  }> {
    return this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
        resources: {},
      },
      clientInfo: {
        name: "ai-chatbot",
        version: "1.0.0",
      },
    });
  }

  /**
   * List available tools from the MCP server
   */
  async listTools(): Promise<{ tools: MCPTool[] }> {
    return this.sendRequest("tools/list");
  }

  /**
   * Call a tool on the MCP server
   */
  async callTool(
    name: string,
    arguments_: Record<string, unknown>
  ): Promise<MCPToolResult> {
    return this.sendRequest("tools/call", {
      name,
      arguments: arguments_,
    });
  }

  /**
   * List available resources from the MCP server
   */
  async listResources(): Promise<{ resources: MCPResource[] }> {
    return this.sendRequest("resources/list");
  }

  /**
   * Read a resource from the MCP server
   */
  async readResource(uri: string): Promise<{ contents: MCPResourceContent[] }> {
    return this.sendRequest("resources/read", { uri });
  }

  /**
   * Close the MCP connection
   */
  async close(): Promise<void> {
    // MCP over HTTP is stateless, no explicit close needed
  }
}

/**
 * Create an MCP client for a sandbox
 */
export function createMCPClient(sandbox: SandboxInfo): SandboxMCPClient {
  return new SandboxMCPClient({ sandbox });
}

/**
 * Discover tools from a sandbox MCP server
 * Returns tools with their schemas for AI SDK integration
 */
export async function discoverSandboxTools(
  sandbox: SandboxInfo
): Promise<MCPTool[]> {
  if (!sandbox.podIP) {
    console.warn("[MCP] Cannot discover tools: sandbox has no podIP");
    return [];
  }

  const client = createMCPClient(sandbox);

  try {
    // Initialize connection
    const initResult = await client.initialize();
    console.log(
      `[MCP] Connected to ${initResult.serverInfo.name} v${initResult.serverInfo.version}`
    );

    // List tools
    const { tools } = await client.listTools();
    console.log(`[MCP] Discovered ${tools.length} tools from sandbox`);

    return tools;
  } catch (error) {
    console.error("[MCP] Failed to discover tools:", error);
    return [];
  } finally {
    await client.close();
  }
}

/**
 * Execute a tool on a sandbox via MCP
 */
export async function executeMCPTool(
  sandbox: SandboxInfo,
  toolName: string,
  args: Record<string, unknown>
): Promise<MCPToolResult> {
  if (!sandbox.podIP) {
    throw new Error("Cannot execute MCP tool: sandbox has no podIP");
  }

  const client = createMCPClient(sandbox);

  try {
    // Initialize connection
    await client.initialize();

    // Call the tool
    const result = await client.callTool(toolName, args);

    return result;
  } finally {
    await client.close();
  }
}

/**
 * List resources available in a sandbox via MCP
 */
export async function listSandboxResources(
  sandbox: SandboxInfo
): Promise<MCPResource[]> {
  if (!sandbox.podIP) {
    console.warn("[MCP] Cannot list resources: sandbox has no podIP");
    return [];
  }

  const client = createMCPClient(sandbox);

  try {
    await client.initialize();
    const { resources } = await client.listResources();
    return resources;
  } catch (error) {
    console.error("[MCP] Failed to list resources:", error);
    return [];
  } finally {
    await client.close();
  }
}

/**
 * Read a resource from a sandbox via MCP
 */
export async function readSandboxResource(
  sandbox: SandboxInfo,
  uri: string
): Promise<MCPResourceContent | null> {
  if (!sandbox.podIP) {
    throw new Error("Cannot read MCP resource: sandbox has no podIP");
  }

  const client = createMCPClient(sandbox);

  try {
    await client.initialize();
    const { contents } = await client.readResource(uri);
    return contents[0] || null;
  } finally {
    await client.close();
  }
}
