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

const THINKING_SUFFIX_REGEX = /-thinking$/;

// Initialize providers with optional kgateway proxy URLs
// When deployed to K8s, these can point to kgateway for centralized routing
const openai = createOpenAI({
  baseURL: process.env.KGATEWAY_OPENAI_URL || "https://api.openai.com/v1",
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = createAnthropic({
  baseURL: process.env.KGATEWAY_ANTHROPIC_URL || "https://api.anthropic.com/v1",
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const google = createGoogleGenerativeAI({
  baseURL: process.env.KGATEWAY_GOOGLE_URL || "https://generativelanguage.googleapis.com/v1beta",
  apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
});

// Claude Code provider - uses Claude Code CLI with Pro/Max subscription
// No API key needed - authenticates via `claude login` (OAuth)
const claudeCode = createClaudeCode({
  defaultSettings: {
    // Accept edits automatically (bypassPermissions not allowed as root)
    permissionMode: "acceptEdits",
    // Working directory for CLI operations
    cwd: process.env.CLAUDE_CODE_CWD || process.cwd(),
    // Enable extended thinking with budget of 10k tokens
    maxThinkingTokens: 10_000,
    // Enable verbose logging in development
    verbose: process.env.NODE_ENV === "development",
  },
});

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
      return anthropic(model);
    case "openai":
      return openai(model);
    case "google":
      return google(model);
    case "xai":
      // xAI uses OpenAI-compatible API
      return openai(model);
    case "claude-code":
      // Claude Code uses CLI with Pro/Max subscription
      // Model shortcuts: opus, sonnet, haiku
      return claudeCode(model);
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
  return anthropic("claude-sonnet-4-5-20250929");
}

export function getArtifactModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("artifact-model");
  }
  // Use Claude Sonnet 4.5 for artifact generation
  return anthropic("claude-sonnet-4-5-20250929");
}
