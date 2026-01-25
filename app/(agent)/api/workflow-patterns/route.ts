/**
 * Workflow Patterns API
 *
 * GET /api/workflow-patterns
 * Returns metadata about all available workflow patterns.
 */

import { NextResponse } from "next/server";
import { PATTERN_METADATA, type WorkflowPatternId } from "@/lib/workflow-patterns/types";

export async function GET(): Promise<Response> {
  try {
    const patterns = Object.values(PATTERN_METADATA).map((pattern) => ({
      id: pattern.id,
      name: pattern.name,
      description: pattern.description,
      complexity: pattern.complexity,
      icon: pattern.icon,
      useCases: pattern.useCases,
    }));

    return NextResponse.json({
      patterns,
      count: patterns.length,
    });
  } catch (error) {
    console.error("[Workflow Patterns API] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
