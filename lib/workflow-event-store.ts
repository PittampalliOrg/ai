/**
 * Workflow Event Store
 *
 * Redis-backed store for workflow streaming events.
 * Used by both the webhook (to store events) and stream route (to read events).
 *
 * Uses Redis to ensure events are shared across all Next.js route handlers.
 */

import Redis from "ioredis";

interface WorkflowStreamEvent {
  id: string;
  type: string;
  workflowId: string;
  taskId?: string;
  agentId?: string;
  data: Record<string, unknown>;
  timestamp: string;
}

// Redis configuration
const REDIS_URL = process.env.REDIS_URL;
const REDIS_HOST =
  process.env.REDIS_HOST || "ai-chatbot-redis.workflow-builder.svc.cluster.local";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379", 10);
const EVENT_KEY_PREFIX = "workflow-events:";
const MAX_EVENTS_PER_WORKFLOW = 1000;
const EVENT_TTL_SECONDS = 3600; // 1 hour TTL for events

// Lazy-initialized Redis client
let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (!redisClient) {
    const connectionOptions = {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 3) return null;
        return Math.min(times * 100, 1000);
      },
    };

    redisClient = REDIS_URL
      ? new Redis(REDIS_URL, connectionOptions)
      : new Redis({
          host: REDIS_HOST,
          port: REDIS_PORT,
          ...connectionOptions,
        });

    redisClient.on("error", (err) => {
      console.error("[EventStore] Redis error:", err.message);
    });

    redisClient.on("connect", () => {
      console.log(
        `[EventStore] Connected to Redis at ${REDIS_URL ?? `${REDIS_HOST}:${REDIS_PORT}`}`,
      );
    });
  }
  return redisClient;
}

/**
 * Store an event for a workflow (with deduplication)
 */
export async function storeWorkflowEvent(event: WorkflowStreamEvent): Promise<void> {
  const workflowId = event.workflowId;
  const key = `${EVENT_KEY_PREFIX}${workflowId}`;

  try {
    const redis = getRedisClient();

    // Check for duplicate by event ID
    if (event.id) {
      const existingEvents = await redis.lrange(key, 0, -1);
      const isDuplicate = existingEvents.some((e) => {
        try {
          const parsed = JSON.parse(e);
          return parsed.id === event.id;
        } catch {
          return false;
        }
      });

      if (isDuplicate) {
        return; // Skip duplicate event
      }
    }

    // Add event to the list
    await redis.rpush(key, JSON.stringify(event));

    // Trim to max size
    await redis.ltrim(key, -MAX_EVENTS_PER_WORKFLOW, -1);

    // Set TTL to auto-expire old workflows
    await redis.expire(key, EVENT_TTL_SECONDS);
  } catch (error) {
    console.error(`[EventStore] Error storing event for ${workflowId}:`, error);
  }
}

/**
 * Get events for a workflow
 */
export async function getWorkflowEvents(workflowId: string): Promise<WorkflowStreamEvent[]> {
  const key = `${EVENT_KEY_PREFIX}${workflowId}`;

  try {
    const redis = getRedisClient();
    const events = await redis.lrange(key, 0, -1);

    return events.map((e) => {
      try {
        return JSON.parse(e) as WorkflowStreamEvent;
      } catch {
        return null;
      }
    }).filter((e): e is WorkflowStreamEvent => e !== null);
  } catch (error) {
    console.error(`[EventStore] Error getting events for ${workflowId}:`, error);
    return [];
  }
}

/**
 * Clear events for a workflow
 */
export async function clearWorkflowEvents(workflowId: string): Promise<void> {
  const key = `${EVENT_KEY_PREFIX}${workflowId}`;

  try {
    const redis = getRedisClient();
    await redis.del(key);
  } catch (error) {
    console.error(`[EventStore] Error clearing events for ${workflowId}:`, error);
  }
}

/**
 * Get total event count (for debugging)
 */
export async function getEventStoreStats(): Promise<{ totalWorkflows: number; totalEvents: number }> {
  try {
    const redis = getRedisClient();
    const keys = await redis.keys(`${EVENT_KEY_PREFIX}*`);

    let totalEvents = 0;
    for (const key of keys) {
      const count = await redis.llen(key);
      totalEvents += count;
    }

    return {
      totalWorkflows: keys.length,
      totalEvents,
    };
  } catch (error) {
    console.error("[EventStore] Error getting stats:", error);
    return { totalWorkflows: 0, totalEvents: 0 };
  }
}
