/**
 * Execution Graph Mapper
 *
 * Transforms DaprExecutionEvent[] to React Flow graph format.
 * Uses vertical layout (top to bottom) like Diagrid.
 */

import type { DaprExecutionEvent } from "./types/workflow-ui";
import type {
  ExecutionGraph,
  ExecutionFlowNode,
  ExecutionFlowEdge,
  ExecutionNodeStatus,
} from "./types/execution-graph";

// ============================================================================
// Constants
// ============================================================================

const NODE_WIDTH = 220;
const NODE_HEIGHT = 50;
const VERTICAL_SPACING = 120;
const CENTER_X = 300;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Determine node status from event type and metadata
 */
function getNodeStatus(event: DaprExecutionEvent): ExecutionNodeStatus {
  const { eventType, metadata } = event;

  // Check metadata status first
  if (metadata?.status) {
    const status = String(metadata.status).toLowerCase();
    if (status === "failed" || status === "error") return "failed";
    if (status === "running" || status === "in_progress") return "running";
    if (status === "completed" || status === "success") return "completed";
  }

  // Infer from event type
  switch (eventType) {
    case "OrchestratorStarted":
      return "completed"; // Start is always completed once we see it
    case "ExecutionCompleted":
      return "completed";
    case "TaskCompleted":
      return "completed";
    case "TaskScheduled":
      return "scheduled";
    case "EventRaised":
      return "completed";
    default:
      return "pending";
  }
}

/**
 * Get label from event - use task name or simplified event type
 */
function getNodeLabel(event: DaprExecutionEvent): string {
  // For tasks, use the task name
  if (event.name) return event.name;

  // For orchestrator events, use simple labels like Diagrid
  switch (event.eventType) {
    case "OrchestratorStarted":
      return "start";
    case "ExecutionCompleted":
      return "end";
    default:
      return event.eventType;
  }
}

/**
 * Calculate duration between two timestamps
 */
function calculateDurationBetween(
  startTimestamp: string,
  endTimestamp: string
): string | null {
  try {
    const start = new Date(startTimestamp).getTime();
    const end = new Date(endTimestamp).getTime();

    if (isNaN(start) || isNaN(end)) return null;

    const durationMs = end - start;
    if (durationMs < 0) return null;

    if (durationMs < 1000) {
      return `${durationMs}ms`;
    }
    if (durationMs < 60000) {
      return `${(durationMs / 1000).toFixed(2)}s`;
    }
    return `${(durationMs / 60000).toFixed(2)}m`;
  } catch {
    return null;
  }
}

// ============================================================================
// Main Mapper Function
// ============================================================================

/**
 * Transform execution events to React Flow graph
 *
 * Layout strategy (vertical, top to bottom):
 * - start (OrchestratorStarted) at top
 * - Tasks in sequence vertically
 * - end (ExecutionCompleted) at bottom
 */
export function mapExecutionEventsToGraph(
  events: DaprExecutionEvent[]
): ExecutionGraph {
  if (!events || events.length === 0) {
    return { nodes: [], edges: [] };
  }

  const nodes: ExecutionFlowNode[] = [];
  const edges: ExecutionFlowEdge[] = [];

  // Sort events by timestamp (chronological order)
  const sortedEvents = [...events].sort((a, b) => {
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  });

  // Find key events
  const orchestratorStarted = sortedEvents.find(
    (e) => e.eventType === "OrchestratorStarted"
  );
  const executionCompleted = sortedEvents.find(
    (e) => e.eventType === "ExecutionCompleted"
  );

  // Get task events (completed tasks only, to avoid duplicates)
  const taskCompleted = sortedEvents.filter(
    (e) => e.eventType === "TaskCompleted"
  );

  // Build ordered node list
  const orderedEvents: DaprExecutionEvent[] = [];

  if (orchestratorStarted) {
    orderedEvents.push(orchestratorStarted);
  }

  // Add completed tasks in order
  taskCompleted.forEach((event) => {
    orderedEvents.push(event);
  });

  if (executionCompleted) {
    orderedEvents.push(executionCompleted);
  }

  // Create nodes with vertical layout
  orderedEvents.forEach((event, index) => {
    const nodeId = `node-${index}`;
    const isFirst = index === 0;
    const isLast = index === orderedEvents.length - 1;

    nodes.push({
      id: nodeId,
      type: "executionEvent",
      position: {
        x: CENTER_X - NODE_WIDTH / 2,
        y: 50 + index * VERTICAL_SPACING,
      },
      data: {
        label: getNodeLabel(event),
        eventType: event.eventType,
        timestamp: event.timestamp,
        status: getNodeStatus(event),
        eventId: event.eventId,
        name: event.name,
        input: event.input,
        output: event.output,
        metadata: event.metadata,
        handles: {
          target: !isFirst,
          source: !isLast,
        },
      },
    });

    // Create edge to previous node with duration label
    if (index > 0) {
      const prevEvent = orderedEvents[index - 1];
      const duration = calculateDurationBetween(
        prevEvent.timestamp,
        event.timestamp
      );

      edges.push({
        id: `edge-${index - 1}-${index}`,
        source: `node-${index - 1}`,
        target: nodeId,
        type: "smoothstep",
        animated: false,
        label: duration || undefined,
        labelStyle: {
          fill: "#e5e7eb",
          fontSize: 13,
          fontWeight: 500,
        },
        labelBgStyle: {
          fill: "#1a1f2e",
          fillOpacity: 0.9,
        },
        labelBgPadding: [4, 8] as [number, number],
        labelBgBorderRadius: 4,
        style: { stroke: "#2dd4bf", strokeWidth: 2 },
        markerEnd: {
          type: "arrowclosed" as const,
          color: "#2dd4bf",
        },
      });
    }
  });

  return { nodes, edges };
}

/**
 * Calculate completion percentage from events
 */
export function calculateCompletionPercentage(
  events: DaprExecutionEvent[]
): number {
  if (!events || events.length === 0) return 0;

  const hasCompleted = events.some((e) => e.eventType === "ExecutionCompleted");
  if (hasCompleted) return 100;

  const scheduledCount = events.filter(
    (e) => e.eventType === "TaskScheduled"
  ).length;
  const completedCount = events.filter(
    (e) => e.eventType === "TaskCompleted"
  ).length;

  if (scheduledCount === 0) return 0;

  // Add 10% for orchestrator started
  const hasStarted = events.some((e) => e.eventType === "OrchestratorStarted");
  const baseProgress = hasStarted ? 10 : 0;

  // Tasks account for 80% (10% start + tasks + 10% completion)
  const taskProgress =
    scheduledCount > 0 ? (completedCount / scheduledCount) * 80 : 0;

  return Math.min(Math.round(baseProgress + taskProgress), 99);
}
