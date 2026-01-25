/**
 * Execution Graph Types
 *
 * Type definitions for transforming execution events to React Flow graph format.
 */

import type { Node, Edge, BuiltInNode } from "@xyflow/react";
import type { DaprExecutionEventType, DaprExecutionEventMetadata } from "./workflow-ui";

// ============================================================================
// Node Status Types
// ============================================================================

/**
 * Status for execution graph nodes
 */
export type ExecutionNodeStatus =
  | "running"
  | "completed"
  | "failed"
  | "scheduled"
  | "pending";

// ============================================================================
// Node Data Types
// ============================================================================

/**
 * Data payload for execution flow nodes
 */
export interface ExecutionNodeData extends Record<string, unknown> {
  label: string;
  eventType: DaprExecutionEventType;
  timestamp: string;
  status: ExecutionNodeStatus;
  eventId: number | null;
  name: string | null;
  duration?: string;
  input?: unknown;
  output?: unknown;
  metadata?: DaprExecutionEventMetadata;
  handles: {
    target: boolean;
    source: boolean;
  };
}

// ============================================================================
// React Flow Types
// ============================================================================

/**
 * Execution flow node type (React Flow Node with custom data)
 */
export type ExecutionFlowNode = Node<ExecutionNodeData, "executionEvent">;

/**
 * Execution flow edge type
 */
export type ExecutionFlowEdge = Edge<{ animated?: boolean; status?: ExecutionNodeStatus }>;

/**
 * All node types for React Flow
 */
export type AppNode = ExecutionFlowNode | BuiltInNode;

// ============================================================================
// Graph Result Type
// ============================================================================

/**
 * Result of mapping execution events to a graph
 */
export interface ExecutionGraph {
  nodes: ExecutionFlowNode[];
  edges: ExecutionFlowEdge[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get node status color class
 */
export function getNodeStatusColor(status: ExecutionNodeStatus): string {
  switch (status) {
    case "running":
      return "#eab308"; // yellow-500
    case "completed":
      return "#22c55e"; // green-500
    case "failed":
      return "#ef4444"; // red-500
    case "scheduled":
      return "#8b5cf6"; // purple-500
    case "pending":
    default:
      return "#6b7280"; // gray-500
  }
}

/**
 * Get node status background color (lighter)
 */
export function getNodeStatusBgColor(status: ExecutionNodeStatus): string {
  switch (status) {
    case "running":
      return "#fef9c3"; // yellow-100
    case "completed":
      return "#dcfce7"; // green-100
    case "failed":
      return "#fee2e2"; // red-100
    case "scheduled":
      return "#ede9fe"; // purple-100
    case "pending":
    default:
      return "#f3f4f6"; // gray-100
  }
}

/**
 * Get node status border color
 */
export function getNodeStatusBorderColor(status: ExecutionNodeStatus): string {
  switch (status) {
    case "running":
      return "#facc15"; // yellow-400
    case "completed":
      return "#4ade80"; // green-400
    case "failed":
      return "#f87171"; // red-400
    case "scheduled":
      return "#a78bfa"; // purple-400
    case "pending":
    default:
      return "#9ca3af"; // gray-400
  }
}
