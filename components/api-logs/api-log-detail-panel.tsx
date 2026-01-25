"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { ApiLogEntry } from "@/lib/types/diagrid-services";

interface ApiLogDetailPanelProps {
  log: ApiLogEntry | null;
  open: boolean;
  onClose: () => void;
}

function DetailRow({
  label,
  value,
  isLink = false,
  className,
}: {
  label: string;
  value: string;
  isLink?: boolean;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-gray-500">{label}</span>
      {isLink ? (
        <span className="text-cyan-400 hover:underline cursor-pointer">
          {value}
        </span>
      ) : (
        <span className={cn("text-gray-200", className)}>{value}</span>
      )}
    </div>
  );
}

function StatusBadge({ status, statusCode }: { status: string; statusCode: string }) {
  const isOk = statusCode === "OK";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-sm font-medium",
        isOk
          ? "bg-green-500/20 text-green-400 border border-green-500/30"
          : "bg-red-500/20 text-red-400 border border-red-500/30"
      )}
    >
      {status}
    </span>
  );
}

export function ApiLogDetailPanel({ log, open, onClose }: ApiLogDetailPanelProps) {
  if (!log) return null;

  return (
    <Sheet open={open} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg bg-[#1a1f2e] border-gray-700 overflow-y-auto"
      >
        <SheetHeader className="border-b border-gray-700 pb-4">
          <SheetTitle className="text-white font-mono text-lg break-all">
            {log.method}
          </SheetTitle>
        </SheetHeader>

        <div className="py-6 space-y-6">
          {/* Status */}
          <div className="flex flex-col gap-1">
            <span className="text-sm text-gray-500">Status</span>
            <StatusBadge status={log.status} statusCode={log.statusCode} />
          </div>

          {/* App ID */}
          <DetailRow label="App ID" value={log.appId} isLink />

          {/* Type */}
          <DetailRow label="Type" value={log.type} className="capitalize" />

          {/* Component Name */}
          {log.componentName && (
            <DetailRow label="Component name" value={log.componentName} />
          )}

          {/* Component Type */}
          <DetailRow label="Component type" value={log.componentType} />

          {/* Trace ID */}
          <DetailRow
            label="Trace ID"
            value={log.traceId}
            className="font-mono text-sm"
          />

          {/* Span ID */}
          <DetailRow
            label="Span ID"
            value={log.spanId}
            className="font-mono text-sm"
          />

          {/* User Agent */}
          <DetailRow
            label="User agent"
            value={log.userAgent}
            className="font-mono text-sm"
          />

          {/* IP Address */}
          <DetailRow
            label="IP address"
            value={log.ipAddress}
            className="font-mono"
          />

          {/* Execution Time */}
          <DetailRow label="Execution time" value={log.executionTime} />

          {/* Log Level */}
          <DetailRow label="Log level" value={log.logLevel} />

          {/* Timestamp */}
          <DetailRow label="Timestamp" value={log.timestamp} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
