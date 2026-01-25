"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ServiceStatusBadge } from "./service-status-badge";
import type { ServiceStatus } from "@/lib/types/diagrid-services";

interface ServiceDetailHeaderProps {
  icon: React.ReactNode;
  title: string;
  name: string;
  status?: ServiceStatus;
  breadcrumbLabel: string;
  breadcrumbHref: string;
  className?: string;
  children?: React.ReactNode;
}

export function ServiceDetailHeader({
  icon,
  title,
  name,
  status,
  breadcrumbLabel,
  breadcrumbHref,
  className,
  children,
}: ServiceDetailHeaderProps) {
  return (
    <div className={cn("border-b border-gray-700 bg-[#1e2433]", className)}>
      <div className="px-6 py-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-3">
          <Link
            href={breadcrumbHref}
            className="hover:text-cyan-400 transition-colors"
          >
            {breadcrumbLabel}
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-white">{name}</span>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-cyan-400">{icon}</div>
            <div>
              <h1 className="text-xl font-semibold text-white">
                {title} - {name}
              </h1>
              {status && (
                <div className="mt-1">
                  <ServiceStatusBadge status={status} />
                </div>
              )}
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
