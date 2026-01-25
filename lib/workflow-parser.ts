import type { WorkflowDefinition, WorkflowActivity, WorkflowNode, WorkflowEdge } from './workflow-types';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;
const HORIZONTAL_GAP = 100;
const VERTICAL_GAP = 40;
const PARALLEL_VERTICAL_GAP = 20;

export function parseWorkflowToGraph(workflow: WorkflowDefinition): { nodes: WorkflowNode[], edges: WorkflowEdge[] } {
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];
  
  let currentX = 50;
  let previousNodeId: string | null = null;
  
  workflow.activities.forEach((activity, index) => {
    const nodeId = `node-${index}`;
    
    if (activity.type === 'parallel' && activity.children) {
      // Handle parallel activities
      const parallelNodes: WorkflowNode[] = [];
      const startY = 100;
      const childHeight = NODE_HEIGHT + PARALLEL_VERTICAL_GAP;
      const totalHeight = activity.children.length * childHeight;
      const startOffset = -totalHeight / 2 + childHeight / 2;
      
      activity.children.forEach((child, childIndex) => {
        const childNodeId = `${nodeId}-child-${childIndex}`;
        const childY = startY + 150 + startOffset + (childIndex * childHeight);
        
        const childNode: WorkflowNode = {
          id: childNodeId,
          type: child.type,
          name: child.name,
          status: child.status,
          x: currentX,
          y: childY,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          data: child
        };
        
        parallelNodes.push(childNode);
        nodes.push(childNode);
        
        // Connect from previous node to each parallel child
        if (previousNodeId) {
          edges.push({
            id: `edge-${previousNodeId}-${childNodeId}`,
            source: previousNodeId,
            target: childNodeId,
            type: 'parallel'
          });
        }
      });
      
      // Create parent group node
      const parentNode: WorkflowNode = {
        id: nodeId,
        type: 'parallel',
        name: activity.name,
        status: activity.status,
        x: currentX - 20,
        y: 100 + 150 + startOffset - 30,
        width: NODE_WIDTH + 40,
        height: totalHeight + 40,
        data: activity,
        children: parallelNodes
      };
      
      nodes.push(parentNode);
      
      // Store last parallel node IDs for connecting to next
      const lastParallelIds = parallelNodes.map(n => n.id);
      
      currentX += NODE_WIDTH + HORIZONTAL_GAP;
      
      // Connect all parallel children to next node if exists
      const nextActivity = workflow.activities[index + 1];
      if (nextActivity) {
        const nextNodeId = `node-${index + 1}`;
        lastParallelIds.forEach(childId => {
          edges.push({
            id: `edge-${childId}-${nextNodeId}`,
            source: childId,
            target: nextNodeId,
            type: 'default'
          });
        });
      }
      
      previousNodeId = null; // Reset since parallel children connect to next
    } else {
      // Handle sequential activities
      const node: WorkflowNode = {
        id: nodeId,
        type: activity.type,
        name: activity.name,
        status: activity.status,
        x: currentX,
        y: 250, // Center line for sequential nodes
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        data: activity
      };
      
      nodes.push(node);
      
      // Connect from previous node
      if (previousNodeId) {
        edges.push({
          id: `edge-${previousNodeId}-${nodeId}`,
          source: previousNodeId,
          target: nodeId,
          type: 'default'
        });
      }
      
      previousNodeId = nodeId;
      currentX += NODE_WIDTH + HORIZONTAL_GAP;
    }
  });
  
  return { nodes, edges };
}

export function parseJsonToWorkflow(json: string): WorkflowDefinition | null {
  try {
    const parsed = JSON.parse(json);
    
    // Basic validation
    if (!parsed.name || !parsed.activities || !Array.isArray(parsed.activities)) {
      return null;
    }
    
    // Set defaults
    return {
      name: parsed.name,
      instanceId: parsed.instanceId || `instance-${Date.now()}`,
      version: parsed.version || '1.0.0',
      status: parsed.status || 'PENDING',
      createdTime: parsed.createdTime || new Date().toISOString(),
      lastUpdatedTime: parsed.lastUpdatedTime || new Date().toISOString(),
      input: parsed.input || {},
      output: parsed.output,
      activities: parsed.activities.map((act: Partial<WorkflowActivity>, idx: number) => ({
        name: act.name || `Activity-${idx}`,
        type: act.type || 'activity',
        status: act.status || 'PENDING',
        input: act.input,
        output: act.output,
        startTime: act.startTime,
        endTime: act.endTime,
        error: act.error,
        retryCount: act.retryCount || 0,
        children: act.children?.map((child: Partial<WorkflowActivity>, cidx: number) => ({
          name: child.name || `Child-${cidx}`,
          type: child.type || 'activity',
          status: child.status || 'PENDING',
          input: child.input,
          output: child.output,
          startTime: child.startTime,
          endTime: child.endTime,
          error: child.error,
          retryCount: child.retryCount || 0
        }))
      })),
      metadata: parsed.metadata
    };
  } catch {
    return null;
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'RUNNING':
      return 'var(--status-running)';
    case 'COMPLETED':
      return 'var(--status-completed)';
    case 'FAILED':
    case 'TERMINATED':
      return 'var(--status-failed)';
    case 'PAUSED':
    case 'SUSPENDED':
      return 'var(--status-paused)';
    case 'PENDING':
    default:
      return 'var(--status-pending)';
  }
}

export function formatDuration(start?: string, end?: string): string {
  if (!start) return '-';
  
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date();
  const diff = endDate.getTime() - startDate.getTime();
  
  if (diff < 1000) return `${diff}ms`;
  if (diff < 60000) return `${(diff / 1000).toFixed(1)}s`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ${Math.floor((diff % 60000) / 1000)}s`;
  
  return `${Math.floor(diff / 3600000)}h ${Math.floor((diff % 3600000) / 60000)}m`;
}
