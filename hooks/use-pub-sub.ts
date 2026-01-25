"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import type {
  PubSubService,
  PubSubTopic,
  PaginationState,
  ServiceStatus,
} from "@/lib/types/diagrid-services";

// ============================================================================
// Types
// ============================================================================

interface DaprMetadataResponse {
  available: boolean;
  id?: string;
  runtimeVersion?: string;
  components?: Array<{
    name: string;
    type: string;
    version: string;
    capabilities?: string[];
  }>;
  subscriptions?: Array<{
    pubsubname: string;
    topic: string;
    rules?: Array<{ match?: string; path: string }>;
    deadLetterTopic?: string;
    type?: "DECLARATIVE" | "STREAMING" | "PROGRAMMATIC";
    metadata?: Record<string, string>;
  }>;
  error?: string;
}

// ============================================================================
// API Fetchers
// ============================================================================

async function fetchDaprMetadata(): Promise<DaprMetadataResponse> {
  const response = await fetch("/api/dapr/metadata");
  if (!response.ok) {
    const data = await response.json();
    return { available: false, error: data.error || "Failed to fetch metadata" };
  }
  return response.json();
}

// ============================================================================
// Helper Functions
// ============================================================================

function componentTypeToStatus(_type: string): ServiceStatus {
  // If component appears in metadata, it's operational
  return "READY";
}

function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace("T", " ").substring(0, 19);
}

// ============================================================================
// Hooks
// ============================================================================

const defaultPagination: PaginationState = {
  page: 1,
  pageSize: 10,
  total: 0,
};

/**
 * Hook to fetch list of Pub/Sub services from Dapr metadata
 */
export function usePubSubList() {
  const [pagination, setPagination] = useState<PaginationState>(defaultPagination);

  const { data, error, isLoading, mutate } = useSWR(
    ["pub-sub-list"],
    fetchDaprMetadata,
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
      refreshInterval: 30000, // Refresh every 30 seconds
    }
  );

  // Extract pub/sub components from metadata
  const services: PubSubService[] = (data?.components || [])
    .filter((c) => c.type.startsWith("pubsub."))
    .map((c) => ({
      name: c.name,
      type: "pubsub" as const,
      status: componentTypeToStatus(c.type),
      components: [c.type.replace("pubsub.", "")],
      updatedAt: formatTimestamp(),
    }));

  const total = services.length;

  // Apply pagination
  const startIdx = (pagination.page - 1) * pagination.pageSize;
  const paginatedServices = services.slice(startIdx, startIdx + pagination.pageSize);

  const setPage = useCallback((page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  }, []);

  const setPageSize = useCallback((pageSize: number) => {
    setPagination((prev) => ({ ...prev, pageSize, page: 1 }));
  }, []);

  return {
    services: paginatedServices,
    allServices: services,
    pagination: { ...pagination, total },
    setPage,
    setPageSize,
    refresh: mutate,
    isLoading,
    error: error || (data?.error ? new Error(data.error) : undefined),
    daprAvailable: data?.available ?? false,
  };
}

/**
 * Hook to fetch detail of a specific Pub/Sub service including its topics
 */
export function usePubSubDetail(name: string) {
  const { data, error, isLoading, mutate } = useSWR(
    name ? ["pub-sub-detail", name] : null,
    fetchDaprMetadata,
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
      refreshInterval: 10000, // Refresh every 10 seconds
    }
  );

  // Find the pub/sub component
  const component = data?.components?.find(
    (c) => c.name === name && c.type.startsWith("pubsub.")
  );

  const service: PubSubService | null = component
    ? {
        name: component.name,
        type: "pubsub",
        status: "READY",
        components: [component.type.replace("pubsub.", "")],
        updatedAt: formatTimestamp(),
      }
    : null;

  // Extract topics from subscriptions for this pub/sub
  const subscriptions = data?.subscriptions?.filter((s) => s.pubsubname === name) || [];

  // Group subscriptions by topic to count subscribers
  const topicMap = new Map<string, number>();
  subscriptions.forEach((sub) => {
    const count = topicMap.get(sub.topic) || 0;
    topicMap.set(sub.topic, count + 1);
  });

  // Convert to PubSubTopic format
  // Note: Dapr doesn't provide message counts, so we'll show 0 or use metadata if available
  const topics: PubSubTopic[] = Array.from(topicMap.entries()).map(
    ([topicName, subscriberCount]) => ({
      name: topicName,
      subscriberCount,
      // Message count is not available from Dapr metadata
      // This would need to come from the actual pub/sub backend (Redis, Kafka, etc.)
      totalMessageCount: 0,
    })
  );

  return {
    service,
    topics,
    subscriptions, // Expose raw subscriptions for detailed view
    refresh: mutate,
    isLoading,
    error: error || (data?.error ? new Error(data.error) : undefined),
    daprAvailable: data?.available ?? false,
  };
}
