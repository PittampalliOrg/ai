"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw, AlertCircle } from "lucide-react";
import { PlatformLayout } from "@/components/platform";
import { useConfiguration } from "@/hooks/use-configuration";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ConfigSection,
  ConfigTable,
  FeatureFlagTable,
  RuntimeStatus,
} from "@/components/configuration";

// Azure Portal URL for App Configuration
const AZURE_PORTAL_URL =
  "https://portal.azure.com/#@/resource/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg3/providers/Microsoft.AppConfiguration/configurationStores/rg3-app-config/kvs";

export default function ConfigurationPage() {
  const {
    sources,
    config,
    featureFlags,
    searchTerm,
    setSearchTerm,
    isLoading,
    error,
    refresh,
    totalCount,
    filteredCount,
    hasFilters,
    debug,
  } = useConfiguration({ refreshInterval: 30000 });

  // Build Flipt URL from sources
  const fliptUrl = sources?.flipt?.url || "http://localhost:8080";
  const fliptNamespace = sources?.flipt?.namespace || "default";
  const fliptDashboardUrl = `${fliptUrl}/flags/${fliptNamespace}`;

  return (
    <PlatformLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h1 className="text-xl font-semibold">Configuration</h1>
            <p className="text-sm text-muted-foreground mt-1">
              View all configuration values (read-only)
              {hasFilters && filteredCount !== totalCount && (
                <span className="ml-2 text-xs">
                  Showing {filteredCount} of {totalCount} items
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Refresh */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refresh()}
              disabled={isLoading}
              className="gap-2"
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error Loading Configuration</AlertTitle>
              <AlertDescription>
                {error instanceof Error ? error.message : "An error occurred"}
              </AlertDescription>
            </Alert>
          ) : isLoading && !sources ? (
            <div className="space-y-6">
              <Skeleton className="h-[200px] w-full" />
              <Skeleton className="h-[200px] w-full" />
              <Skeleton className="h-[100px] w-full" />
            </div>
          ) : (
            <>
              {/* App Configuration Section */}
              <ConfigSection
                title="App Configuration"
                description={`Source: Azure App Config (${sources?.azureAppConfig?.endpoint || "rg3-app-config"})`}
                source={
                  sources?.runtime?.configSource === "dapr"
                    ? "Azure App Config"
                    : "Environment Variables"
                }
                sourceAvailable={sources?.azureAppConfig?.available}
                itemCount={config.length}
                externalUrl={AZURE_PORTAL_URL}
                externalLabel="Open in Azure Portal"
              >
                <ConfigTable
                  items={config}
                  searchTerm={searchTerm}
                  onSearchChange={setSearchTerm}
                  showCategory={true}
                  showSource={true}
                />
              </ConfigSection>

              {/* Feature Flags Section */}
              <ConfigSection
                title="Feature Flags"
                description={`Source: Flipt (${sources?.flipt?.namespace || "default"} namespace)`}
                source="Flipt"
                sourceAvailable={sources?.flipt?.available}
                itemCount={featureFlags.length}
                externalUrl={fliptDashboardUrl}
                externalLabel="Open Flipt UI"
              >
                <FeatureFlagTable flags={featureFlags} />
              </ConfigSection>

              {/* Runtime Status Section */}
              <ConfigSection
                title="Runtime Status"
                description="Configuration provider and service connectivity status"
                defaultExpanded={true}
              >
                <RuntimeStatus sources={sources} debug={debug} />
              </ConfigSection>
            </>
          )}
        </div>
      </div>
    </PlatformLayout>
  );
}
