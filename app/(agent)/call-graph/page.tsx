"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { CallGraphCanvas } from "@/components/call-graph/call-graph-canvas";
import { PlatformLayout } from "@/components/platform";
import { useCallGraph } from "@/hooks/use-call-graph";

export default function CallGraphPage() {
  const { nodes, edges, isLoading, refresh } = useCallGraph();

  return (
    <PlatformLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h1 className="text-xl font-semibold">Call Graph</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Visualize service-to-service communication
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refresh()}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Canvas */}
        <div className="flex-1">
          <CallGraphCanvas
            initialNodes={nodes}
            initialEdges={edges}
            isLoading={isLoading}
          />
        </div>
      </div>
    </PlatformLayout>
  );
}
