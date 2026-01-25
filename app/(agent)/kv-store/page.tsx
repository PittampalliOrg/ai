"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw, Plus, List, LayoutGrid, AlertCircle } from "lucide-react";
import { useState } from "react";
import { KVStoreTable } from "@/components/kv-store/kv-store-table";
import { PlatformLayout } from "@/components/platform";
import { useKVStoreList } from "@/hooks/use-kv-store";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function KVStorePage() {
  const { services, pagination, setPage, setPageSize, refresh, isLoading, error, daprAvailable } =
    useKVStoreList();
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  return (
    <PlatformLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h1 className="text-xl font-semibold">KV Store</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage key-value stores and explore data
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View Toggle */}
            <div className="flex items-center border rounded-md">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("list")}
                className={`h-8 px-2 rounded-r-none ${
                  viewMode === "list" ? "bg-muted" : ""
                }`}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("grid")}
                className={`h-8 px-2 rounded-l-none border-l ${
                  viewMode === "grid" ? "bg-muted" : ""
                }`}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>

            {/* Refresh */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refresh()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>

            {/* Create Button (placeholder) */}
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Create
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {error && !daprAvailable ? (
            <div className="p-6">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Dapr Sidecar Not Available</AlertTitle>
                <AlertDescription>
                  Cannot connect to the Dapr sidecar. Make sure your application is running
                  in a Dapr-enabled environment (e.g., Kubernetes with Dapr injector).
                </AlertDescription>
              </Alert>
            </div>
          ) : error ? (
            <div className="p-6">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error Loading State Stores</AlertTitle>
                <AlertDescription>{error.message}</AlertDescription>
              </Alert>
            </div>
          ) : (
            <KVStoreTable
              services={services}
              pagination={pagination}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          )}
        </div>
      </div>
    </PlatformLayout>
  );
}
