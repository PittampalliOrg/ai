"use client";

import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  type Edge,
  BackgroundVariant,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import {
  Maximize2,
  Minimize2,
  Layers,
  ZoomIn,
  ZoomOut,
  Focus,
} from "lucide-react";
import { ServiceNode } from "./service-node";

interface CallGraphCanvasProps {
  initialNodes: Node[];
  initialEdges: Edge[];
  isLoading?: boolean;
}

const nodeTypes = {
  serviceNode: ServiceNode,
};

export function CallGraphCanvas({
  initialNodes,
  initialEdges,
  isLoading,
}: CallGraphCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds));
    },
    [setEdges]
  );

  // Update nodes and edges when props change
  useMemo(() => {
    if (initialNodes.length > 0) {
      setNodes(initialNodes);
    }
    if (initialEdges.length > 0) {
      setEdges(initialEdges);
    }
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#1a1f2e]">
        <div className="text-gray-400">Loading call graph...</div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[#1a1f2e]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        className="bg-[#1a1f2e]"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#374151"
        />
        <Controls
          showInteractive={false}
          className="!bg-[#1e2433] !border-gray-700 !shadow-lg [&_button]:!bg-[#1e2433] [&_button]:!border-gray-600 [&_button]:hover:!bg-[#252c3d] [&_button_svg]:!fill-gray-400"
        />
        {/* Legend Panel */}
        <Panel position="top-right" className="!m-4">
          <div className="bg-[#1e2433] border border-gray-700 rounded-lg p-3 shadow-lg">
            <div className="text-xs text-gray-400 mb-2">Legend</div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded border border-cyan-500/50 bg-[#1e2433]" />
                <span className="text-xs text-gray-300">Service</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded border border-purple-500/50 bg-[#252c3d]" />
                <span className="text-xs text-gray-300">Component</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-0.5 bg-cyan-500" />
                <span className="text-xs text-gray-300">API Call</span>
              </div>
            </div>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
