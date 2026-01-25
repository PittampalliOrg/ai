/**
 * Dapr Metadata API
 *
 * GET /api/dapr/metadata
 * Returns Dapr sidecar metadata including components and subscriptions
 */

import { NextResponse } from "next/server";
import { getMetadata, isAvailable } from "@/lib/dapr/client";

export async function GET() {
  // Check if Dapr is available
  const available = await isAvailable();
  if (!available) {
    return NextResponse.json(
      {
        error: "Dapr sidecar not available",
        available: false,
      },
      { status: 503 }
    );
  }

  const metadata = await getMetadata();
  if (!metadata) {
    return NextResponse.json(
      { error: "Failed to fetch Dapr metadata" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    available: true,
    ...metadata,
  });
}
