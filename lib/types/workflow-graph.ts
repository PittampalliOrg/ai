/**
 * Workflow Graph Visualization Types
 *
 * Type definitions for mapping WorkflowEntry to @xyflow/react graph structures.
 */

import type { Node, Edge } from "@xyflow/react";
import type { PlanTaskStatus } from "./workflow";

// ============================================================================
// Node Types
// ============================================================================

/**
 * Data payload for workflow graph nodes
 * Note: Index signature required for React Flow Node<Record<string, unknown>> compatibility
 */
export interface WorkflowNodeData extends Record<string, unknown> {
  label: string;
  description: string;
  status: PlanTaskStatus | "start";
  handles: { target: boolean; source: boolean };
  completedAt?: string;
  stepNumber?: number;
}

/**
 * Workflow node type for @xyflow/react
 */
export type WorkflowNode = Node<WorkflowNodeData, "workflow">;

// ============================================================================
// Edge Types
// ============================================================================

/**
 * Edge types for workflow visualization
 * - animated: Solid line with flowing animation (completed/in_progress)
 * - temporary: Dashed line (not_started/blocked)
 */
export type WorkflowEdgeType = "animated" | "temporary";

/**
 * Workflow edge type for @xyflow/react
 */
export type WorkflowEdge = Edge & { type: WorkflowEdgeType };

// ============================================================================
// Graph Types
// ============================================================================

/**
 * Complete workflow graph structure
 */
export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// ============================================================================
// Layout Constants
// ============================================================================

/**
 * Layout configuration for snake pattern
 */
export const LAYOUT_CONFIG = {
  /** Number of nodes per row before wrapping */
  NODES_PER_ROW: 4,
  /** Horizontal spacing between nodes */
  NODE_WIDTH: 280,
  /** Horizontal gap between nodes */
  NODE_GAP_X: 100,
  /** Vertical gap between rows */
  NODE_GAP_Y: 120,
  /** Starting X position */
  START_X: 50,
  /** Starting Y position */
  START_Y: 50,
} as const;
