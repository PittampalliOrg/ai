/**
 * Dapr Configuration and Secrets Provider
 *
 * Provides a unified interface for accessing configuration values and secrets
 * through Dapr's Configuration and Secrets building blocks.
 *
 * Features:
 * - Caches configuration and secrets at startup
 * - Falls back to environment variables when Dapr is unavailable
 * - Supports dynamic configuration updates (when subscribed)
 * - Type-safe access to known configuration keys
 *
 * @example
 * ```ts
 * // Initialize at startup (in instrumentation.ts)
 * await initializeConfigAndSecrets();
 *
 * // Use throughout the application
 * const apiKey = getSecretValue("OPENAI_API_KEY");
 * const enabled = isFeatureEnabled("WORKFLOW_PATTERNS_ENABLED");
 * ```
 */

import {
  getConfiguration,
  getSecret,
  getBulkSecrets,
  isAvailable,
  type ConfigurationItem,
} from "./client";

// ============================================================================
// Configuration
// ============================================================================

/**
 * Default Dapr component names
 * These can be overridden via environment variables for flexibility
 *
 * CONFIG_STORE: Azure App Configuration via Dapr (configuration.azure.appconfig)
 * SECRET_STORE: Azure Key Vault via Dapr (secretstores.azure.keyvault)
 */
const CONFIG_STORE = process.env.DAPR_CONFIG_STORE || "azureappconfig";
const SECRET_STORE = process.env.DAPR_SECRET_STORE || "azurekeyvault";

/**
 * Configuration keys to load from Dapr Configuration store (Azure App Configuration)
 * These are non-sensitive values that benefit from dynamic updates
 *
 * See: config/azure-app-configuration.json for the full list with values
 */
const CONFIG_KEYS = [
  // Feature flags
  "WORKFLOW_PATTERNS_ENABLED",
  "USE_DAPR_SERVICE_INVOCATION",
  "DAPR_WORKFLOW_ENABLED",
  "USE_DAPR_STATE_STORE",
  "USE_BUILT_IN_AGENTS",
  // Sandbox settings
  "SANDBOX_MODE",
  "SANDBOX_NAMESPACE",
  "SANDBOX_TEMPLATE",
  "SANDBOX_TIMEOUT",
  // Service URLs (can change during migrations)
  "WORKFLOW_SERVICE_URL",
  "PLANNER_SERVICE_URL",
  "PLANNER_AGENT_APP_ID",
  // Gateway URLs
  "KGATEWAY_OPENAI_URL",
  "KGATEWAY_ANTHROPIC_URL",
  "KGATEWAY_GOOGLE_URL",
  // Observability
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_EXPORTER_OTLP_PROTOCOL",
  "OTEL_SERVICE_NAME",
  "OTEL_RESOURCE_ATTRIBUTES",
  "OTEL_PROPAGATORS",
  "OTEL_BSP_SCHEDULE_DELAY",
  "OTEL_BSP_MAX_EXPORT_BATCH_SIZE",
  // Dapr component names
  "DAPR_STATE_STORE",
  "DAPR_PUBSUB",
  "PUBSUB_NAME",
  "AGENT_REGISTRY_STORE",
  "DAPR_WORKFLOW_STATE_STORE",
  // Kubernetes
  "APP_NAMESPACE",
  // Storage
  "UPLOAD_DIR",
  "WORKING_DIRECTORY",
  // Auth
  "AUTH_TRUST_HOST",
  "AUTH_URL",
  // AI Models
  "CLAUDE_MODEL",
  "CLAUDE_CODE_PATH",
  // Execution
  "EXECUTION_TIMEOUT",
  // Redis (non-secret connection info)
  "REDIS_HOST",
  "REDIS_PORT",
  "WORKFLOW_REDIS_HOST",
  "WORKFLOW_REDIS_PORT",
  "WORKFLOW_STATE_KEY",
  // Feature flags service (Flipt)
  "FLIPT_URL",
  "FLIPT_NAMESPACE",
  "FLIPT_ENABLED",
] as const;

/**
 * Secret mappings from application env var names to Azure Key Vault secret names
 * Format: { ENV_VAR_NAME: "AZURE-KEY-VAULT-SECRET-NAME" }
 *
 * Azure Key Vault uses hyphens in secret names, while our app uses underscores.
 * These names match the ExternalSecrets configuration in stacks/main.
 *
 * See: stacks/main/packages/base/manifests/ai-chatbot-secrets/
 */
const SECRET_MAPPINGS: Record<string, string> = {
  // Authentication (from ExternalSecret-ai-chatbot-secrets.yaml)
  AUTH_SECRET: "AI-CHATBOT-AUTH-SECRET",
  // Database
  POSTGRES_URL: "AI-CHATBOT-POSTGRES-URL",
  // Cache
  REDIS_URL: "AI-CHATBOT-REDIS-URL",
  // AI Providers
  OPENAI_API_KEY: "OPENAI-API-KEY",
  ANTHROPIC_API_KEY: "ANTHROPIC-API-KEY",
  GOOGLE_API_KEY: "GEMINI-API-KEY",
  GEMINI_API_KEY: "GEMINI-API-KEY",
  AI_GATEWAY_API_KEY: "AI-GATEWAY-API-KEY",
  // GitHub App (from ExternalSecret-ai-chatbot-github.yaml)
  // Note: These use OPEN-SWE prefix in the actual Key Vault
  GITHUB_APP_ID: "OPEN-SWE-GITHUB-APP-ID",
  GITHUB_APP_CLIENT_ID: "OPEN-SWE-GITHUB-APP-CLIENT-ID",
  GITHUB_APP_CLIENT_SECRET: "OPEN-SWE-GITHUB-APP-CLIENT-SECRET",
  GITHUB_APP_PRIVATE_KEY: "OPEN-SWE-GITHUB-APP-PRIVATE-KEY",
  GITHUB_WEBHOOK_SECRET: "OPEN-SWE-GITHUB-WEBHOOK-SECRET",
  // Storage
  BLOB_READ_WRITE_TOKEN: "AI-CHATBOT-BLOB-TOKEN",
};

// ============================================================================
// State
// ============================================================================

/** Cache for configuration values */
let configCache: Record<string, string> = {};

/** Cache for secret values */
let secretCache: Record<string, string> = {};

/** Whether the provider has been initialized */
let initialized = false;

/** Promise for in-progress initialization */
let initializationPromise: Promise<void> | null = null;

/** Whether Dapr is available */
let daprAvailable = false;

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize the configuration and secrets provider
 *
 * This should be called during application startup (in instrumentation.ts).
 * It will:
 * 1. Check if Dapr sidecar is available
 * 2. Load configuration from Dapr Configuration store (or fall back to env vars)
 * 3. Load secrets from Dapr Secrets store (or fall back to env vars)
 *
 * @throws Error if initialization fails and no fallback is available
 */
export async function initializeConfigAndSecrets(): Promise<void> {
  // Already initialized
  if (initialized) {
    return;
  }

  // Wait for in-progress initialization
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = doInitialize();
  return initializationPromise;
}

async function doInitialize(): Promise<void> {
  console.log("[ConfigProvider] Initializing configuration and secrets...");

  // Check if Dapr sidecar is available
  try {
    daprAvailable = await isAvailable();
  } catch {
    daprAvailable = false;
  }

  if (!daprAvailable) {
    console.log("[ConfigProvider] Dapr sidecar not available, using environment variables");
    loadFromEnvironment();
    initialized = true;
    return;
  }

  console.log("[ConfigProvider] Dapr sidecar available, loading from Dapr stores...");

  // Load configuration from Dapr
  try {
    await loadConfigurationFromDapr();
  } catch (error) {
    console.warn("[ConfigProvider] Failed to load configuration from Dapr, falling back to env vars:", error);
    loadConfigFromEnvironment();
  }

  // Load secrets from Dapr
  try {
    await loadSecretsFromDapr();
  } catch (error) {
    console.warn("[ConfigProvider] Failed to load secrets from Dapr, falling back to env vars:", error);
    loadSecretsFromEnvironment();
  }

  initialized = true;
  console.log("[ConfigProvider] Initialization complete");
}

/**
 * Load configuration values from Dapr Configuration store
 */
async function loadConfigurationFromDapr(): Promise<void> {
  const mutableKeys = [...CONFIG_KEYS];
  const config = await getConfiguration(CONFIG_STORE, mutableKeys, {
    label: "ai-chatbot",
  });

  for (const key of CONFIG_KEYS) {
    const item = config[key];
    if (item?.value !== undefined) {
      configCache[key] = item.value;
    } else {
      // Fall back to environment variable
      const envValue = process.env[key];
      if (envValue !== undefined) {
        configCache[key] = envValue;
      }
    }
  }

  console.log(`[ConfigProvider] Loaded ${Object.keys(configCache).length} configuration values`);
}

/**
 * Load secrets from Dapr Secrets store
 */
async function loadSecretsFromDapr(): Promise<void> {
  for (const [envKey, kvName] of Object.entries(SECRET_MAPPINGS)) {
    try {
      const value = await getSecret(SECRET_STORE, kvName);
      if (value) {
        secretCache[envKey] = value;
      }
    } catch (error) {
      // Fall back to environment variable for this specific secret
      const envValue = process.env[envKey];
      if (envValue !== undefined) {
        secretCache[envKey] = envValue;
        console.warn(`[ConfigProvider] Using env var fallback for secret: ${envKey}`);
      }
    }
  }

  console.log(`[ConfigProvider] Loaded ${Object.keys(secretCache).length} secrets`);
}

/**
 * Load all values from environment variables (fallback mode)
 */
function loadFromEnvironment(): void {
  loadConfigFromEnvironment();
  loadSecretsFromEnvironment();
}

function loadConfigFromEnvironment(): void {
  for (const key of CONFIG_KEYS) {
    const value = process.env[key];
    if (value !== undefined) {
      configCache[key] = value;
    }
  }
}

function loadSecretsFromEnvironment(): void {
  for (const envKey of Object.keys(SECRET_MAPPINGS)) {
    const value = process.env[envKey];
    if (value !== undefined) {
      secretCache[envKey] = value;
    }
  }
}

// ============================================================================
// Accessors
// ============================================================================

/**
 * Get a configuration value
 *
 * Priority order:
 * 1. Dapr Configuration cache (if initialized from Dapr)
 * 2. Environment variable
 * 3. Default value
 *
 * @param key - Configuration key
 * @param defaultValue - Default value if not found
 * @returns The configuration value or default
 *
 * @example
 * ```ts
 * const mode = getConfig("SANDBOX_MODE", "local");
 * ```
 */
export function getConfig(key: string, defaultValue?: string): string {
  // Check cache first (populated from Dapr or env vars)
  if (key in configCache) {
    return configCache[key];
  }

  // Direct env var fallback (for values not in CONFIG_KEYS)
  const envValue = process.env[key];
  if (envValue !== undefined) {
    return envValue;
  }

  return defaultValue ?? "";
}

/**
 * Get a secret value
 *
 * Priority order:
 * 1. Dapr Secrets cache (if initialized from Dapr)
 * 2. Environment variable
 *
 * @param key - Secret key (using ENV_VAR naming convention)
 * @returns The secret value or empty string
 *
 * @example
 * ```ts
 * const apiKey = getSecretValue("OPENAI_API_KEY");
 * ```
 */
export function getSecretValue(key: string): string {
  // Check cache first
  if (key in secretCache) {
    return secretCache[key];
  }

  // Direct env var fallback
  const envValue = process.env[key];
  if (envValue !== undefined) {
    return envValue;
  }

  return "";
}

/**
 * Check if a feature flag is enabled
 *
 * @param key - Feature flag key
 * @returns true if the value is "true" or "1"
 *
 * @example
 * ```ts
 * if (isFeatureEnabled("WORKFLOW_PATTERNS_ENABLED")) {
 *   // Initialize workflow runtime
 * }
 * ```
 */
export function isFeatureEnabled(key: string): boolean {
  const value = getConfig(key, "false");
  return value === "true" || value === "1";
}

/**
 * Check if Dapr building blocks are being used
 */
export function isDaprEnabled(): boolean {
  return daprAvailable && initialized;
}

/**
 * Check if the provider has been initialized
 */
export function isInitialized(): boolean {
  return initialized;
}

// ============================================================================
// Dynamic Updates
// ============================================================================

/**
 * Refresh configuration from Dapr
 *
 * Call this to manually refresh configuration values.
 * Note: For automatic updates, use Dapr's subscription feature.
 */
export async function refreshConfiguration(): Promise<void> {
  if (!daprAvailable) {
    console.log("[ConfigProvider] Dapr not available, skipping refresh");
    return;
  }

  try {
    await loadConfigurationFromDapr();
    console.log("[ConfigProvider] Configuration refreshed");
  } catch (error) {
    console.error("[ConfigProvider] Failed to refresh configuration:", error);
  }
}

/**
 * Refresh secrets from Dapr
 *
 * Call this after secret rotation to pick up new values.
 * Note: Secrets should generally not be cached long-term.
 */
export async function refreshSecrets(): Promise<void> {
  if (!daprAvailable) {
    console.log("[ConfigProvider] Dapr not available, skipping refresh");
    return;
  }

  try {
    await loadSecretsFromDapr();
    console.log("[ConfigProvider] Secrets refreshed");
  } catch (error) {
    console.error("[ConfigProvider] Failed to refresh secrets:", error);
  }
}

/**
 * Update a configuration value in the local cache
 *
 * This is used by the subscription handler to update values
 * when Dapr pushes configuration changes.
 *
 * @param key - Configuration key
 * @param value - New value
 */
export function updateConfigValue(key: string, value: string): void {
  configCache[key] = value;
  console.log(`[ConfigProvider] Configuration updated: ${key}`);
}

// ============================================================================
// Lazy Loading (for modules that need secrets at import time)
// ============================================================================

/**
 * Get a secret value with lazy initialization
 *
 * This variant will attempt to initialize the provider if not already done.
 * Use this in modules that are imported before instrumentation runs.
 *
 * WARNING: This is async and may not work in all contexts.
 * Prefer using the sync `getSecretValue` after initialization.
 *
 * @param key - Secret key
 * @returns Promise resolving to the secret value
 */
export async function getSecretValueAsync(key: string): Promise<string> {
  if (!initialized) {
    await initializeConfigAndSecrets();
  }
  return getSecretValue(key);
}

/**
 * Get a configuration value with lazy initialization
 *
 * @param key - Configuration key
 * @param defaultValue - Default value if not found
 * @returns Promise resolving to the configuration value
 */
export async function getConfigAsync(key: string, defaultValue?: string): Promise<string> {
  if (!initialized) {
    await initializeConfigAndSecrets();
  }
  return getConfig(key, defaultValue);
}
