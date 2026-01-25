// Shared types for Diagrid service pages (API Logs, Call Graph, Pub/Sub, KV Store)

export type ServiceStatus = "READY" | "PENDING" | "ERROR";

export interface DiagridService {
  name: string;
  status: ServiceStatus;
  components: string[];
  updatedAt: string;
}

export interface ApiLogEntry {
  id: string;
  appId: string;
  status: string;
  statusCode: "OK" | "ERROR" | "UNKNOWN";
  type: "request" | "response";
  method: string;
  executionTime: string;
  timestamp: string;
  componentName: string;
  componentType: string;
  traceId: string;
  spanId: string;
  userAgent: string;
  ipAddress: string;
  logLevel: string;
}

export interface ApiLogFilters {
  appIds: string[];
  status: string[];
  daprApi: string[];
  dateFrom?: string;
  dateTo?: string;
}

export interface PubSubService extends DiagridService {
  type: "pubsub";
}

export interface PubSubTopic {
  name: string;
  subscriberCount: number;
  totalMessageCount: number;
}

export interface KVStoreService extends DiagridService {
  type: "kvstore";
}

export interface KVEntry {
  key: string;
  value?: unknown;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export interface CallGraphNode {
  id: string;
  type: "service" | "component";
  name: string;
  appId?: string;
  componentType?: string;
}

export interface CallGraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  callCount?: number;
}

export interface CallGraphData {
  nodes: CallGraphNode[];
  edges: CallGraphEdge[];
}

// Pagination types
export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationState;
}
