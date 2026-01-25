"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Search } from "lucide-react";
import { ApiLogsTable } from "@/components/api-logs/api-logs-table";
import { ApiLogFiltersDropdown } from "@/components/api-logs/api-log-filters";
import { ApiLogDetailPanel } from "@/components/api-logs/api-log-detail-panel";
import { PlatformLayout } from "@/components/platform";
import { useApiLogs } from "@/hooks/use-api-logs";

export default function ApiLogsPage() {
  const {
    logs,
    pagination,
    filters,
    selectedLog,
    setSelectedLog,
    updateFilters,
    clearFilters,
    setPage,
    setPageSize,
    refresh,
    isLoading,
    availableAppIds,
    availableApis,
  } = useApiLogs();

  const [searchQuery, setSearchQuery] = useState("");

  const filteredLogs = searchQuery
    ? logs.filter(
        (log) =>
          log.appId.toLowerCase().includes(searchQuery.toLowerCase()) ||
          log.method.toLowerCase().includes(searchQuery.toLowerCase()) ||
          log.componentName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : logs;

  return (
    <PlatformLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h1 className="text-xl font-semibold">API Logs</h1>
            <p className="text-sm text-muted-foreground mt-1">
              View and filter Dapr API call logs
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 px-6 py-3 border-b">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Filters */}
          <ApiLogFiltersDropdown
            filters={filters}
            onFiltersChange={updateFilters}
            onClear={clearFilters}
            availableAppIds={availableAppIds}
            availableApis={availableApis}
          />

          {/* Refresh */}
          <Button
            variant="outline"
            size="icon"
            onClick={refresh}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Total count */}
        <div className="px-6 py-2 text-sm text-muted-foreground">
          {pagination.total} total rows
        </div>

        {/* Table */}
        <div className="flex-1 overflow-hidden">
          <ApiLogsTable
            logs={filteredLogs}
            pagination={pagination}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            onRowClick={setSelectedLog}
            selectedLogId={selectedLog?.id}
            className="h-full"
          />
        </div>

        {/* Detail Panel */}
        <ApiLogDetailPanel
          log={selectedLog}
          open={!!selectedLog}
          onClose={() => setSelectedLog(null)}
        />
      </div>
    </PlatformLayout>
  );
}
