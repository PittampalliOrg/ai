"use client";

import { useEffect, useRef } from "react";

interface TelemetryProviderProps {
  children: React.ReactNode;
}

/**
 * Client-side OpenTelemetry Provider
 *
 * Instruments browser-side operations:
 * - Document load timing (navigation, resource loading)
 * - Fetch requests (API calls, data fetching)
 *
 * Traces are sent to /api/otel/traces which proxies to the OTEL collector
 * to avoid CORS issues with direct collector access.
 */
export function TelemetryProvider({ children }: TelemetryProviderProps) {
  const initialized = useRef(false);

  useEffect(() => {
    // Only initialize once and only in browser
    if (initialized.current || typeof window === "undefined") {
      return;
    }

    // Check if telemetry is enabled
    const isEnabled = process.env.NEXT_PUBLIC_OTEL_ENABLED === "true";
    if (!isEnabled) {
      console.log("[Browser OTEL] Telemetry disabled");
      return;
    }

    initialized.current = true;

    // Dynamically import OTEL modules to avoid SSR issues
    initializeTelemetry().catch(console.error);
  }, []);

  return <>{children}</>;
}

async function initializeTelemetry() {
  const serviceName =
    process.env.NEXT_PUBLIC_OTEL_SERVICE_NAME || "ai-chatbot-browser";

  console.log(`[Browser OTEL] Initializing telemetry for ${serviceName}`);

  // Dynamic imports to avoid SSR issues with browser-only modules
  const [
    { WebTracerProvider, BatchSpanProcessor },
    { OTLPTraceExporter },
    { ZoneContextManager },
    { registerInstrumentations },
    { FetchInstrumentation },
    { DocumentLoadInstrumentation },
    { resourceFromAttributes },
    semanticConventions,
  ] = await Promise.all([
    import("@opentelemetry/sdk-trace-web"),
    import("@opentelemetry/exporter-trace-otlp-http"),
    import("@opentelemetry/context-zone"),
    import("@opentelemetry/instrumentation"),
    import("@opentelemetry/instrumentation-fetch"),
    import("@opentelemetry/instrumentation-document-load"),
    import("@opentelemetry/resources"),
    import("@opentelemetry/semantic-conventions"),
  ]);

  // Create resource with service metadata
  const resource = resourceFromAttributes({
    [semanticConventions.ATTR_SERVICE_NAME]: serviceName,
    [semanticConventions.ATTR_SERVICE_VERSION]: "1.0.0",
    "deployment.environment":
      process.env.NODE_ENV === "production" ? "production" : "development",
    "browser.user_agent": navigator.userAgent,
    "browser.language": navigator.language,
  });

  // Create exporter that sends to our proxy endpoint
  const exporter = new OTLPTraceExporter({
    url: "/api/otel/traces",
    headers: {},
  });

  // Create tracer provider
  const provider = new WebTracerProvider({
    resource,
    spanProcessors: [
      new BatchSpanProcessor(exporter, {
        maxQueueSize: 100,
        maxExportBatchSize: 10,
        scheduledDelayMillis: 5000,
        exportTimeoutMillis: 30000,
      }),
    ],
  });

  // Register provider with zone context manager for async context propagation
  provider.register({
    contextManager: new ZoneContextManager(),
  });

  // Register automatic instrumentations
  registerInstrumentations({
    instrumentations: [
      // Instrument fetch requests
      new FetchInstrumentation({
        // Only trace API calls, not static assets
        ignoreUrls: [
          /\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$/,
          /_next\//,
          /favicon/,
        ],
        // Propagate trace context to backend
        propagateTraceHeaderCorsUrls: [/.*/],
      }),
      // Instrument document load
      new DocumentLoadInstrumentation(),
    ],
  });

  console.log("[Browser OTEL] Telemetry initialized");
}
