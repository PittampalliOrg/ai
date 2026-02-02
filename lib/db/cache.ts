/**
 * Database Query Cache Layer
 *
 * Implements Redis-based caching for frequently accessed database queries
 * to reduce database load and improve response times.
 */

import "server-only";
import Redis from "ioredis";
import { getSecretValue } from "../dapr/config-provider";

// Initialize Redis client (supports both local and cloud Redis)
let redis: Redis | null = null;

function getRedisClient(): Redis | null {
  if (redis) return redis;

  // Get Redis URL from Dapr Secrets or env var fallback
  const redisUrl = getSecretValue("REDIS_URL");

  // Only initialize if REDIS_URL is provided
  if (!redisUrl) {
    console.warn("[Cache] REDIS_URL not configured, caching disabled");
    return null;
  }

  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          console.error("[Cache] Redis connection failed after 3 retries");
          return null;
        }
        return Math.min(times * 100, 2000);
      },
      // Fail fast if Redis is unavailable - don't block requests
      connectTimeout: 2000,
      lazyConnect: true,
    });

    redis.on("error", (err) => {
      console.error("[Cache] Redis error:", err);
    });

    console.log("[Cache] Redis client initialized");
    return redis;
  } catch (error) {
    console.error("[Cache] Failed to initialize Redis:", error);
    return null;
  }
}

/**
 * Cache key prefixes for different data types
 */
export const CacheKeys = {
  CHAT: "chat:",
  USER_CHATS: "user_chats:",
  MESSAGES: "messages:",
  MESSAGE_COUNT: "msg_count:",
  AGENT_SESSION: "agent_session:",
  USER_AGENT_SESSIONS: "user_agent_sessions:",
  AGENT_MESSAGES: "agent_messages:",
  VOTES: "votes:",
  DOCUMENTS: "documents:",
  SUGGESTIONS: "suggestions:",
} as const;

/**
 * Default TTL values (in seconds)
 */
export const CacheTTL = {
  SHORT: 60, // 1 minute - for frequently changing data
  MEDIUM: 300, // 5 minutes - for semi-static data
  LONG: 3600, // 1 hour - for rarely changing data
  VERY_LONG: 86400, // 24 hours - for static data
} as const;

/**
 * Generic cache get/set wrapper
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const data = await client.get(key);
    if (!data) return null;

    return JSON.parse(data) as T;
  } catch (error) {
    console.error(`[Cache] Error getting key ${key}:`, error);
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number = CacheTTL.MEDIUM
): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    await client.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (error) {
    console.error(`[Cache] Error setting key ${key}:`, error);
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  const client = getRedisClient();
  if (!client || keys.length === 0) return;

  try {
    await client.del(...keys);
  } catch (error) {
    console.error(`[Cache] Error deleting keys:`, error);
  }
}

/**
 * Invalidate cache by pattern (e.g., "user_chats:*")
 */
export async function cacheInvalidatePattern(pattern: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  } catch (error) {
    console.error(`[Cache] Error invalidating pattern ${pattern}:`, error);
  }
}

/**
 * Wrapper for caching query results
 *
 * Usage:
 * ```ts
 * const chats = await cachedQuery(
 *   `${CacheKeys.USER_CHATS}${userId}`,
 *   () => db.select().from(chat).where(eq(chat.userId, userId)),
 *   CacheTTL.MEDIUM
 * );
 * ```
 */
export async function cachedQuery<T>(
  key: string,
  queryFn: () => Promise<T>,
  ttlSeconds: number = CacheTTL.MEDIUM
): Promise<T> {
  // Try to get from cache first
  const cached = await cacheGet<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Cache miss - execute query
  const result = await queryFn();

  // Store in cache (fire and forget - don't block on cache writes)
  cacheSet(key, result, ttlSeconds).catch((err) => {
    console.error("[Cache] Failed to cache query result:", err);
  });

  return result;
}

/**
 * Cache invalidation helpers for specific entities
 */
export const CacheInvalidation = {
  /**
   * Invalidate all cache entries related to a user's chats
   */
  async invalidateUserChats(userId: string): Promise<void> {
    await Promise.all([
      cacheDel(`${CacheKeys.USER_CHATS}${userId}`),
      cacheInvalidatePattern(`${CacheKeys.CHAT}*`),
    ]);
  },

  /**
   * Invalidate cache for a specific chat
   */
  async invalidateChat(chatId: string): Promise<void> {
    await Promise.all([
      cacheDel(`${CacheKeys.CHAT}${chatId}`),
      cacheDel(`${CacheKeys.MESSAGES}${chatId}`),
      cacheDel(`${CacheKeys.VOTES}${chatId}`),
    ]);
  },

  /**
   * Invalidate message count cache for a user
   */
  async invalidateMessageCount(userId: string): Promise<void> {
    await cacheInvalidatePattern(`${CacheKeys.MESSAGE_COUNT}${userId}:*`);
  },

  /**
   * Invalidate all cache entries related to agent sessions
   */
  async invalidateUserAgentSessions(userId: string): Promise<void> {
    await cacheDel(`${CacheKeys.USER_AGENT_SESSIONS}${userId}`);
  },

  /**
   * Invalidate cache for a specific agent session
   */
  async invalidateAgentSession(sessionId: string): Promise<void> {
    await Promise.all([
      cacheDel(`${CacheKeys.AGENT_SESSION}${sessionId}`),
      cacheDel(`${CacheKeys.AGENT_MESSAGES}${sessionId}`),
    ]);
  },
};

/**
 * Health check for Redis connection
 */
export async function cacheHealthCheck(): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  try {
    await client.ping();
    return true;
  } catch {
    return false;
  }
}
