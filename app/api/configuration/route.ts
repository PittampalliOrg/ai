/**
 * Configuration Dashboard API
 *
 * GET /api/configuration
 * Aggregates configuration from Azure App Config (via Dapr), Flipt feature flags,
 * and runtime config into a unified response for the dashboard.
 */

import { NextResponse } from "next/server";
import { getConfiguration, isAvailable } from "@/lib/dapr/client";
import {
  getConfig,
  isDaprEnabled,
  isInitialized,
} from "@/lib/dapr/config-provider";

// Configuration keys to fetch from Dapr Configuration store
// Must specify keys explicitly - Azure App Config doesn't support "get all"
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
  // Service URLs
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
  // Redis
  "REDIS_HOST",
  "REDIS_PORT",
  "WORKFLOW_REDIS_HOST",
  "WORKFLOW_REDIS_PORT",
  "WORKFLOW_STATE_KEY",
  // Feature flags service
  "FLIPT_URL",
  "FLIPT_NAMESPACE",
  "FLIPT_ENABLED",
];

// Category patterns for auto-categorization by prefix
const CATEGORY_PATTERNS: [string, RegExp][] = [
  ["sandbox", /^SANDBOX_/],
  ["dapr", /^DAPR_|^PUBSUB_|^AGENT_REGISTRY/],
  ["observability", /^OTEL_/],
  ["ai", /^CLAUDE_|^KGATEWAY_/],
  ["auth", /^AUTH_/],
  ["redis", /^REDIS_|^WORKFLOW_REDIS/],
  ["workflow", /^WORKFLOW_|^PLANNER_/],
  ["flipt", /^FLIPT_/],
  ["kubernetes", /^APP_NAMESPACE/],
  ["storage", /^UPLOAD_|^WORKING_/],
  ["execution", /^EXECUTION_/],
];

function categorizeKey(key: string): string {
  for (const [category, pattern] of CATEGORY_PATTERNS) {
    if (pattern.test(key)) {
      return category;
    }
  }
  return "general";
}

interface ConfigItem {
  key: string;
  value: string;
  source: "azure" | "env";
  category: string;
}

interface FeatureFlag {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  type: "BOOLEAN_FLAG_TYPE" | "VARIANT_FLAG_TYPE";
  variants?: Array<{ key: string; name: string }>;
}

interface ConfigurationResponse {
  sources: {
    azureAppConfig: {
      available: boolean;
      endpoint: string;
      label: string;
      itemCount: number;
      lastFetched: string;
    };
    flipt: {
      available: boolean;
      url: string;
      namespace: string;
      flagCount: number;
    };
    runtime: {
      initialized: boolean;
      daprEnabled: boolean;
      configSource: "dapr" | "env";
    };
  };
  config: ConfigItem[];
  featureFlags: FeatureFlag[];
  debug?: {
    daprHost: string;
    daprPort: string;
    cachedInitialized: boolean;
    cachedDaprEnabled: boolean;
    realtimeDaprCheck: boolean;
    configStoreError?: string;
    fliptError?: string;
  };
}

const CONFIG_STORE = process.env.DAPR_CONFIG_STORE || "azureappconfig";

export async function GET() {
  // Check Dapr availability in real-time (don't rely on cached module state)
  const daprAvailable = await isAvailable();

  // Use real-time check for status display, but also show cached state for debugging
  const cachedInitialized = isInitialized();
  const cachedDaprEnabled = isDaprEnabled();

  // Track errors for debug info
  let configStoreError: string | undefined;
  let fliptError: string | undefined;

  const response: ConfigurationResponse = {
    sources: {
      azureAppConfig: {
        available: false,
        endpoint: getConfig("AZURE_APPCONFIG_ENDPOINT", "rg3-app-config"),
        label: "ai-chatbot",
        itemCount: 0,
        lastFetched: new Date().toISOString(),
      },
      flipt: {
        available: false,
        url: getConfig("FLIPT_URL", "http://flipt.feature-flags.svc.cluster.local:8080"),
        namespace: getConfig("FLIPT_NAMESPACE", "default"),
        flagCount: 0,
      },
      runtime: {
        // Use real-time Dapr check, not cached state
        initialized: cachedInitialized || daprAvailable,
        daprEnabled: daprAvailable,
        configSource: daprAvailable ? "dapr" : "env",
      },
    },
    config: [],
    featureFlags: [],
  };

  if (daprAvailable) {
    try {
      // Must specify keys explicitly - Azure App Config doesn't support "get all"
      const configResult = await getConfiguration(CONFIG_STORE, [...CONFIG_KEYS], {
        label: "ai-chatbot",
      });
      console.log("[Configuration API] getConfiguration returned:", Object.keys(configResult).length, "keys");
      response.sources.azureAppConfig.available = true;

      for (const [key, item] of Object.entries(configResult)) {
        if (item?.value !== undefined) {
          response.config.push({
            key,
            value: item.value,
            source: "azure",
            category: categorizeKey(key),
          });
        }
      }

      response.sources.azureAppConfig.itemCount = response.config.length;
    } catch (error) {
      configStoreError = error instanceof Error ? error.message : String(error);
      console.error("[Configuration API] Failed to fetch from Dapr:", configStoreError);
      // Continue with env vars only
    }
  }

  // If no config from Dapr, load from environment
  if (response.config.length === 0) {
    // Load common config keys from environment
    const envKeys = Object.keys(process.env).filter(
      (key) =>
        key.startsWith("WORKFLOW_") ||
        key.startsWith("SANDBOX_") ||
        key.startsWith("DAPR_") ||
        key.startsWith("OTEL_") ||
        key.startsWith("CLAUDE_") ||
        key.startsWith("KGATEWAY_") ||
        key.startsWith("AUTH_") ||
        key.startsWith("REDIS_") ||
        key.startsWith("FLIPT_") ||
        key.startsWith("PUBSUB_") ||
        key.startsWith("AGENT_") ||
        key.startsWith("PLANNER_") ||
        key.startsWith("APP_NAMESPACE") ||
        key.startsWith("UPLOAD_") ||
        key.startsWith("WORKING_") ||
        key.startsWith("EXECUTION_") ||
        key.startsWith("USE_")
    );

    for (const key of envKeys) {
      const value = process.env[key];
      if (value !== undefined) {
        response.config.push({
          key,
          value,
          source: "env",
          category: categorizeKey(key),
        });
      }
    }

    response.sources.azureAppConfig.itemCount = response.config.length;
  }

  // Sort config by category then key
  response.config.sort((a, b) => {
    const catCompare = a.category.localeCompare(b.category);
    if (catCompare !== 0) return catCompare;
    return a.key.localeCompare(b.key);
  });

  // Add debug info
  response.debug = {
    daprHost: process.env.DAPR_HOST || "localhost",
    daprPort: process.env.DAPR_HTTP_PORT || "3500",
    cachedInitialized,
    cachedDaprEnabled,
    realtimeDaprCheck: daprAvailable,
    configStoreError,
    fliptError,
  };

  // Fetch feature flags from Flipt
  const fliptUrl = getConfig(
    "FLIPT_URL",
    "http://flipt.feature-flags.svc.cluster.local:8080"
  );
  const fliptNamespace = getConfig("FLIPT_NAMESPACE", "default");

  try {
    const fliptResponse = await fetch(
      `${fliptUrl}/api/v1/namespaces/${fliptNamespace}/flags`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (fliptResponse.ok) {
      const fliptData = (await fliptResponse.json()) as {
        flags?: Array<{
          key: string;
          name: string;
          description?: string;
          enabled: boolean;
          type: "BOOLEAN_FLAG_TYPE" | "VARIANT_FLAG_TYPE";
          variants?: Array<{ key: string; name: string }>;
        }>;
      };

      response.sources.flipt.available = true;
      response.featureFlags =
        fliptData.flags?.map((flag) => ({
          key: flag.key,
          name: flag.name,
          description: flag.description || "",
          enabled: flag.enabled,
          type: flag.type,
          variants: flag.variants,
        })) || [];
      response.sources.flipt.flagCount = response.featureFlags.length;
    }
  } catch (error) {
    fliptError = error instanceof Error ? error.message : String(error);
    console.error("[Configuration API] Failed to fetch from Flipt:", fliptError);
    // Continue without Flipt data
  }

  return NextResponse.json(response);
}
