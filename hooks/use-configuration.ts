"use client";

import { useState, useCallback, useMemo } from "react";
import useSWR from "swr";

// ============================================================================
// Types
// ============================================================================

export interface ConfigItem {
  key: string;
  value: string;
  source: "azure" | "env";
  category: string;
}

export interface FeatureFlag {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  type: "BOOLEAN_FLAG_TYPE" | "VARIANT_FLAG_TYPE";
  variants?: Array<{ key: string; name: string }>;
}

export interface ConfigurationSources {
  azureAppConfig: {
    available: boolean;
    endpoint: string;
    label: string;
    itemCount: number;
    lastFetched: string;
  };
  flipt: {
    available: boolean;
    url: string;
    namespace: string;
    flagCount: number;
  };
  runtime: {
    initialized: boolean;
    daprEnabled: boolean;
    configSource: "dapr" | "env";
  };
}

export interface ConfigurationResponse {
  sources: ConfigurationSources;
  config: ConfigItem[];
  featureFlags: FeatureFlag[];
}

// ============================================================================
// API Fetcher
// ============================================================================

async function fetchConfiguration(): Promise<ConfigurationResponse> {
  const response = await fetch("/api/configuration");
  if (!response.ok) {
    throw new Error("Failed to fetch configuration");
  }
  return response.json();
}

// ============================================================================
// Hook
// ============================================================================

interface UseConfigurationOptions {
  refreshInterval?: number;
}

export function useConfiguration(options: UseConfigurationOptions = {}) {
  const { refreshInterval = 30000 } = options;

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const { data, error, isLoading, mutate } = useSWR(
    ["configuration"],
    fetchConfiguration,
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
      refreshInterval,
    }
  );

  // Filter config items based on search and category
  const filteredConfig = useMemo(() => {
    if (!data?.config) return [];

    let items = data.config;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      items = items.filter(
        (item) =>
          item.key.toLowerCase().includes(term) ||
          item.value.toLowerCase().includes(term)
      );
    }

    if (categoryFilter) {
      items = items.filter((item) => item.category === categoryFilter);
    }

    return items;
  }, [data?.config, searchTerm, categoryFilter]);

  // Get unique categories for filtering
  const categories = useMemo(() => {
    if (!data?.config) return [];
    const cats = new Set(data.config.map((item) => item.category));
    return Array.from(cats).sort();
  }, [data?.config]);

  // Group config by category
  const configByCategory = useMemo(() => {
    const groups: Record<string, ConfigItem[]> = {};
    for (const item of filteredConfig) {
      if (!groups[item.category]) {
        groups[item.category] = [];
      }
      groups[item.category].push(item);
    }
    return groups;
  }, [filteredConfig]);

  const refresh = useCallback(() => {
    return mutate();
  }, [mutate]);

  const clearFilters = useCallback(() => {
    setSearchTerm("");
    setCategoryFilter(null);
  }, []);

  return {
    // Data
    sources: data?.sources,
    config: filteredConfig,
    allConfig: data?.config || [],
    configByCategory,
    featureFlags: data?.featureFlags || [],
    categories,

    // Filters
    searchTerm,
    setSearchTerm,
    categoryFilter,
    setCategoryFilter,
    clearFilters,

    // State
    isLoading,
    error,
    refresh,

    // Computed
    hasFilters: searchTerm !== "" || categoryFilter !== null,
    totalCount: data?.config?.length || 0,
    filteredCount: filteredConfig.length,
  };
}
