"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import type {
  ApiLogEntry,
  ApiLogFilters,
  PaginationState,
} from "@/lib/types/diagrid-services";

// Mock data for development - replace with actual API calls
const mockApiLogs: ApiLogEntry[] = [
  {
    id: "1",
    appId: "workflow-orchestrator",
    status: "GRPC OK",
    statusCode: "OK",
    type: "request",
    method: "/dapr.proto.runtime.v1.Dapr/SaveState",
    executionTime: "12ms",
    timestamp: "2024-01-15 10:30:45",
    componentName: "statestore",
    componentType: "state.redis",
    traceId: "abc123def456",
    spanId: "span789",
    userAgent: "dapr-sdk-go/1.10.0",
    ipAddress: "10.0.0.1",
    logLevel: "INFO",
  },
  {
    id: "2",
    appId: "workflow-orchestrator",
    status: "GRPC OK",
    statusCode: "OK",
    type: "request",
    method: "/dapr.proto.runtime.v1.Dapr/GetState",
    executionTime: "5ms",
    timestamp: "2024-01-15 10:30:42",
    componentName: "statestore",
    componentType: "state.redis",
    traceId: "xyz789abc123",
    spanId: "span456",
    userAgent: "dapr-sdk-go/1.10.0",
    ipAddress: "10.0.0.1",
    logLevel: "INFO",
  },
  {
    id: "3",
    appId: "payment-service",
    status: "GRPC ERROR",
    statusCode: "ERROR",
    type: "request",
    method: "/dapr.proto.runtime.v1.Dapr/PublishEvent",
    executionTime: "150ms",
    timestamp: "2024-01-15 10:30:40",
    componentName: "pubsub",
    componentType: "pubsub.redis",
    traceId: "err456xyz789",
    spanId: "span123",
    userAgent: "dapr-sdk-python/1.10.0",
    ipAddress: "10.0.0.2",
    logLevel: "ERROR",
  },
  {
    id: "4",
    appId: "inventory-service",
    status: "GRPC OK",
    statusCode: "OK",
    type: "request",
    method: "/dapr.proto.runtime.v1.Dapr/InvokeService",
    executionTime: "45ms",
    timestamp: "2024-01-15 10:30:38",
    componentName: "",
    componentType: "service-invocation",
    traceId: "inv123abc456",
    spanId: "span012",
    userAgent: "dapr-sdk-js/1.10.0",
    ipAddress: "10.0.0.3",
    logLevel: "INFO",
  },
];

const defaultFilters: ApiLogFilters = {
  appIds: [],
  status: [],
  daprApi: [],
  dateFrom: undefined,
  dateTo: undefined,
};

const defaultPagination: PaginationState = {
  page: 1,
  pageSize: 25,
  total: 0,
};

async function fetchApiLogs(
  filters: ApiLogFilters,
  pagination: PaginationState
): Promise<{ logs: ApiLogEntry[]; total: number }> {
  // TODO: Replace with actual Dapr API call
  // This would integrate with tracing backend (Zipkin/Jaeger) or Dapr metadata

  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  let filtered = [...mockApiLogs];

  // Apply filters
  if (filters.appIds.length > 0) {
    filtered = filtered.filter((log) => filters.appIds.includes(log.appId));
  }
  if (filters.status.length > 0) {
    filtered = filtered.filter((log) => filters.status.includes(log.statusCode));
  }
  if (filters.daprApi.length > 0) {
    filtered = filtered.filter((log) =>
      filters.daprApi.some((api) => log.method.includes(api))
    );
  }

  const total = filtered.length;
  const start = (pagination.page - 1) * pagination.pageSize;
  const end = start + pagination.pageSize;
  const logs = filtered.slice(start, end);

  return { logs, total };
}

export function useApiLogs() {
  const [filters, setFilters] = useState<ApiLogFilters>(defaultFilters);
  const [pagination, setPagination] = useState<PaginationState>(defaultPagination);
  const [selectedLog, setSelectedLog] = useState<ApiLogEntry | null>(null);

  const { data, error, isLoading, mutate } = useSWR(
    ["api-logs", filters, pagination.page, pagination.pageSize],
    () => fetchApiLogs(filters, pagination),
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
    }
  );

  const logs = data?.logs || [];
  const total = data?.total || 0;

  const updateFilters = useCallback((newFilters: Partial<ApiLogFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(defaultFilters);
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  const setPage = useCallback((page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  }, []);

  const setPageSize = useCallback((pageSize: number) => {
    setPagination((prev) => ({ ...prev, pageSize, page: 1 }));
  }, []);

  const refresh = useCallback(() => {
    mutate();
  }, [mutate]);

  // Get unique app IDs for filter dropdown
  const availableAppIds = [...new Set(mockApiLogs.map((log) => log.appId))];
  const availableApis = [
    "SaveState",
    "GetState",
    "DeleteState",
    "PublishEvent",
    "InvokeService",
    "InvokeBinding",
  ];

  return {
    logs,
    pagination: { ...pagination, total },
    filters,
    selectedLog,
    setSelectedLog,
    updateFilters,
    clearFilters,
    setPage,
    setPageSize,
    refresh,
    isLoading,
    error,
    availableAppIds,
    availableApis,
  };
}
