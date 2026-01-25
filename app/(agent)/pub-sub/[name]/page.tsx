"use client";

import { use } from "react";
import { Radio } from "lucide-react";
import { ServiceDetailHeader } from "@/components/diagrid/service-detail-header";
import { ServiceStatusBadge } from "@/components/diagrid/service-status-badge";
import { TopicExplorer } from "@/components/pub-sub/topic-explorer";
import { PlatformLayout } from "@/components/platform";
import { usePubSubDetail } from "@/hooks/use-pub-sub";
import { Skeleton } from "@/components/ui/skeleton";

interface PubSubDetailPageProps {
  params: Promise<{ name: string }>;
}

function PubSubDetailSkeleton() {
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

export default function PubSubDetailPage({ params }: PubSubDetailPageProps) {
  const resolvedParams = use(params);
  const name = decodeURIComponent(resolvedParams.name);
  const { service, topics, refresh, isLoading } = usePubSubDetail(name);

  if (isLoading && !service) {
    return (
      <PlatformLayout>
        <PubSubDetailSkeleton />
      </PlatformLayout>
    );
  }

  if (!service) {
    return (
      <PlatformLayout>
        <div className="flex flex-col items-center justify-center h-full">
          <p className="text-muted-foreground">Pub/Sub service not found</p>
        </div>
      </PlatformLayout>
    );
  }

  return (
    <PlatformLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <ServiceDetailHeader
          icon={<Radio className="h-6 w-6" />}
          title="Pub/Sub"
          name={service.name}
          status={service.status}
          breadcrumbLabel="Pub/Sub"
          breadcrumbHref="/pub-sub"
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
                  <div className="text-sm text-muted-foreground">Component</div>
                  <div className="text-primary hover:underline cursor-pointer">
                    {service.components.join(", ")}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Topic Explorer */}
        <div className="flex-1 px-6 pb-6 overflow-auto">
          <TopicExplorer
            topics={topics}
            onRefresh={refresh}
            isLoading={isLoading}
          />
        </div>
      </div>
    </PlatformLayout>
  );
}
