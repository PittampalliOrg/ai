/**
 * MCP Tool Adapter
 * Converts MCP tools to AI SDK tool format
 *
 * This adapter allows MCP tools discovered from sandbox pods to be
 * seamlessly integrated with the AI SDK's tool calling system.
 */

import { z } from "zod";
import { tool, type Tool } from "ai";
import type { SandboxInfo } from "../sandbox/types";
import type { MCPTool, MCPToolResult } from "./sandbox-mcp-client";
import { executeMCPTool } from "./sandbox-mcp-client";

/**
 * AI SDK tool type
 * Using any for dynamic MCP tools since schemas are determined at runtime
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AISDKTool = any;

/**
 * Options for tool adapter
 */
export interface ToolAdapterOptions {
  /** Sandbox info for executing tools */
  sandbox: SandboxInfo;
  /** Prefix to add to tool names (e.g., "sandbox_") */
  namePrefix?: string;
  /** Tool name filter (only include matching tools) */
  includeTools?: string[];
  /** Tool name filter (exclude matching tools) */
  excludeTools?: string[];
}

/**
 * Convert a JSON Schema type to a Zod schema
 */
function jsonSchemaToZod(
  property: {
    type: string;
    description?: string;
    enum?: string[];
    default?: unknown;
    items?: { type: string };
  }
): z.ZodTypeAny {
  let schema: z.ZodTypeAny;

  switch (property.type) {
    case "string":
      if (property.enum) {
        schema = z.enum(property.enum as [string, ...string[]]);
      } else {
        schema = z.string();
      }
      break;
    case "number":
    case "integer":
      schema = z.number();
      break;
    case "boolean":
      schema = z.boolean();
      break;
    case "array":
      if (property.items?.type === "string") {
        schema = z.array(z.string());
      } else if (property.items?.type === "number") {
        schema = z.array(z.number());
      } else {
        schema = z.array(z.unknown());
      }
      break;
    case "object":
      schema = z.record(z.unknown());
      break;
    default:
      schema = z.unknown();
  }

  if (property.description) {
    schema = schema.describe(property.description);
  }

  if (property.default !== undefined) {
    schema = schema.default(property.default);
  }

  return schema;
}

/**
 * Convert an MCP tool's input schema to a Zod schema
 */
function mcpSchemaToZod(mcpTool: MCPTool): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  const properties = mcpTool.inputSchema.properties || {};
  const required = mcpTool.inputSchema.required || [];

  for (const [name, prop] of Object.entries(properties)) {
    let fieldSchema = jsonSchemaToZod(prop);

    // Make optional if not in required list
    if (!required.includes(name)) {
      fieldSchema = fieldSchema.optional();
    }

    shape[name] = fieldSchema;
  }

  return z.object(shape);
}

/**
 * Format MCP tool result for AI consumption
 */
function formatToolResult(result: MCPToolResult): string {
  if (result.isError) {
    const errorContent = result.content.find((c) => c.type === "text");
    return `Error: ${errorContent?.text || "Unknown error"}`;
  }

  const textParts: string[] = [];

  for (const content of result.content) {
    switch (content.type) {
      case "text":
        if (content.text) {
          textParts.push(content.text);
        }
        break;
      case "image":
        textParts.push(`[Image: ${content.mimeType || "image"}]`);
        break;
      case "resource":
        if (content.resource) {
          textParts.push(`[Resource: ${content.resource.uri}]`);
        }
        break;
    }
  }

  return textParts.join("\n");
}

/**
 * Convert a single MCP tool to an AI SDK tool
 *
 * Note: Uses z.record() for dynamic parameters since MCP tools have
 * runtime-defined schemas that can't be statically typed.
 */
export function mcpToolToAISDK(
  mcpTool: MCPTool,
  sandbox: SandboxInfo,
  namePrefix = ""
): AISDKTool {
  const toolName = `${namePrefix}${mcpTool.name}`;

  // Build description with parameter hints from MCP schema
  const paramHints = Object.entries(mcpTool.inputSchema.properties || {})
    .map(([name, prop]) => `${name}: ${prop.description || prop.type}`)
    .join(", ");
  const fullDescription = mcpTool.description
    ? `${mcpTool.description}${paramHints ? ` (params: ${paramHints})` : ""}`
    : `Execute ${mcpTool.name} in sandbox`;

  // Use passthrough object for dynamic MCP tool parameters
  // The actual validation happens on the MCP server side
  return tool({
    description: fullDescription,
    inputSchema: z.object({}).passthrough(),
    execute: async (args) => {
      try {
        const result = await executeMCPTool(sandbox, mcpTool.name, args as Record<string, unknown>);
        return formatToolResult(result);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return `Error executing ${mcpTool.name}: ${errorMessage}`;
      }
    },
  });
}

/**
 * Convert multiple MCP tools to AI SDK tools
 */
export function mcpToolsToAISDK(
  mcpTools: MCPTool[],
  options: ToolAdapterOptions
): Record<string, AISDKTool> {
  const { sandbox, namePrefix = "", includeTools, excludeTools } = options;
  const tools: Record<string, AISDKTool> = {};

  for (const mcpTool of mcpTools) {
    // Apply filters
    if (includeTools && !includeTools.includes(mcpTool.name)) {
      continue;
    }
    if (excludeTools && excludeTools.includes(mcpTool.name)) {
      continue;
    }

    const toolName = `${namePrefix}${mcpTool.name}`;
    tools[toolName] = mcpToolToAISDK(mcpTool, sandbox, namePrefix);
  }

  return tools;
}

/**
 * Create a tool registry that lazily discovers and caches MCP tools
 */
export class MCPToolRegistry {
  private tools: Record<string, AISDKTool> = {};
  private discovered = false;
  private sandbox: SandboxInfo | null = null;
  private options: Omit<ToolAdapterOptions, "sandbox">;

  constructor(options: Omit<ToolAdapterOptions, "sandbox"> = {}) {
    this.options = options;
  }

  /**
   * Set the sandbox for tool discovery
   */
  setSandbox(sandbox: SandboxInfo): void {
    // Reset if sandbox changed
    if (this.sandbox?.podName !== sandbox.podName) {
      this.tools = {};
      this.discovered = false;
    }
    this.sandbox = sandbox;
  }

  /**
   * Discover tools from the sandbox MCP server
   */
  async discover(): Promise<void> {
    if (!this.sandbox) {
      throw new Error("Sandbox not set. Call setSandbox first.");
    }

    const { discoverSandboxTools } = await import("./sandbox-mcp-client");
    const mcpTools = await discoverSandboxTools(this.sandbox);

    this.tools = mcpToolsToAISDK(mcpTools, {
      sandbox: this.sandbox,
      ...this.options,
    });

    this.discovered = true;
  }

  /**
   * Get all discovered tools
   */
  async getTools(): Promise<Record<string, AISDKTool>> {
    if (!this.discovered) {
      await this.discover();
    }
    return this.tools;
  }

  /**
   * Get a specific tool by name
   */
  async getTool(name: string): Promise<AISDKTool | undefined> {
    const tools = await this.getTools();
    return tools[name];
  }

  /**
   * Check if tools have been discovered
   */
  isDiscovered(): boolean {
    return this.discovered;
  }

  /**
   * Reset the registry
   */
  reset(): void {
    this.tools = {};
    this.discovered = false;
    this.sandbox = null;
  }
}

/**
 * Default MCP tool registry instance
 */
export const defaultMCPToolRegistry = new MCPToolRegistry({
  namePrefix: "sandbox_",
});

/**
 * Predefined tool sets for common use cases
 */
export const SANDBOX_TOOL_SETS = {
  /** Shell execution only */
  SHELL_ONLY: ["shell_exec"],
  /** File operations */
  FILE_OPS: ["file_read", "file_write", "file_list", "file_delete"],
  /** Browser automation */
  BROWSER: [
    "browser_navigate",
    "browser_screenshot",
    "browser_click",
    "browser_type",
    "browser_scroll",
  ],
  /** All tools */
  ALL: undefined,
} as const;

/**
 * Create AI SDK tools for a specific sandbox with preset tool set
 */
export async function createSandboxTools(
  sandbox: SandboxInfo,
  toolSet: keyof typeof SANDBOX_TOOL_SETS = "ALL"
): Promise<Record<string, AISDKTool>> {
  const { discoverSandboxTools } = await import("./sandbox-mcp-client");
  const mcpTools = await discoverSandboxTools(sandbox);

  const includeTools = SANDBOX_TOOL_SETS[toolSet];

  return mcpToolsToAISDK(mcpTools, {
    sandbox,
    namePrefix: "sandbox_",
    includeTools: includeTools as string[] | undefined,
  });
}
