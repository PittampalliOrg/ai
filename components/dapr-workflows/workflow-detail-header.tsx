"use client";

import { useState } from "react";
import { Check, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  getStatusVariant,
  type WorkflowDetail,
} from "@/lib/types/workflow-ui";
import { formatDateTime } from "@/lib/transforms/workflow-ui";

interface WorkflowDetailHeaderProps {
  workflow: WorkflowDetail;
}

export function WorkflowDetailHeader({ workflow }: WorkflowDetailHeaderProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyInstanceId = async () => {
    try {
      await navigator.clipboard.writeText(workflow.instanceId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <div className="space-y-4">
      {/* Instance ID row - Diagrid style */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-400">INSTANCE ID:</span>
        <code className="font-mono text-sm text-white">
          {workflow.instanceId}
        </code>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto py-0 px-0 text-teal-400 hover:text-teal-300 hover:bg-transparent"
          onClick={handleCopyInstanceId}
        >
          {copied ? (
            <span className="flex items-center gap-1">
              <Check className="h-3.5 w-3.5" />
              Copied
            </span>
          ) : (
            "Copy"
          )}
        </Button>
      </div>

      {/* Metadata bar - Diagrid style with vertical layout */}
      <div className="flex flex-wrap gap-8 py-4 px-5 rounded-lg border border-gray-700 bg-[#1e2433]">
        {/* Status */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Status</span>
          <Badge
            variant={getStatusVariant(workflow.status)}
            className={cn(
              "gap-1 w-fit",
              workflow.status === "COMPLETED" && "bg-green-600 hover:bg-green-700",
              workflow.status === "RUNNING" && "bg-amber-500 hover:bg-amber-600",
              workflow.status === "FAILED" && "bg-red-600 hover:bg-red-700"
            )}
          >
            {workflow.status === "COMPLETED" && (
              <Check className="h-3 w-3" />
            )}
            {workflow.status === "RUNNING" && (
              <Circle className="h-2 w-2 fill-current animate-pulse" />
            )}
            {workflow.status}
          </Badge>
        </div>

        {/* App ID */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500 uppercase tracking-wide">App ID</span>
          <span className="text-sm font-medium text-white">{workflow.appId}</span>
        </div>

        {/* Workflow Type */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Type</span>
          <span className="text-sm font-medium text-white">{workflow.workflowType}</span>
        </div>

        {/* Start Time */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Start</span>
          <span className="text-sm font-medium text-white">
            {formatDateTime(workflow.startTime)}
          </span>
        </div>

        {/* End Time */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500 uppercase tracking-wide">End</span>
          <span className="text-sm font-medium text-white">
            {workflow.endTime ? formatDateTime(workflow.endTime) : "-"}
          </span>
        </div>

        {/* Duration */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Duration</span>
          <span className="text-sm font-medium text-white">
            {workflow.executionDuration || "-"}
          </span>
        </div>
      </div>
    </div>
  );
}
