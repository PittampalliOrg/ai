/**
 * Dapr Pub/Sub Subscription Endpoint
 *
 * GET /api/dapr/subscribe
 * Returns the list of pub/sub topics this application subscribes to.
 *
 * Dapr calls this endpoint to discover which topics to route to this app.
 */

import { NextResponse } from "next/server";

// Pub/sub configuration
const PUBSUB_NAME = process.env.PUBSUB_NAME ?? "pubsub";

/**
 * Subscription configuration
 */
interface DaprSubscription {
  pubsubname: string;
  topic: string;
  route: string;
  metadata?: Record<string, string>;
}

/**
 * GET /api/dapr/subscribe
 *
 * Returns the list of subscriptions for Dapr.
 */
export async function GET() {
  const subscriptions: DaprSubscription[] = [
    {
      pubsubname: PUBSUB_NAME,
      topic: "workflow.stream",
      route: "/api/webhooks/dapr/workflow-stream",
    },
    // Add more subscriptions here as needed
  ];

  return NextResponse.json(subscriptions);
}
