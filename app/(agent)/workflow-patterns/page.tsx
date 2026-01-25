"use client";

/**
 * Workflow Patterns Page
 *
 * Main page displaying all available workflow patterns as selectable cards.
 */

import { PlatformLayout } from "@/components/platform";
import { PatternCard } from "@/components/workflow-patterns";
import { PATTERN_METADATA } from "@/lib/workflow-patterns/types";

export default function WorkflowPatternsPage() {
  const patterns = Object.values(PATTERN_METADATA);

  return (
    <PlatformLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-6 py-4 border-b">
          <h1 className="text-2xl font-semibold">Workflow Patterns</h1>
          <p className="text-muted-foreground mt-1">
            Explore common agentic workflow patterns powered by Dapr durable workflows.
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {patterns.map((pattern) => (
              <PatternCard key={pattern.id} pattern={pattern} />
            ))}
          </div>

          {/* Info section */}
          <div className="mt-8 p-4 rounded-lg bg-muted/50 border">
            <h2 className="font-medium mb-2">About Workflow Patterns</h2>
            <p className="text-sm text-muted-foreground mb-3">
              These patterns demonstrate common approaches for building reliable,
              observable AI workflows using the Dapr Workflow engine. Each pattern
              shows a different way to orchestrate LLM calls with real AI SDK integration.
            </p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>
                <strong>Sequential:</strong> Steps execute one after another, useful
                for pipelines with quality gates.
              </li>
              <li>
                <strong>Parallel:</strong> Multiple independent tasks run concurrently,
                useful for aggregating multiple perspectives.
              </li>
              <li>
                <strong>Routing:</strong> Classify input and route to specialized
                handlers with different models/prompts.
              </li>
              <li>
                <strong>Orchestrator/Worker:</strong> Central coordinator delegates
                work to specialized workers.
              </li>
              <li>
                <strong>Evaluator Loop:</strong> Iteratively improve output until
                quality threshold is met.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </PlatformLayout>
  );
}
