export type WorkflowStatus = 
  | 'RUNNING' 
  | 'COMPLETED' 
  | 'FAILED' 
  | 'TERMINATED' 
  | 'PENDING' 
  | 'SUSPENDED'
  | 'PAUSED';

export interface WorkflowActivity {
  name: string;
  type: 'activity' | 'subWorkflow' | 'timer' | 'event' | 'parallel' | 'sequence';
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  status: WorkflowStatus;
  startTime?: string;
  endTime?: string;
  error?: string;
  retryCount?: number;
  children?: WorkflowActivity[];
}

export interface WorkflowDefinition {
  name: string;
  instanceId?: string;
  version?: string;
  status: WorkflowStatus;
  createdTime?: string;
  lastUpdatedTime?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  activities: WorkflowActivity[];
  metadata?: {
    description?: string;
    tags?: string[];
  };
}

export interface WorkflowNode {
  id: string;
  type: WorkflowActivity['type'];
  name: string;
  status: WorkflowStatus;
  x: number;
  y: number;
  width: number;
  height: number;
  data: WorkflowActivity;
  children?: WorkflowNode[];
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  type: 'default' | 'conditional' | 'parallel';
}

export interface AIInsight {
  id: string;
  type: 'suggestion' | 'warning' | 'optimization' | 'info';
  title: string;
  description: string;
  affectedNodes?: string[];
  timestamp: string;
}

// Sample workflow for demo
export const sampleWorkflow: WorkflowDefinition = {
  name: 'OrderProcessingWorkflow',
  instanceId: 'order-12345',
  version: '1.0.0',
  status: 'RUNNING',
  createdTime: '2025-01-24T10:00:00Z',
  lastUpdatedTime: '2025-01-24T10:05:32Z',
  input: {
    orderId: '12345',
    customerId: 'cust-789',
    items: [
      { productId: 'prod-001', quantity: 2 },
      { productId: 'prod-002', quantity: 1 }
    ]
  },
  metadata: {
    description: 'Process customer orders with inventory check, payment, and shipping',
    tags: ['order', 'e-commerce', 'production']
  },
  activities: [
    {
      name: 'ValidateOrder',
      type: 'activity',
      status: 'COMPLETED',
      startTime: '2025-01-24T10:00:01Z',
      endTime: '2025-01-24T10:00:02Z',
      input: { orderId: '12345' },
      output: { valid: true, items: 3 }
    },
    {
      name: 'ParallelChecks',
      type: 'parallel',
      status: 'COMPLETED',
      startTime: '2025-01-24T10:00:02Z',
      endTime: '2025-01-24T10:00:05Z',
      children: [
        {
          name: 'CheckInventory',
          type: 'activity',
          status: 'COMPLETED',
          startTime: '2025-01-24T10:00:02Z',
          endTime: '2025-01-24T10:00:04Z',
          output: { available: true }
        },
        {
          name: 'ValidatePayment',
          type: 'activity',
          status: 'COMPLETED',
          startTime: '2025-01-24T10:00:02Z',
          endTime: '2025-01-24T10:00:05Z',
          output: { authorized: true }
        },
        {
          name: 'CheckFraud',
          type: 'activity',
          status: 'COMPLETED',
          startTime: '2025-01-24T10:00:02Z',
          endTime: '2025-01-24T10:00:03Z',
          output: { fraudScore: 0.02 }
        }
      ]
    },
    {
      name: 'ProcessPayment',
      type: 'activity',
      status: 'RUNNING',
      startTime: '2025-01-24T10:00:05Z',
      input: { amount: 149.99, currency: 'USD' },
      retryCount: 0
    },
    {
      name: 'ReserveInventory',
      type: 'activity',
      status: 'PENDING',
      input: { items: ['prod-001', 'prod-002'] }
    },
    {
      name: 'WaitForShipping',
      type: 'event',
      status: 'PENDING',
      input: { eventName: 'ShippingConfirmed' }
    },
    {
      name: 'FulfillmentWorkflow',
      type: 'subWorkflow',
      status: 'PENDING',
      input: { orderId: '12345', shippingMethod: 'express' }
    },
    {
      name: 'SendConfirmation',
      type: 'activity',
      status: 'PENDING',
      input: { template: 'order_complete', channel: 'email' }
    }
  ]
};
