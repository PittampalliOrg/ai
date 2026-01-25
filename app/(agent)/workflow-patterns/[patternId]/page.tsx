"use client";

/**
 * Workflow Pattern Detail Page
 *
 * Shows pattern description, static workflow graph, input form, and execution view.
 */

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PlatformLayout } from "@/components/platform";
import {
  PatternRunner,
  PatternGraph,
  PatternExecutionView,
} from "@/components/workflow-patterns";
import { PATTERN_METADATA, type WorkflowPatternId } from "@/lib/workflow-patterns/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ patternId: string }>;
}

// Complexity badge variants
const COMPLEXITY_VARIANTS = {
  beginner: "bg-green-500/10 text-green-500 border-green-500/20",
  intermediate: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  advanced: "bg-red-500/10 text-red-500 border-red-500/20",
};

export default function WorkflowPatternPage({ params }: PageProps) {
  const { patternId } = use(params);
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);

  // Validate pattern ID
  if (!PATTERN_METADATA[patternId as WorkflowPatternId]) {
    notFound();
  }

  const pattern = PATTERN_METADATA[patternId as WorkflowPatternId];

  const handleStart = (instanceId: string) => {
    setActiveInstanceId(instanceId);
  };

  return (
    <PlatformLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-6 py-4 border-b">
          <div className="flex items-center gap-4 mb-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/workflow-patterns">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Patterns
              </Link>
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{pattern.name}</h1>
            <Badge
              variant="outline"
              className={cn(
                "text-xs capitalize",
                COMPLEXITY_VARIANTS[pattern.complexity]
              )}
            >
              {pattern.complexity}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">{pattern.description}</p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left column: Pattern info and graph */}
            <div className="space-y-6">
              {/* Use cases */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Use Cases</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {pattern.useCases.map((useCase, index) => (
                      <li
                        key={index}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <span className="text-primary">•</span>
                        {useCase}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* Workflow graph */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Workflow Structure</CardTitle>
                  <CardDescription>
                    Visual representation of the workflow pattern
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PatternGraph patternId={patternId as WorkflowPatternId} />
                </CardContent>
              </Card>
            </div>

            {/* Right column: Runner and execution */}
            <div className="space-y-6">
              {/* Input form */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Run Workflow</CardTitle>
                  <CardDescription>
                    Provide input to execute this workflow pattern
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PatternRunner
                    patternId={patternId as WorkflowPatternId}
                    onStart={handleStart}
                  />
                </CardContent>
              </Card>

              {/* Execution view */}
              {activeInstanceId && (
                <PatternExecutionView instanceId={activeInstanceId} />
              )}
            </div>
          </div>
        </div>
      </div>
    </PlatformLayout>
  );
}
