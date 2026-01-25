/**
 * Dapr State Store API
 *
 * GET /api/dapr/state/[storeName]
 * Lists known keys from a state store (uses known key prefixes since Redis doesn't support list)
 *
 * POST /api/dapr/state/[storeName]
 * Save state entries to the store
 */

import { NextRequest, NextResponse } from "next/server";
import {
  isAvailable,
  getBulkState,
  saveState,
  queryState,
  STATE_KEY_PREFIXES,
} from "@/lib/dapr/client";

interface RouteParams {
  params: Promise<{ storeName: string }>;
}

// Known keys to check for each store
const KNOWN_KEY_PATTERNS: Record<string, string[]> = {
  workflowstatestore: [
    // Workflow instances - these are dynamically created
    // We'll need to track them separately or use a registry
  ],
  statestore: [
    "sandbox:registry",
    "config:app:settings",
  ],
  sandboxregistry: [],
};

/**
 * GET /api/dapr/state/[storeName]
 * Returns state entries from the store
 *
 * Query params:
 * - keys: Comma-separated list of specific keys to fetch
 * - prefix: Key prefix to filter by (requires query API support)
 * - limit: Max number of entries to return
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { storeName } = await params;
  const searchParams = request.nextUrl.searchParams;
  const keysParam = searchParams.get("keys");
  const prefix = searchParams.get("prefix");
  const limit = parseInt(searchParams.get("limit") || "100", 10);

  // Check if Dapr is available
  const available = await isAvailable();
  if (!available) {
    return NextResponse.json(
      { error: "Dapr sidecar not available" },
      { status: 503 }
    );
  }

  try {
    // If specific keys are requested, use bulk get
    if (keysParam) {
      const keys = keysParam.split(",").map((k) => k.trim());
      const results = await getBulkState(storeName, keys);

      return NextResponse.json({
        storeName,
        entries: results.map((r) => ({
          key: r.key,
          value: r.data,
          etag: r.etag,
        })),
        total: results.length,
      });
    }

    // If prefix is provided, try to use query API
    if (prefix) {
      try {
        const queryResult = await queryState(storeName, {
          filter: {
            // Query API filter syntax depends on the state store
            // This is a simple example for stores that support it
          },
          page: { limit },
        });

        return NextResponse.json({
          storeName,
          entries: queryResult.results.map((r) => ({
            key: r.key,
            value: r.data,
            etag: r.etag,
          })),
          total: queryResult.results.length,
          nextToken: queryResult.token,
        });
      } catch (queryError) {
        // Query API not supported, fall back to known keys
        console.warn(
          `[State API] Query API not supported for ${storeName}, using known keys`
        );
      }
    }

    // Fall back to known keys for this store
    const knownKeys = KNOWN_KEY_PATTERNS[storeName] || [];

    // Also check for workflow keys by looking at common prefixes
    const prefixesToCheck = Object.values(STATE_KEY_PREFIXES);
    const allKeysToCheck = [...knownKeys];

    // For workflowstatestore, we need to look for workflow instance keys
    // These are typically stored with a pattern like workflow||<instanceId>||state
    if (storeName === "workflowstatestore") {
      // Try to get the workflow registry if it exists
      try {
        const registryResult = await getBulkState<string[]>(storeName, [
          "workflow:registry",
        ]);
        if (registryResult[0]?.data) {
          allKeysToCheck.push(...registryResult[0].data);
        }
      } catch {
        // Registry doesn't exist, that's fine
      }
    }

    if (allKeysToCheck.length === 0) {
      return NextResponse.json({
        storeName,
        entries: [],
        total: 0,
        message:
          "No known keys for this store. Use ?keys=key1,key2 to fetch specific keys.",
      });
    }

    const results = await getBulkState(storeName, allKeysToCheck);

    return NextResponse.json({
      storeName,
      entries: results
        .filter((r) => r.data !== null && r.data !== undefined)
        .map((r) => ({
          key: r.key,
          value: r.data,
          etag: r.etag,
        })),
      total: results.filter((r) => r.data !== null).length,
    });
  } catch (error) {
    console.error(`[State API] Error fetching state from ${storeName}:`, error);
    return NextResponse.json(
      {
        error: `Failed to fetch state from ${storeName}`,
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/dapr/state/[storeName]
 * Save state entries
 *
 * Body: Array of { key, value, metadata? }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { storeName } = await params;

  const available = await isAvailable();
  if (!available) {
    return NextResponse.json(
      { error: "Dapr sidecar not available" },
      { status: 503 }
    );
  }

  try {
    const entries = await request.json();

    if (!Array.isArray(entries)) {
      return NextResponse.json(
        { error: "Request body must be an array of entries" },
        { status: 400 }
      );
    }

    await saveState(storeName, entries);

    return NextResponse.json({
      success: true,
      saved: entries.length,
    });
  } catch (error) {
    console.error(`[State API] Error saving state to ${storeName}:`, error);
    return NextResponse.json(
      {
        error: `Failed to save state to ${storeName}`,
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
