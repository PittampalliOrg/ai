"use client";

import { useMemo } from "react";
import useSWR from "swr";
import type { Node, Edge } from "@xyflow/react";
import type { CallGraphData, CallGraphNode, CallGraphEdge } from "@/lib/types/diagrid-services";

// Mock data for development
const mockCallGraphData: CallGraphData = {
  nodes: [
    { id: "workflow-orchestrator", type: "service", name: "workflow-orchestrator", appId: "workflow-orchestrator" },
    { id: "payment-service", type: "service", name: "payment-service", appId: "payment-service" },
    { id: "inventory-service", type: "service", name: "inventory-service", appId: "inventory-service" },
    { id: "notification-service", type: "service", name: "notification-service", appId: "notification-service" },
    { id: "statestore", type: "component", name: "statestore", componentType: "state.redis" },
    { id: "pubsub", type: "component", name: "pubsub", componentType: "pubsub.redis" },
  ],
  edges: [
    { id: "e1", source: "workflow-orchestrator", target: "statestore", label: "SaveState", callCount: 150 },
    { id: "e2", source: "workflow-orchestrator", target: "payment-service", label: "InvokeService", callCount: 45 },
    { id: "e3", source: "workflow-orchestrator", target: "inventory-service", label: "InvokeService", callCount: 67 },
    { id: "e4", source: "payment-service", target: "pubsub", label: "PublishEvent", callCount: 30 },
    { id: "e5", source: "inventory-service", target: "statestore", label: "GetState", callCount: 89 },
    { id: "e6", source: "pubsub", target: "notification-service", label: "Subscribe", callCount: 30 },
  ],
};

async function fetchCallGraph(): Promise<CallGraphData> {
  // TODO: Replace with actual Dapr API call
  // This would integrate with tracing backend or Dapr metadata
  await new Promise((resolve) => setTimeout(resolve, 500));
  return mockCallGraphData;
}

// Convert CallGraphData to React Flow nodes and edges
function transformToReactFlow(data: CallGraphData): { nodes: Node[]; edges: Edge[] } {
  // Layout nodes in a grid pattern
  const serviceNodes = data.nodes.filter((n) => n.type === "service");
  const componentNodes = data.nodes.filter((n) => n.type === "component");

  const nodes: Node[] = [
    ...serviceNodes.map((node, index) => ({
      id: node.id,
      type: "serviceNode",
      position: { x: 100 + (index % 2) * 300, y: 100 + Math.floor(index / 2) * 150 },
      data: {
        label: node.name,
        type: node.type,
        appId: node.appId,
        componentType: node.componentType,
      },
    })),
    ...componentNodes.map((node, index) => ({
      id: node.id,
      type: "serviceNode",
      position: { x: 450 + (index % 2) * 250, y: 100 + Math.floor(index / 2) * 150 },
      data: {
        label: node.name,
        type: node.type,
        appId: node.appId,
        componentType: node.componentType,
      },
    })),
  ];

  const edges: Edge[] = data.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    animated: true,
    style: { stroke: "#2dd4bf", strokeWidth: 2 },
    labelStyle: { fill: "#9ca3af", fontSize: 10 },
    labelBgStyle: { fill: "#1e2433", fillOpacity: 0.8 },
  }));

  return { nodes, edges };
}

export function useCallGraph() {
  const { data, error, isLoading, mutate } = useSWR(
    "call-graph",
    fetchCallGraph,
    {
      revalidateOnFocus: false,
      dedupingInterval: 10000,
    }
  );

  const { nodes, edges } = useMemo(() => {
    if (!data) return { nodes: [], edges: [] };
    return transformToReactFlow(data);
  }, [data]);

  return {
    nodes,
    edges,
    isLoading,
    error,
    refresh: mutate,
    rawData: data,
  };
}
