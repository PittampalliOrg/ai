/**
 * Claude Code Agent
 *
 * Uses the Claude Code provider which runs Claude CLI with built-in agentic tools:
 * - Read: Read files from the filesystem
 * - Write: Write files to the filesystem
 * - Edit: Make targeted edits to files
 * - Bash: Execute shell commands
 * - Glob: Find files by pattern
 * - Grep: Search file contents
 * - Task: Spawn sub-agents for complex tasks
 *
 * No custom AI SDK tools are needed - Claude Code handles everything internally.
 * The agent runs in an agentic loop until the task is complete.
 */

import { ToolLoopAgent, type InferAgentUIMessage, stepCountIs } from "ai";
import { z } from "zod";
import { getLanguageModel } from "../providers";

// Call options for per-request customization
const claudeCodeCallOptionsSchema = z.object({
  // Working directory for file operations
  cwd: z.string().optional(),
  // User context for personalized responses
  userId: z.string().optional(),
  // Chat ID for context tracking
  chatId: z.string().optional(),
  // Model variant: opus, sonnet, or haiku
  modelVariant: z.enum(["opus", "sonnet", "haiku"]).default("opus"),
});

export type ClaudeCodeCallOptions = z.infer<typeof claudeCodeCallOptionsSchema>;

// Base instructions for the Claude Code agent
const CLAUDE_CODE_INSTRUCTIONS = `You are Claude Code, an expert AI coding assistant created by Anthropic.
You have access to powerful agentic tools for software development:

- Read files to understand code
- Write and edit files to implement changes
- Run shell commands for builds, tests, and git operations
- Search codebases with glob and grep
- Spawn sub-agents for complex multi-step tasks

Work autonomously to complete the user's request. Think step-by-step, use your tools effectively,
and verify your work before reporting completion.

Always:
- Read relevant files before making changes
- Test your changes when possible
- Commit frequently with clear messages
- Ask for clarification if requirements are ambiguous`;

/**
 * Claude Code Agent - Agentic coding assistant with built-in tools
 *
 * This agent uses the Claude Code CLI which provides:
 * - Full filesystem access (read/write/edit)
 * - Shell command execution
 * - Sub-agent spawning for complex tasks
 * - Extended thinking for complex problems
 *
 * The agent runs autonomously until the task is complete (up to 20 steps).
 */
export const claudeCodeAgent = new ToolLoopAgent<ClaudeCodeCallOptions>({
  // Default model - can be overridden via callOptions.modelVariant
  model: getLanguageModel("claude-code/opus"),

  // System instructions for the Claude Code agent
  instructions: CLAUDE_CODE_INSTRUCTIONS,

  // Claude Code has built-in tools, so we don't define any here
  tools: {},

  // Run up to 20 steps before stopping (matches Claude Code's default behavior)
  stopWhen: stepCountIs(20),

  // Prepare each call with dynamic configuration
  callOptionsSchema: claudeCodeCallOptionsSchema,
  prepareCall: ({ options, ...settings }) => {
    // Select model based on variant
    const modelId = `claude-code/${options?.modelVariant || "opus"}`;

    // Build context-aware instructions
    const contextInstructions = `${CLAUDE_CODE_INSTRUCTIONS}

Context:
- Working Directory: ${options?.cwd || process.cwd()}
- User ID: ${options?.userId || "anonymous"}
- Chat ID: ${options?.chatId || "unknown"}`;

    return {
      ...settings,
      model: getLanguageModel(modelId),
      instructions: contextInstructions,
    };
  },

  // Telemetry for monitoring
  experimental_telemetry: {
    isEnabled: true,
    functionId: "claude-code-agent",
    metadata: {
      agentType: "claude-code",
    },
  },
});

// Export the UI message type for type-safe client components
export type ClaudeCodeAgentUIMessage = InferAgentUIMessage<
  typeof claudeCodeAgent
>;
