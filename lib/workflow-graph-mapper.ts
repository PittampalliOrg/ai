/**
 * Workflow Graph Mapper
 *
 * Maps WorkflowEntry data to @xyflow/react graph structures
 * with a grid layout pattern.
 */

import type { WorkflowEntry, PlanTask, PlanTaskStatus } from "./types/workflow";
import type {
  WorkflowGraph,
  WorkflowNode,
  WorkflowEdge,
  WorkflowEdgeType,
} from "./types/workflow-graph";
import { LAYOUT_CONFIG } from "./types/workflow-graph";

/**
 * Calculate node position in a simple grid layout
 * All rows go left-to-right for consistent edge routing
 */
function calculateNodePosition(index: number): { x: number; y: number } {
  const { NODES_PER_ROW, NODE_WIDTH, NODE_GAP_X, NODE_GAP_Y, START_X, START_Y } =
    LAYOUT_CONFIG;

  const row = Math.floor(index / NODES_PER_ROW);
  const col = index % NODES_PER_ROW;

  const x = START_X + col * (NODE_WIDTH + NODE_GAP_X);
  const y = START_Y + row * NODE_GAP_Y;

  return { x, y };
}

/**
 * Determine edge type based on source node status
 */
function getEdgeType(status: PlanTaskStatus | "start"): WorkflowEdgeType {
  switch (status) {
    case "start":
    case "completed":
    case "in_progress":
      return "animated";
    case "pending":
    case "failed":
    case "skipped":
    default:
      return "temporary";
  }
}

/**
 * Create the "Start" node
 */
function createStartNode(): WorkflowNode {
  const position = calculateNodePosition(0);

  return {
    id: "start",
    type: "workflow",
    position,
    data: {
      label: "Start",
      description: "Workflow initiated",
      status: "start",
      handles: { target: false, source: true },
    },
  };
}

/**
 * Create a node from a plan task
 */
function createTaskNode(
  task: PlanTask,
  index: number,
  totalTasks: number
): WorkflowNode {
  // Offset by 1 because Start node is at index 0
  const position = calculateNodePosition(index + 1);
  const isLastTask = index === totalTasks - 1;

  return {
    id: task.id,
    type: "workflow",
    position,
    data: {
      label: task.title || `Task ${index + 1}`,
      description: task.description,
      status: task.status,
      handles: {
        target: true,
        source: !isLastTask,
      },
      completedAt: task.completedAt,
      stepNumber: index + 1,
    },
  };
}

/**
 * Create an edge between two nodes
 */
function createEdge(
  sourceId: string,
  targetId: string,
  sourceStatus: PlanTaskStatus | "start"
): WorkflowEdge {
  return {
    id: `${sourceId}->${targetId}`,
    source: sourceId,
    target: targetId,
    type: getEdgeType(sourceStatus),
  };
}

/**
 * Map a workflow entry to a graph structure
 *
 * Creates:
 * - A "Start" node
 * - A node for each plan task
 * - Edges between consecutive nodes
 *
 * Layout uses a simple grid (4 nodes per row, all left-to-right)
 */
export function mapWorkflowToGraph(workflow: WorkflowEntry): WorkflowGraph {
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];

  // Add Start node
  const startNode = createStartNode();
  nodes.push(startNode);

  // Add plan task nodes
  const tasks = workflow.plan?.tasks || [];
  tasks.forEach((task, index) => {
    nodes.push(createTaskNode(task, index, tasks.length));
  });

  // Create edges between consecutive nodes
  if (tasks.length > 0) {
    // Edge from Start to first task
    edges.push(createEdge("start", tasks[0].id, "start"));

    // Edges between tasks
    for (let i = 0; i < tasks.length - 1; i++) {
      edges.push(createEdge(tasks[i].id, tasks[i + 1].id, tasks[i].status));
    }
  }

  return { nodes, edges };
}

/**
 * Calculate the progress of a workflow as a percentage
 */
export function calculateWorkflowProgress(workflow: WorkflowEntry): number {
  const tasks = workflow.plan?.tasks || [];
  if (tasks.length === 0) return 0;

  const completed = tasks.filter((task) => task.status === "completed").length;
  return Math.round((completed / tasks.length) * 100);
}
