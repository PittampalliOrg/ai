/**
 * Cached Database Queries
 *
 * Optimized versions of frequently-accessed queries with Redis caching.
 * These should be used in place of direct queries for better performance.
 */

import "server-only";
import type { Chat, AgentSession } from "./schema";
import {
  getChatById as getChatByIdUncached,
  getChatsByUserId as getChatsByUserIdUncached,
  getMessagesByChatId as getMessagesByChatIdUncached,
  getVotesByChatId as getVotesByChatIdUncached,
  getMessageCountByUserId as getMessageCountByUserIdUncached,
} from "./queries";
import {
  getAgentSession as getAgentSessionUncached,
  getAgentSessionsByUserId as getAgentSessionsByUserIdUncached,
  getAgentMessages as getAgentMessagesUncached,
} from "./agent-queries";
import {
  cachedQuery,
  CacheKeys,
  CacheTTL,
  CacheInvalidation,
} from "./cache";

/**
 * Get a chat by ID with caching
 */
export async function getChatById({
  id,
}: {
  id: string;
}): Promise<Chat | null> {
  return cachedQuery(
    `${CacheKeys.CHAT}${id}`,
    () => getChatByIdUncached({ id }),
    CacheTTL.MEDIUM
  );
}

/**
 * Get chats by user ID with caching
 * Note: This caches the full result set for the given pagination params
 */
export async function getChatsByUserId(params: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}): Promise<{ chats: Chat[]; hasMore: boolean }> {
  const cacheKey = `${CacheKeys.USER_CHATS}${params.id}:${params.limit}:${params.startingAfter || ""}:${params.endingBefore || ""}`;

  return cachedQuery(
    cacheKey,
    () => getChatsByUserIdUncached(params),
    CacheTTL.SHORT // Short TTL for paginated results
  );
}

/**
 * Get messages by chat ID with caching
 */
export async function getMessagesByChatId({ id }: { id: string }) {
  return cachedQuery(
    `${CacheKeys.MESSAGES}${id}`,
    () => getMessagesByChatIdUncached({ id }),
    CacheTTL.SHORT // Messages change frequently during active chats
  );
}

/**
 * Get votes by chat ID with caching
 */
export async function getVotesByChatId({ id }: { id: string }) {
  return cachedQuery(
    `${CacheKeys.VOTES}${id}`,
    () => getVotesByChatIdUncached({ id }),
    CacheTTL.MEDIUM
  );
}

/**
 * Get message count by user ID with caching
 * This is frequently called for rate limiting
 */
export async function getMessageCountByUserId(params: {
  id: string;
  differenceInHours: number;
}): Promise<number> {
  const cacheKey = `${CacheKeys.MESSAGE_COUNT}${params.id}:${params.differenceInHours}h`;

  return cachedQuery(
    cacheKey,
    () => getMessageCountByUserIdUncached(params),
    CacheTTL.SHORT // Short TTL since this is for rate limiting
  );
}

/**
 * Get agent session by ID with caching
 */
export async function getAgentSession({
  id,
}: {
  id: string;
}): Promise<AgentSession | null> {
  return cachedQuery(
    `${CacheKeys.AGENT_SESSION}${id}`,
    () => getAgentSessionUncached({ id }),
    CacheTTL.SHORT // Agent sessions change frequently
  );
}

/**
 * Get agent sessions by user ID with caching
 */
export async function getAgentSessionsByUserId(params: {
  userId: string;
  limit?: number;
}): Promise<AgentSession[]> {
  const cacheKey = `${CacheKeys.USER_AGENT_SESSIONS}${params.userId}:${params.limit || 20}`;

  return cachedQuery(
    cacheKey,
    () => getAgentSessionsByUserIdUncached(params),
    CacheTTL.SHORT
  );
}

/**
 * Get agent messages with caching
 */
export async function getAgentMessages({ sessionId }: { sessionId: string }) {
  return cachedQuery(
    `${CacheKeys.AGENT_MESSAGES}${sessionId}`,
    () => getAgentMessagesUncached({ sessionId }),
    CacheTTL.SHORT
  );
}

/**
 * Export cache invalidation helpers for use in mutation operations
 */
export { CacheInvalidation };
