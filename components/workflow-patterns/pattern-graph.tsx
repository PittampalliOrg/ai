"use client";

/**
 * Pattern Graph Component
 *
 * Static visualization of workflow pattern structure using React Flow.
 */

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { WorkflowPatternId } from "@/lib/workflow-patterns/types";
import { cn } from "@/lib/utils";

interface PatternGraphProps {
  patternId: WorkflowPatternId;
  className?: string;
}

// Node styles
const nodeDefaults = {
  style: {
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "8px",
    padding: "10px 16px",
    color: "#e2e8f0",
    fontSize: "12px",
    fontWeight: 500,
  },
};

const startNodeStyle = {
  ...nodeDefaults.style,
  background: "#065f46",
  borderColor: "#10b981",
};

const endNodeStyle = {
  ...nodeDefaults.style,
  background: "#1e3a5f",
  borderColor: "#3b82f6",
};

const conditionNodeStyle = {
  ...nodeDefaults.style,
  background: "#713f12",
  borderColor: "#f59e0b",
};

// Graph definitions for each pattern
const PATTERN_GRAPHS: Record<
  WorkflowPatternId,
  { nodes: Node[]; edges: Edge[] }
> = {
  sequential: {
    nodes: [
      { id: "start", position: { x: 250, y: 0 }, data: { label: "Start" }, style: startNodeStyle },
      { id: "generate", position: { x: 250, y: 80 }, data: { label: "Generate Copy" }, ...nodeDefaults },
      { id: "evaluate", position: { x: 250, y: 160 }, data: { label: "Evaluate Quality" }, ...nodeDefaults },
      { id: "condition", position: { x: 250, y: 240 }, data: { label: "Quality >= 7?" }, style: conditionNodeStyle },
      { id: "improve", position: { x: 100, y: 320 }, data: { label: "Improve Copy" }, ...nodeDefaults },
      { id: "end", position: { x: 250, y: 400 }, data: { label: "Return Result" }, style: endNodeStyle },
    ],
    edges: [
      { id: "e1", source: "start", target: "generate", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e2", source: "generate", target: "evaluate", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e3", source: "evaluate", target: "condition", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e4", source: "condition", target: "end", label: "Yes", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e5", source: "condition", target: "improve", label: "No", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e6", source: "improve", target: "evaluate", markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: "#f59e0b" } },
    ],
  },
  parallel: {
    nodes: [
      { id: "start", position: { x: 250, y: 0 }, data: { label: "Start" }, style: startNodeStyle },
      { id: "fork", position: { x: 250, y: 80 }, data: { label: "Fork" }, style: conditionNodeStyle },
      { id: "security", position: { x: 50, y: 160 }, data: { label: "Security Review" }, ...nodeDefaults },
      { id: "performance", position: { x: 250, y: 160 }, data: { label: "Performance Review" }, ...nodeDefaults },
      { id: "maintainability", position: { x: 450, y: 160 }, data: { label: "Maintainability" }, ...nodeDefaults },
      { id: "join", position: { x: 250, y: 240 }, data: { label: "Join" }, style: conditionNodeStyle },
      { id: "summarize", position: { x: 250, y: 320 }, data: { label: "Summarize" }, ...nodeDefaults },
      { id: "end", position: { x: 250, y: 400 }, data: { label: "Return Result" }, style: endNodeStyle },
    ],
    edges: [
      { id: "e1", source: "start", target: "fork", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e2", source: "fork", target: "security", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e3", source: "fork", target: "performance", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e4", source: "fork", target: "maintainability", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e5", source: "security", target: "join", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e6", source: "performance", target: "join", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e7", source: "maintainability", target: "join", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e8", source: "join", target: "summarize", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e9", source: "summarize", target: "end", markerEnd: { type: MarkerType.ArrowClosed } },
    ],
  },
  routing: {
    nodes: [
      { id: "start", position: { x: 250, y: 0 }, data: { label: "Start" }, style: startNodeStyle },
      { id: "classify", position: { x: 250, y: 80 }, data: { label: "Classify Query" }, ...nodeDefaults },
      { id: "router", position: { x: 250, y: 160 }, data: { label: "Route" }, style: conditionNodeStyle },
      { id: "general", position: { x: 50, y: 240 }, data: { label: "General Handler" }, ...nodeDefaults },
      { id: "refund", position: { x: 175, y: 240 }, data: { label: "Refund Handler" }, ...nodeDefaults },
      { id: "technical", position: { x: 325, y: 240 }, data: { label: "Technical Handler" }, ...nodeDefaults },
      { id: "other", position: { x: 450, y: 240 }, data: { label: "Other Handlers" }, ...nodeDefaults },
      { id: "respond", position: { x: 250, y: 320 }, data: { label: "Generate Response" }, ...nodeDefaults },
      { id: "end", position: { x: 250, y: 400 }, data: { label: "Return Result" }, style: endNodeStyle },
    ],
    edges: [
      { id: "e1", source: "start", target: "classify", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e2", source: "classify", target: "router", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e3", source: "router", target: "general", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e4", source: "router", target: "refund", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e5", source: "router", target: "technical", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e6", source: "router", target: "other", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e7", source: "general", target: "respond", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e8", source: "refund", target: "respond", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e9", source: "technical", target: "respond", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e10", source: "other", target: "respond", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e11", source: "respond", target: "end", markerEnd: { type: MarkerType.ArrowClosed } },
    ],
  },
  orchestrator: {
    nodes: [
      { id: "start", position: { x: 250, y: 0 }, data: { label: "Start" }, style: startNodeStyle },
      { id: "plan", position: { x: 250, y: 80 }, data: { label: "Create Plan" }, ...nodeDefaults },
      { id: "orchestrator", position: { x: 250, y: 160 }, data: { label: "Orchestrator" }, style: conditionNodeStyle },
      { id: "worker1", position: { x: 100, y: 240 }, data: { label: "Worker: File 1" }, ...nodeDefaults },
      { id: "worker2", position: { x: 250, y: 240 }, data: { label: "Worker: File 2" }, ...nodeDefaults },
      { id: "workerN", position: { x: 400, y: 240 }, data: { label: "Worker: File N" }, ...nodeDefaults },
      { id: "collect", position: { x: 250, y: 320 }, data: { label: "Collect Results" }, ...nodeDefaults },
      { id: "end", position: { x: 250, y: 400 }, data: { label: "Return Result" }, style: endNodeStyle },
    ],
    edges: [
      { id: "e1", source: "start", target: "plan", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e2", source: "plan", target: "orchestrator", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e3", source: "orchestrator", target: "worker1", label: "delegate", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e4", source: "orchestrator", target: "worker2", label: "delegate", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e5", source: "orchestrator", target: "workerN", label: "delegate", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e6", source: "worker1", target: "collect", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e7", source: "worker2", target: "collect", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e8", source: "workerN", target: "collect", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e9", source: "collect", target: "end", markerEnd: { type: MarkerType.ArrowClosed } },
    ],
  },
  evaluator: {
    nodes: [
      { id: "start", position: { x: 250, y: 0 }, data: { label: "Start" }, style: startNodeStyle },
      { id: "translate", position: { x: 250, y: 80 }, data: { label: "Translate" }, ...nodeDefaults },
      { id: "evaluate", position: { x: 250, y: 160 }, data: { label: "Evaluate Quality" }, ...nodeDefaults },
      { id: "condition", position: { x: 250, y: 240 }, data: { label: "Score >= 8?" }, style: conditionNodeStyle },
      { id: "improve", position: { x: 100, y: 320 }, data: { label: "Improve Translation" }, ...nodeDefaults },
      { id: "maxCheck", position: { x: 100, y: 400 }, data: { label: "Max Iterations?" }, style: conditionNodeStyle },
      { id: "end", position: { x: 250, y: 480 }, data: { label: "Return Result" }, style: endNodeStyle },
    ],
    edges: [
      { id: "e1", source: "start", target: "translate", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e2", source: "translate", target: "evaluate", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e3", source: "evaluate", target: "condition", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e4", source: "condition", target: "end", label: "Yes", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e5", source: "condition", target: "improve", label: "No", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e6", source: "improve", target: "maxCheck", markerEnd: { type: MarkerType.ArrowClosed } },
      { id: "e7", source: "maxCheck", target: "evaluate", label: "No", markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: "#f59e0b" } },
      { id: "e8", source: "maxCheck", target: "end", label: "Yes", markerEnd: { type: MarkerType.ArrowClosed } },
    ],
  },
};

const defaultEdgeOptions = {
  type: "smoothstep",
  style: { stroke: "#64748b", strokeWidth: 2 },
};

export function PatternGraph({ patternId, className }: PatternGraphProps) {
  const { nodes, edges } = PATTERN_GRAPHS[patternId];

  return (
    <div className={cn("h-[400px] w-full rounded-lg border bg-[#0f172a]", className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{
          padding: 0.2,
          maxZoom: 1,
        }}
        minZoom={0.5}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          className="!bg-[#0f172a]"
        />
      </ReactFlow>
    </div>
  );
}
