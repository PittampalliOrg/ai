"use client";

import { use } from "react";
import { Database } from "lucide-react";
import { ServiceDetailHeader } from "@/components/diagrid/service-detail-header";
import { ServiceStatusBadge } from "@/components/diagrid/service-status-badge";
import { DataExplorer } from "@/components/kv-store/data-explorer";
import { PlatformLayout } from "@/components/platform";
import { useKVStoreDetail } from "@/hooks/use-kv-store";
import { Skeleton } from "@/components/ui/skeleton";

interface KVStoreDetailPageProps {
  params: Promise<{ name: string }>;
}

function KVStoreDetailSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-6 py-4">
        <Skeleton className="h-4 w-32 mb-3" />
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="p-6">
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

export default function KVStoreDetailPage({ params }: KVStoreDetailPageProps) {
  const resolvedParams = use(params);
  const name = decodeURIComponent(resolvedParams.name);
  const {
    service,
    entries,
    pagination,
    expandedKey,
    expandedValue,
    handleExpandEntry,
    sortField,
    sortDirection,
    handleSort,
    setPage,
    setPageSize,
    refresh,
    isLoading,
  } = useKVStoreDetail(name);

  if (isLoading && !service) {
    return (
      <PlatformLayout>
        <KVStoreDetailSkeleton />
      </PlatformLayout>
    );
  }

  if (!service) {
    return (
      <PlatformLayout>
        <div className="flex flex-col items-center justify-center h-full">
          <p className="text-muted-foreground">KV Store not found</p>
        </div>
      </PlatformLayout>
    );
  }

  return (
    <PlatformLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <ServiceDetailHeader
          icon={<Database className="h-6 w-6" />}
          title="KV Store"
          name={service.name}
          status={service.status}
          breadcrumbLabel="KV Store"
          breadcrumbHref="/kv-store"
        />

        {/* Info Card */}
        <div className="px-6 py-4">
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Name</div>
                  <div className="font-medium">{service.name}</div>
                </div>
                <ServiceStatusBadge status={service.status} />
              </div>
              {service.components.length > 0 && (
                <div>
                  <div className="text-sm text-muted-foreground">Components</div>
                  <div className="text-primary hover:underline cursor-pointer">
                    {service.components.join(", ")}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Data Explorer */}
        <div className="flex-1 px-6 pb-6 overflow-auto">
          <DataExplorer
            entries={entries}
            pagination={pagination}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            onExpandEntry={handleExpandEntry}
            expandedKey={expandedKey}
            expandedValue={expandedValue}
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={handleSort}
            onRefresh={refresh}
            isLoading={isLoading}
          />
        </div>
      </div>
    </PlatformLayout>
  );
}
