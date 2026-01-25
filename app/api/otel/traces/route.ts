import { NextRequest, NextResponse } from "next/server";

/**
 * OTEL Trace Proxy Endpoint
 *
 * Proxies browser-side traces to the OTEL collector.
 * This is necessary because browsers cannot directly access
 * the cluster-internal OTEL collector due to CORS restrictions.
 *
 * The browser OTEL SDK sends traces here, and we forward them
 * to the collector using the same OTLP/HTTP protocol.
 */

const OTEL_COLLECTOR_ENDPOINT =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
  "http://otel-collector.observability.svc.cluster.local:4318";

export async function POST(request: NextRequest) {
  try {
    // Get the trace data from the browser
    const body = await request.arrayBuffer();

    // Forward to OTEL collector
    const collectorUrl = `${OTEL_COLLECTOR_ENDPOINT}/v1/traces`;

    const response = await fetch(collectorUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-protobuf",
        // Forward any OTEL headers
        ...(process.env.OTEL_EXPORTER_OTLP_HEADERS
          ? parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS)
          : {}),
      },
      body,
    });

    if (!response.ok) {
      console.error(
        `[OTEL Proxy] Collector returned ${response.status}: ${await response.text()}`
      );
      return NextResponse.json(
        { error: "Failed to forward traces" },
        { status: response.status }
      );
    }

    return new NextResponse(null, { status: 200 });
  } catch (error) {
    console.error("[OTEL Proxy] Error forwarding traces:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Parse OTEL headers from environment variable format
 * Format: "key1=value1,key2=value2"
 */
function parseHeaders(headerString: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const pairs = headerString.split(",");
  for (const pair of pairs) {
    const [key, ...valueParts] = pair.split("=");
    if (key && valueParts.length > 0) {
      headers[key.trim()] = valueParts.join("=").trim();
    }
  }
  return headers;
}

// Also support preflight for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
