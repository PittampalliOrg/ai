/**
 * Database Performance Benchmark Suite
 *
 * Measures query performance improvements from:
 * - Database indexes
 * - Query optimizations
 * - Redis caching
 *
 * Run with: npx tsx benchmarks/db-performance.ts
 */

import { performance } from "node:perf_hooks";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, gte, desc, count } from "drizzle-orm";
import { chat, message, agentSession, agentMessage, user } from "../lib/db/schema";

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  queriesPerSecond: number;
}

/**
 * Run a benchmark test
 */
async function benchmark(
  name: string,
  queryFn: () => Promise<unknown>,
  iterations: number = 100
): Promise<BenchmarkResult> {
  const times: number[] = [];

  // Warmup
  await queryFn();

  // Run benchmark
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await queryFn();
    const end = performance.now();
    times.push(end - start);
  }

  const totalTime = times.reduce((a, b) => a + b, 0);
  const avgTime = totalTime / iterations;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const queriesPerSecond = 1000 / avgTime;

  return {
    name,
    iterations,
    totalTime,
    avgTime,
    minTime,
    maxTime,
    queriesPerSecond,
  };
}

/**
 * Format benchmark results
 */
function formatResult(result: BenchmarkResult): string {
  return [
    `\n${result.name}`,
    `  Iterations: ${result.iterations}`,
    `  Total Time: ${result.totalTime.toFixed(2)}ms`,
    `  Average: ${result.avgTime.toFixed(2)}ms`,
    `  Min: ${result.minTime.toFixed(2)}ms`,
    `  Max: ${result.maxTime.toFixed(2)}ms`,
    `  Throughput: ${result.queriesPerSecond.toFixed(2)} queries/sec`,
  ].join("\n");
}

/**
 * Compare two benchmark results
 */
function compareResults(
  baseline: BenchmarkResult,
  optimized: BenchmarkResult
): string {
  const improvement = ((baseline.avgTime - optimized.avgTime) / baseline.avgTime) * 100;
  const throughputImprovement =
    ((optimized.queriesPerSecond - baseline.queriesPerSecond) /
      baseline.queriesPerSecond) *
    100;

  return [
    `\n📊 Performance Comparison:`,
    `  Speed Improvement: ${improvement > 0 ? "+" : ""}${improvement.toFixed(2)}%`,
    `  Throughput Improvement: ${throughputImprovement > 0 ? "+" : ""}${throughputImprovement.toFixed(2)}%`,
    `  Absolute Time Saved: ${(baseline.avgTime - optimized.avgTime).toFixed(2)}ms per query`,
  ].join("\n");
}

async function main() {
  console.log("🚀 Database Performance Benchmark Suite\n");
  console.log("="
.repeat(60));

  // Get sample data for testing
  const sampleUsers = await db.select().from(user).limit(1);
  const sampleChats = await db.select().from(chat).limit(1);
  const sampleAgentSessions = await db.select().from(agentSession).limit(1);

  if (sampleUsers.length === 0) {
    console.log("\n⚠️  No users found in database. Skipping benchmarks.");
    process.exit(0);
  }

  const userId = sampleUsers[0].id;
  const chatId = sampleChats.length > 0 ? sampleChats[0].id : null;
  const sessionId =
    sampleAgentSessions.length > 0 ? sampleAgentSessions[0].id : null;

  console.log("\nℹ️  Test Configuration:");
  console.log(`  User ID: ${userId}`);
  console.log(`  Chat ID: ${chatId || "N/A"}`);
  console.log(`  Session ID: ${sessionId || "N/A"}`);
  console.log(`  Iterations per test: 100`);

  const results: BenchmarkResult[] = [];

  // ============================================================================
  // Benchmark 1: Get Chats by User ID
  // ============================================================================
  console.log("\n" + "=".repeat(60));
  console.log("Test 1: Get Chats by User ID (with ORDER BY)");
  console.log("=".repeat(60));

  const getChatsByUserIdResult = await benchmark(
    "Get Chats by User ID",
    async () => {
      await db
        .select()
        .from(chat)
        .where(eq(chat.userId, userId))
        .orderBy(desc(chat.createdAt))
        .limit(10);
    },
    100
  );

  results.push(getChatsByUserIdResult);
  console.log(formatResult(getChatsByUserIdResult));

  // ============================================================================
  // Benchmark 2: Get Messages by Chat ID
  // ============================================================================
  if (chatId) {
    console.log("\n" + "=".repeat(60));
    console.log("Test 2: Get Messages by Chat ID (with ORDER BY)");
    console.log("=".repeat(60));

    const getMessagesByChatIdResult = await benchmark(
      "Get Messages by Chat ID",
      async () => {
        await db
          .select()
          .from(message)
          .where(eq(message.chatId, chatId))
          .orderBy(message.createdAt);
      },
      100
    );

    results.push(getMessagesByChatIdResult);
    console.log(formatResult(getMessagesByChatIdResult));
  }

  // ============================================================================
  // Benchmark 3: Get Message Count (JOIN query)
  // ============================================================================
  console.log("\n" + "=".repeat(60));
  console.log("Test 3: Get Message Count by User (JOIN query)");
  console.log("=".repeat(60));

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const getMessageCountResult = await benchmark(
    "Get Message Count by User",
    async () => {
      await db
        .select({ count: count(message.id) })
        .from(message)
        .innerJoin(chat, eq(message.chatId, chat.id))
        .where(
          and(
            eq(chat.userId, userId),
            gte(message.createdAt, twentyFourHoursAgo),
            eq(message.role, "user")
          )
        )
        .execute();
    },
    100
  );

  results.push(getMessageCountResult);
  console.log(formatResult(getMessageCountResult));

  // ============================================================================
  // Benchmark 4: Get Agent Sessions by User ID
  // ============================================================================
  console.log("\n" + "=".repeat(60));
  console.log("Test 4: Get Agent Sessions by User ID");
  console.log("=".repeat(60));

  const getAgentSessionsResult = await benchmark(
    "Get Agent Sessions by User ID",
    async () => {
      await db
        .select()
        .from(agentSession)
        .where(eq(agentSession.userId, userId))
        .orderBy(desc(agentSession.createdAt))
        .limit(20);
    },
    100
  );

  results.push(getAgentSessionsResult);
  console.log(formatResult(getAgentSessionsResult));

  // ============================================================================
  // Benchmark 5: Get Agent Messages by Session ID
  // ============================================================================
  if (sessionId) {
    console.log("\n" + "=".repeat(60));
    console.log("Test 5: Get Agent Messages by Session ID");
    console.log("=".repeat(60));

    const getAgentMessagesResult = await benchmark(
      "Get Agent Messages by Session ID",
      async () => {
        await db
          .select()
          .from(agentMessage)
          .where(eq(agentMessage.sessionId, sessionId))
          .orderBy(agentMessage.createdAt);
      },
      100
    );

    results.push(getAgentMessagesResult);
    console.log(formatResult(getAgentMessagesResult));
  }

  // ============================================================================
  // Summary
  // ============================================================================
  console.log("\n" + "=".repeat(60));
  console.log("📊 BENCHMARK SUMMARY");
  console.log("=".repeat(60));

  const overallAvg =
    results.reduce((sum, r) => sum + r.avgTime, 0) / results.length;
  const overallThroughput =
    results.reduce((sum, r) => sum + r.queriesPerSecond, 0) / results.length;

  console.log(`\nOverall Statistics:`);
  console.log(`  Tests Run: ${results.length}`);
  console.log(`  Average Query Time: ${overallAvg.toFixed(2)}ms`);
  console.log(`  Average Throughput: ${overallThroughput.toFixed(2)} queries/sec`);

  console.log(`\n✅ Benchmark Complete!`);
  console.log(`\n💡 Tips:`);
  console.log(
    `  - Run this before and after applying indexes to measure improvement`
  );
  console.log(
    `  - Query times < 10ms are excellent for indexed queries`
  );
  console.log(
    `  - Query times > 100ms indicate missing indexes or inefficient queries`
  );

  // Cleanup
  await client.end();
}

main().catch((error) => {
  console.error("❌ Benchmark failed:", error);
  process.exit(1);
});
