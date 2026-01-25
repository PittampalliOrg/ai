"use client";

import { Suspense } from "react";
import { WorkflowPageTabs } from "@/components/dapr-workflows/workflow-page-tabs";
import { PlatformLayout } from "@/components/platform";
import { Skeleton } from "@/components/ui/skeleton";

function WorkflowPageSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="px-6 pt-4 border-b">
        <Skeleton className="h-10 w-80" />
      </div>
      <div className="flex-1 p-6">
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

export default function DaprWorkflowsPage() {
  return (
    <PlatformLayout>
      <Suspense fallback={<WorkflowPageSkeleton />}>
        <WorkflowPageTabs />
      </Suspense>
    </PlatformLayout>
  );
}
