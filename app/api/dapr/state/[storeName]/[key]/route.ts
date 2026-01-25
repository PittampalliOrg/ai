/**
 * Dapr State Store Key API
 *
 * GET /api/dapr/state/[storeName]/[key]
 * Get a specific key from the state store
 *
 * DELETE /api/dapr/state/[storeName]/[key]
 * Delete a specific key from the state store
 */

import { NextRequest, NextResponse } from "next/server";
import { isAvailable, getState } from "@/lib/dapr/client";

const DAPR_HTTP_PORT = process.env.DAPR_HTTP_PORT || "3500";
const DAPR_HOST = process.env.DAPR_HOST || "localhost";

interface RouteParams {
  params: Promise<{ storeName: string; key: string }>;
}

/**
 * GET /api/dapr/state/[storeName]/[key]
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { storeName, key } = await params;
  const decodedKey = decodeURIComponent(key);

  const available = await isAvailable();
  if (!available) {
    return NextResponse.json(
      { error: "Dapr sidecar not available" },
      { status: 503 }
    );
  }

  try {
    const result = await getState(storeName, decodedKey);

    if (result.data === null) {
      return NextResponse.json(
        { error: "Key not found", key: decodedKey },
        { status: 404 }
      );
    }

    return NextResponse.json({
      key: decodedKey,
      value: result.data,
      etag: result.etag,
    });
  } catch (error) {
    console.error(
      `[State API] Error fetching key ${decodedKey} from ${storeName}:`,
      error
    );
    return NextResponse.json(
      {
        error: `Failed to fetch key from ${storeName}`,
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/dapr/state/[storeName]/[key]
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { storeName, key } = await params;
  const decodedKey = decodeURIComponent(key);

  const available = await isAvailable();
  if (!available) {
    return NextResponse.json(
      { error: "Dapr sidecar not available" },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(
      `http://${DAPR_HOST}:${DAPR_HTTP_PORT}/v1.0/state/${storeName}/${encodeURIComponent(decodedKey)}`,
      {
        method: "DELETE",
        signal: AbortSignal.timeout(5000),
      }
    );

    if (!response.ok && response.status !== 204) {
      const errorText = await response.text();
      throw new Error(`Delete failed: ${response.status} - ${errorText}`);
    }

    return NextResponse.json({
      success: true,
      deleted: decodedKey,
    });
  } catch (error) {
    console.error(
      `[State API] Error deleting key ${decodedKey} from ${storeName}:`,
      error
    );
    return NextResponse.json(
      {
        error: `Failed to delete key from ${storeName}`,
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
