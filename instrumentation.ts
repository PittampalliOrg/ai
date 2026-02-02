import { registerOTel } from "@vercel/otel";

export async function register() {
  // Register OpenTelemetry
  registerOTel({ serviceName: "ai-chatbot" });

  // Initialize Dapr Configuration and Secrets provider
  // Only on server (not in Edge runtime)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { initializeConfigAndSecrets } = await import("@/lib/dapr/config-provider");
      await initializeConfigAndSecrets();
    } catch (error) {
      // Log but don't fail startup - fallback to env vars will be used
      console.warn("[Instrumentation] Failed to initialize Dapr config provider:", error);
    }
  }
}
