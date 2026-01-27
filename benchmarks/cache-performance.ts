/**
 * Cache Performance Benchmark Suite
 *
 * Measures the performance impact of Redis caching on database queries
 *
 * Run with: npx tsx benchmarks/cache-performance.ts
 */

import { performance } from "node:perf_hooks";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, desc } from "drizzle-orm";
import { chat, user } from "../lib/db/schema";
import {
  cachedQuery,
  CacheKeys,
  CacheTTL,
  cacheHealthCheck,
  cacheDel,
} from "../lib/db/cache";

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

interface CacheBenchmarkResult {
  name: string;
  uncachedAvg: number;
  cachedAvg: number;
  improvement: number;
  speedup: number;
}

/**
 * Measure query time
 */
async function measureQuery(queryFn: () => Promise<unknown>): Promise<number> {
  const start = performance.now();
  await queryFn();
  const end = performance.now();
  return end - start;
}

/**
 * Benchmark cached vs uncached queries
 */
async function benchmarkCaching(
  name: string,
  queryFn: () => Promise<unknown>,
  cacheKey: string,
  iterations: number = 50
): Promise<CacheBenchmarkResult> {
  // Clear cache before starting
  await cacheDel(cacheKey);

  // Benchmark uncached queries
  const uncachedTimes: number[] = [];
  for (let i = 0; i < iterations; i++) {
    await cacheDel(cacheKey); // Ensure cache miss
    const time = await measureQuery(() =>
      cachedQuery(cacheKey, queryFn, CacheTTL.LONG)
    );
    uncachedTimes.push(time);
  }

  // Benchmark cached queries (cache hit)
  const cachedTimes: number[] = [];
  // Prime the cache
  await cachedQuery(cacheKey, queryFn, CacheTTL.LONG);

  for (let i = 0; i < iterations; i++) {
    const time = await measureQuery(() =>
      cachedQuery(cacheKey, queryFn, CacheTTL.LONG)
    );
    cachedTimes.push(time);
  }

  const uncachedAvg =
    uncachedTimes.reduce((a, b) => a + b, 0) / uncachedTimes.length;
  const cachedAvg = cachedTimes.reduce((a, b) => a + b, 0) / cachedTimes.length;
  const improvement = ((uncachedAvg - cachedAvg) / uncachedAvg) * 100;
  const speedup = uncachedAvg / cachedAvg;

  return {
    name,
    uncachedAvg,
    cachedAvg,
    improvement,
    speedup,
  };
}

/**
 * Format cache benchmark results
 */
function formatCacheResult(result: CacheBenchmarkResult): string {
  return [
    `\n${result.name}`,
    `  Uncached (DB): ${result.uncachedAvg.toFixed(2)}ms`,
    `  Cached (Redis): ${result.cachedAvg.toFixed(2)}ms`,
    `  Improvement: ${result.improvement.toFixed(2)}%`,
    `  Speedup: ${result.speedup.toFixed(2)}x faster`,
    `  Time Saved: ${(result.uncachedAvg - result.cachedAvg).toFixed(2)}ms per query`,
  ].join("\n");
}

async function main() {
  console.log("🚀 Cache Performance Benchmark Suite\n");
  console.log("=".repeat(60));

  // Check if Redis is available
  const redisHealthy = await cacheHealthCheck();
  if (!redisHealthy) {
    console.log("\n⚠️  Redis is not available or not configured.");
    console.log("   Set REDIS_URL environment variable to enable caching.");
    console.log("   Skipping cache benchmarks.\n");
    process.exit(0);
  }

  console.log("✅ Redis connection healthy\n");

  // Get sample data
  const sampleUsers = await db.select().from(user).limit(1);
  if (sampleUsers.length === 0) {
    console.log("\n⚠️  No users found in database. Skipping benchmarks.");
    process.exit(0);
  }

  const userId = sampleUsers[0].id;

  console.log("ℹ️  Test Configuration:");
  console.log(`  User ID: ${userId}`);
  console.log(`  Iterations per test: 50 (uncached) + 50 (cached)`);
  console.log();

  const results: CacheBenchmarkResult[] = [];

  // ============================================================================
  // Benchmark 1: Get Chats by User ID
  // ============================================================================
  console.log("=".repeat(60));
  console.log("Test 1: Get Chats by User ID (Cached vs Uncached)");
  console.log("=".repeat(60));

  const chatsResult = await benchmarkCaching(
    "Get Chats by User ID",
    async () => {
      return await db
        .select()
        .from(chat)
        .where(eq(chat.userId, userId))
        .orderBy(desc(chat.createdAt))
        .limit(10);
    },
    `${CacheKeys.USER_CHATS}${userId}:benchmark`,
    50
  );

  results.push(chatsResult);
  console.log(formatCacheResult(chatsResult));

  // ============================================================================
  // Benchmark 2: Get Single Chat (typical scenario)
  // ============================================================================
  const sampleChats = await db.select().from(chat).limit(1);
  if (sampleChats.length > 0) {
    const chatId = sampleChats[0].id;

    console.log("\n" + "=".repeat(60));
    console.log("Test 2: Get Single Chat by ID (Cached vs Uncached)");
    console.log("=".repeat(60));

    const chatResult = await benchmarkCaching(
      "Get Chat by ID",
      async () => {
        return await db.select().from(chat).where(eq(chat.id, chatId)).limit(1);
      },
      `${CacheKeys.CHAT}${chatId}:benchmark`,
      50
    );

    results.push(chatResult);
    console.log(formatCacheResult(chatResult));
  }

  // ============================================================================
  // Summary
  // ============================================================================
  console.log("\n" + "=".repeat(60));
  console.log("📊 CACHE BENCHMARK SUMMARY");
  console.log("=".repeat(60));

  const avgImprovement =
    results.reduce((sum, r) => sum + r.improvement, 0) / results.length;
  const avgSpeedup =
    results.reduce((sum, r) => sum + r.speedup, 0) / results.length;
  const avgTimeSaved =
    results.reduce((sum, r) => sum + (r.uncachedAvg - r.cachedAvg), 0) /
    results.length;

  console.log(`\nOverall Cache Performance:`);
  console.log(`  Tests Run: ${results.length}`);
  console.log(`  Average Improvement: ${avgImprovement.toFixed(2)}%`);
  console.log(`  Average Speedup: ${avgSpeedup.toFixed(2)}x`);
  console.log(`  Average Time Saved: ${avgTimeSaved.toFixed(2)}ms per query`);

  console.log(`\n✅ Cache Benchmark Complete!`);
  console.log(`\n💡 Analysis:`);
  if (avgImprovement > 80) {
    console.log(`  🎉 Excellent! Cache is providing ${avgImprovement.toFixed(0)}% performance boost`);
  } else if (avgImprovement > 50) {
    console.log(`  ✅ Good! Cache is providing ${avgImprovement.toFixed(0)}% performance boost`);
  } else if (avgImprovement > 0) {
    console.log(`  ⚠️  Moderate improvement (${avgImprovement.toFixed(0)}%). Consider:`);
    console.log(`     - Checking Redis latency`);
    console.log(`     - Verifying network connection to Redis`);
  } else {
    console.log(`  ❌ Cache not providing improvement. Check Redis configuration.`);
  }

  // Cleanup
  await client.end();
}

main().catch((error) => {
  console.error("❌ Cache benchmark failed:", error);
  process.exit(1);
});
