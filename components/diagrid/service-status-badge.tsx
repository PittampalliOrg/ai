"use client";

import { cn } from "@/lib/utils";
import type { ServiceStatus } from "@/lib/types/diagrid-services";

interface ServiceStatusBadgeProps {
  status: ServiceStatus;
  className?: string;
}

const statusStyles: Record<ServiceStatus, string> = {
  READY: "bg-green-500/20 text-green-400 border-green-500/30",
  PENDING: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  ERROR: "bg-red-500/20 text-red-400 border-red-500/30",
};

export function ServiceStatusBadge({ status, className }: ServiceStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        statusStyles[status],
        className
      )}
    >
      {status}
    </span>
  );
}
