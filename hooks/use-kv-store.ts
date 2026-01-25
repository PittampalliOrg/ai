"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import type {
  KVStoreService,
  KVEntry,
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
  error?: string;
}

interface StateStoreEntry {
  key: string;
  value: unknown;
  etag?: string;
}

interface StateStoreResponse {
  storeName: string;
  entries: StateStoreEntry[];
  total: number;
  error?: string;
  message?: string;
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

async function fetchStateStoreEntries(
  storeName: string
): Promise<StateStoreResponse> {
  const response = await fetch(`/api/dapr/state/${encodeURIComponent(storeName)}`);
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || "Failed to fetch state entries");
  }
  return response.json();
}

async function fetchStateValue(
  storeName: string,
  key: string
): Promise<unknown> {
  const response = await fetch(
    `/api/dapr/state/${encodeURIComponent(storeName)}/${encodeURIComponent(key)}`
  );
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    const data = await response.json();
    throw new Error(data.error || "Failed to fetch state value");
  }
  const data = await response.json();
  return data.value;
}

// ============================================================================
// Helper Functions
// ============================================================================

function componentTypeToStatus(type: string): ServiceStatus {
  // Determine status based on component type and availability
  // For now, if we can see the component in metadata, it's READY
  return "READY";
}

function formatTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace("T", " ").substring(0, 19);
}

function parseEntryTimestamps(
  key: string,
  value: unknown
): { createdAt: string; updatedAt: string; expiresAt?: string } {
  // Try to extract timestamps from the value if it's an object
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return {
      createdAt: typeof obj.createdAt === "string"
        ? obj.createdAt
        : formatTimestamp(),
      updatedAt: typeof obj.updatedAt === "string"
        ? obj.updatedAt
        : formatTimestamp(),
      expiresAt: typeof obj.expiresAt === "string" ? obj.expiresAt : undefined,
    };
  }

  // Default timestamps
  const now = formatTimestamp();
  return { createdAt: now, updatedAt: now };
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
 * Hook to fetch list of KV (state) store services from Dapr metadata
 */
export function useKVStoreList() {
  const [pagination, setPagination] = useState<PaginationState>(defaultPagination);

  const { data, error, isLoading, mutate } = useSWR(
    ["kv-store-list"],
    fetchDaprMetadata,
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
      refreshInterval: 30000, // Refresh every 30 seconds
    }
  );

  // Extract state store components from metadata
  const services: KVStoreService[] = (data?.components || [])
    .filter((c) => c.type.startsWith("state."))
    .map((c) => ({
      name: c.name,
      type: "kvstore" as const,
      status: componentTypeToStatus(c.type),
      components: [c.type.replace("state.", "")],
      updatedAt: formatTimestamp(),
      capabilities: c.capabilities,
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
 * Hook to fetch detail of a specific KV store including its entries
 */
export function useKVStoreDetail(name: string) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [expandedValue, setExpandedValue] = useState<unknown>(undefined);
  const [pagination, setPagination] = useState<PaginationState>(defaultPagination);
  const [sortField, setSortField] = useState<"createdAt" | "updatedAt">("updatedAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Fetch the service info from metadata
  const { data: metadataData } = useSWR(
    name ? ["kv-store-metadata", name] : null,
    fetchDaprMetadata,
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
    }
  );

  // Fetch entries from the state store
  const { data: entriesData, error, isLoading, mutate } = useSWR(
    name ? ["kv-store-entries", name] : null,
    () => fetchStateStoreEntries(name),
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
      refreshInterval: 10000, // Refresh every 10 seconds
    }
  );

  // Build service object from metadata
  const component = metadataData?.components?.find(
    (c) => c.name === name && c.type.startsWith("state.")
  );

  const service: KVStoreService | null = component
    ? {
        name: component.name,
        type: "kvstore",
        status: "READY",
        components: [component.type.replace("state.", "")],
        updatedAt: formatTimestamp(),
      }
    : null;

  // Convert state store entries to KVEntry format
  const entries: KVEntry[] = (entriesData?.entries || []).map((e) => {
    const timestamps = parseEntryTimestamps(e.key, e.value);
    return {
      key: e.key,
      value: e.value,
      ...timestamps,
    };
  });

  const handleExpandEntry = useCallback(
    async (key: string) => {
      if (expandedKey === key) {
        setExpandedKey(null);
        setExpandedValue(undefined);
        return;
      }

      setExpandedKey(key);
      setExpandedValue(undefined);

      try {
        const value = await fetchStateValue(name, key);
        setExpandedValue(value);
      } catch (err) {
        console.error("Failed to fetch value for key:", key, err);
        // Use the value from the entries list as fallback
        const entry = entries.find((e) => e.key === key);
        setExpandedValue(entry?.value);
      }
    },
    [expandedKey, name, entries]
  );

  const handleSort = useCallback(
    (field: "createdAt" | "updatedAt") => {
      if (sortField === field) {
        setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDirection("desc");
      }
    },
    [sortField]
  );

  const sortedEntries = [...entries].sort((a, b) => {
    const aValue = a[sortField] || "";
    const bValue = b[sortField] || "";
    const compare = aValue.localeCompare(bValue);
    return sortDirection === "asc" ? compare : -compare;
  });

  // Apply pagination
  const startIdx = (pagination.page - 1) * pagination.pageSize;
  const paginatedEntries = sortedEntries.slice(
    startIdx,
    startIdx + pagination.pageSize
  );

  const setPage = useCallback((page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  }, []);

  const setPageSize = useCallback((pageSize: number) => {
    setPagination((prev) => ({ ...prev, pageSize, page: 1 }));
  }, []);

  return {
    service,
    entries: paginatedEntries,
    allEntries: sortedEntries,
    pagination: { ...pagination, total: sortedEntries.length },
    expandedKey,
    expandedValue,
    handleExpandEntry,
    sortField,
    sortDirection,
    handleSort,
    setPage,
    setPageSize,
    refresh: mutate,
    isLoading,
    error,
    message: entriesData?.message,
  };
}
