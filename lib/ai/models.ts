// Curated list of available models
// Updated with latest model names as of January 2026
// Claude Code models use OAuth via `claude login` - no API key needed
export const DEFAULT_CHAT_MODEL = "claude-code/opus";

export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
};

export const chatModels: ChatModel[] = [
  // Claude Code - Uses Pro/Max subscription via OAuth (no API key needed)
  {
    id: "claude-code/sonnet",
    name: "Claude Code Sonnet",
    provider: "claude-code",
    description: "Balanced model with agentic tools (OAuth)",
  },
  {
    id: "claude-code/opus",
    name: "Claude Code Opus",
    provider: "claude-code",
    description: "Most capable with agentic tools (OAuth)",
  },
  {
    id: "claude-code/haiku",
    name: "Claude Code Haiku",
    provider: "claude-code",
    description: "Fastest with agentic tools (OAuth)",
  },
  // Anthropic - Claude 4.5 series (API)
  {
    id: "anthropic/claude-sonnet-4-5-20250929",
    name: "Claude Sonnet 4.5 (API)",
    provider: "anthropic",
    description: "Best balance of speed, intelligence, and cost",
  },
  {
    id: "anthropic/claude-opus-4-5-20251101",
    name: "Claude Opus 4.5 (API)",
    provider: "anthropic",
    description: "Most capable Anthropic model - 80.9% on SWE-bench",
  },
  // OpenAI
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    description: "Fast and cost-effective for simple tasks",
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    description: "Most capable OpenAI model",
  },
  // Google - Gemini 3 series (released December 2025)
  {
    id: "google/gemini-3-flash-preview",
    name: "Gemini 3 Flash",
    provider: "google",
    description: "Pro-level intelligence at Flash speed - 78% on SWE-bench",
  },
  {
    id: "google/gemini-3-pro-preview",
    name: "Gemini 3 Pro",
    provider: "google",
    description: "State-of-the-art reasoning and multimodal understanding",
  },
  // Reasoning models (extended thinking)
  {
    id: "anthropic/claude-opus-4-5-20251101-thinking",
    name: "Claude Opus 4.5 (Thinking)",
    provider: "reasoning",
    description: "Extended thinking for complex problems",
  },
];

// Group models by provider for UI
export const modelsByProvider = chatModels.reduce(
  (acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  },
  {} as Record<string, ChatModel[]>
);
