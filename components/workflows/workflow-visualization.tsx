"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  Background,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { WorkflowNode } from "./workflow-node";
import {
  mapWorkflowToGraph,
  calculateWorkflowProgress,
} from "@/lib/workflow-graph-mapper";
import type { WorkflowEntry } from "@/lib/types/workflow";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

// ============================================================================
// Node Type Registration
// ============================================================================

const nodeTypes = {
  workflow: WorkflowNode,
};

// ============================================================================
// Inner Component (needs ReactFlowProvider context)
// ============================================================================

interface WorkflowVisualizationInnerProps {
  workflow: WorkflowEntry;
  className?: string;
}

function WorkflowVisualizationInner({
  workflow,
  className,
}: WorkflowVisualizationInnerProps) {
  const { fitView } = useReactFlow();

  // Map workflow to graph structure
  const { nodes, edges: rawEdges } = useMemo(
    () => mapWorkflowToGraph(workflow),
    [workflow]
  );

  // Add styling to edges based on type
  const edges = useMemo(
    () =>
      rawEdges.map((edge) => ({
        ...edge,
        type: "smoothstep",
        style:
          edge.type === "animated"
            ? { stroke: "#22c55e", strokeWidth: 2 }
            : { stroke: "#6b7280", strokeWidth: 2, strokeDasharray: "6 4" },
        animated: edge.type === "animated",
      })),
    [rawEdges]
  );

  // Calculate progress
  const progress = useMemo(
    () => calculateWorkflowProgress(workflow),
    [workflow]
  );

  return (
    <div className={cn("relative workflow-visualization", className)}>
      {/* Progress indicator */}
      <div className="absolute top-2 left-2 right-2 z-10 flex items-center gap-3 bg-background/90 backdrop-blur-sm rounded-md px-3 py-2 border">
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          Progress
        </span>
        <Progress value={progress} className="h-2 flex-1" />
        <span className="text-sm font-medium">{progress}%</span>
      </div>

      {/* ReactFlow canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        onInit={() => fitView({ padding: 0.15 })}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          type: "smoothstep",
        }}
        minZoom={0.3}
        maxZoom={1.5}
      >
        <Background color="hsl(var(--muted-foreground))" gap={16} size={1} />
        <Controls
          showInteractive={false}
          className="!bg-background !border !border-border !rounded-md !shadow-sm [&>button]:!bg-background [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-muted"
        />
      </ReactFlow>

      {/* Styles for the visualization */}
      <style jsx global>{`
        .workflow-visualization .react-flow__edge-path {
          stroke-linecap: round;
        }
        .workflow-visualization .react-flow__handle {
          width: 10px;
          height: 10px;
          background: hsl(var(--primary));
          border: 2px solid hsl(var(--background));
        }
        .workflow-visualization .react-flow__controls button {
          width: 28px;
          height: 28px;
        }
        .workflow-visualization .react-flow__controls button svg {
          max-width: 14px;
          max-height: 14px;
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// Main Component with Provider
// ============================================================================

interface WorkflowVisualizationProps {
  workflow: WorkflowEntry;
  className?: string;
  height?: number | string;
}

/**
 * Workflow visualization component
 *
 * Displays the workflow plan as a visual graph with:
 * - Start node
 * - Plan task nodes with status-based styling
 * - Animated edges for completed/in-progress tasks
 * - Dashed edges for pending tasks
 * - Progress indicator
 * - Zoom controls
 */
export function WorkflowVisualization({
  workflow,
  className,
  height = 500,
}: WorkflowVisualizationProps) {
  // Don't render if no plan tasks
  if (!workflow.plan?.tasks || workflow.plan.tasks.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted/50 rounded-lg",
          className
        )}
        style={{ height }}
      >
        <p className="text-sm text-muted-foreground">
          No plan tasks to visualize
        </p>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <div
        style={{ height }}
        className={cn("rounded-lg overflow-hidden border bg-muted/30", className)}
      >
        <WorkflowVisualizationInner
          workflow={workflow}
          className="h-full w-full"
        />
      </div>
    </ReactFlowProvider>
  );
}
