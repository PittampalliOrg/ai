import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createClaudeCode } from "ai-sdk-provider-claude-code";
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";
import { isTestEnvironment } from "../constants";
import { getSecretValue, getConfig } from "../dapr/config-provider";

const THINKING_SUFFIX_REGEX = /-thinking$/;

/**
 * Get AI provider configuration values
 *
 * Uses Dapr config-provider which falls back to env vars if Dapr is unavailable.
 * This allows configuration to be managed through Dapr Configuration/Secrets
 * building blocks while maintaining backwards compatibility.
 */
function getProviderConfig() {
  return {
    // Gateway URLs (from Configuration store or env vars)
    openaiBaseUrl: getConfig("KGATEWAY_OPENAI_URL", "https://api.openai.com/v1"),
    anthropicBaseUrl: getConfig("KGATEWAY_ANTHROPIC_URL", "https://api.anthropic.com/v1"),
    googleBaseUrl: getConfig("KGATEWAY_GOOGLE_URL", "https://generativelanguage.googleapis.com/v1beta"),
    // API Keys (from Secrets store or env vars)
    openaiApiKey: getSecretValue("OPENAI_API_KEY"),
    anthropicApiKey: getSecretValue("ANTHROPIC_API_KEY"),
    googleApiKey: getSecretValue("GOOGLE_API_KEY") || getSecretValue("GEMINI_API_KEY"),
    // Claude Code settings
    claudeCodePath: getConfig("CLAUDE_CODE_PATH", "/usr/local/bin/claude"),
    claudeCodeCwd: getConfig("CLAUDE_CODE_CWD", process.cwd()),
  };
}

// Lazy-initialized provider instances
// These are created on first use to allow config-provider to initialize first
let _openai: ReturnType<typeof createOpenAI> | null = null;
let _anthropic: ReturnType<typeof createAnthropic> | null = null;
let _google: ReturnType<typeof createGoogleGenerativeAI> | null = null;
let _claudeCode: ReturnType<typeof createClaudeCode> | null = null;

function getOpenAI() {
  if (!_openai) {
    const config = getProviderConfig();
    _openai = createOpenAI({
      baseURL: config.openaiBaseUrl,
      apiKey: config.openaiApiKey,
    });
  }
  return _openai;
}

function getAnthropic() {
  if (!_anthropic) {
    const config = getProviderConfig();
    _anthropic = createAnthropic({
      baseURL: config.anthropicBaseUrl,
      apiKey: config.anthropicApiKey,
    });
  }
  return _anthropic;
}

function getGoogle() {
  if (!_google) {
    const config = getProviderConfig();
    _google = createGoogleGenerativeAI({
      baseURL: config.googleBaseUrl,
      apiKey: config.googleApiKey,
    });
  }
  return _google;
}

function getClaudeCode() {
  if (!_claudeCode) {
    const config = getProviderConfig();
    _claudeCode = createClaudeCode({
      defaultSettings: {
        // Path to Claude Code CLI - must be absolute path because SDK uses fs.existsSync()
        // Default: /usr/local/bin/claude (global npm install location in Alpine/Docker)
        pathToClaudeCodeExecutable: config.claudeCodePath,
        // Accept edits automatically (bypassPermissions not allowed as root)
        permissionMode: "acceptEdits",
        // Working directory for CLI operations
        cwd: config.claudeCodeCwd,
        // Enable extended thinking with budget of 10k tokens
        maxThinkingTokens: 10_000,
        // Enable verbose logging in development
        verbose: process.env.NODE_ENV === "development",
      },
    });
  }
  return _claudeCode;
}

export const myProvider = isTestEnvironment
  ? (() => {
      const {
        artifactModel,
        chatModel,
        reasoningModel,
        titleModel,
      } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "chat-model-reasoning": reasoningModel,
          "title-model": titleModel,
          "artifact-model": artifactModel,
        },
      });
    })()
  : null;

// Model ID format: "provider/model-name" (e.g., "anthropic/claude-sonnet-4.5")
function getProviderModel(modelId: string) {
  const [provider, ...modelParts] = modelId.split("/");
  const model = modelParts.join("/");

  switch (provider) {
    case "anthropic":
      return getAnthropic()(model);
    case "openai":
      return getOpenAI()(model);
    case "google":
      return getGoogle()(model);
    case "xai":
      // xAI uses OpenAI-compatible API
      return getOpenAI()(model);
    case "claude-code":
      // Claude Code uses CLI with Pro/Max subscription
      // Model shortcuts: opus, sonnet, haiku
      return getClaudeCode()(model);
    default:
      throw new Error(`Unknown provider: ${provider}. Supported: anthropic, openai, google, xai, claude-code`);
  }
}

export function getLanguageModel(modelId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  const isReasoningModel =
    modelId.includes("reasoning") || modelId.endsWith("-thinking");

  if (isReasoningModel) {
    const cleanModelId = modelId.replace(THINKING_SUFFIX_REGEX, "");

    return wrapLanguageModel({
      model: getProviderModel(cleanModelId),
      middleware: extractReasoningMiddleware({ tagName: "thinking" }),
    });
  }

  return getProviderModel(modelId);
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }
  // Use Claude Sonnet 4.5 for fast title generation
  return getAnthropic()("claude-sonnet-4-5-20250929");
}

export function getArtifactModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("artifact-model");
  }
  // Use Claude Sonnet 4.5 for artifact generation
  return getAnthropic()("claude-sonnet-4-5-20250929");
}
