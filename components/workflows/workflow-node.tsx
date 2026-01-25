"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { WorkflowNodeData, WorkflowNode as WorkflowNodeType } from "@/lib/types/workflow-graph";
import { cn } from "@/lib/utils";
import {
  Play,
  Clock,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";

// ============================================================================
// Status Configuration
// ============================================================================

type StatusConfig = {
  bg: string;
  border: string;
  icon: React.ReactNode;
  ring?: string;
};

const statusConfigs: Record<WorkflowNodeData["status"], StatusConfig> = {
  start: {
    bg: "bg-blue-500/20",
    border: "border-blue-500",
    icon: <Play className="h-4 w-4 text-blue-400" />,
  },
  pending: {
    bg: "bg-muted",
    border: "border-muted-foreground/30",
    icon: <Clock className="h-4 w-4 text-muted-foreground" />,
  },
  in_progress: {
    bg: "bg-yellow-500/20",
    border: "border-yellow-500",
    icon: <Loader2 className="h-4 w-4 text-yellow-400 animate-spin" />,
    ring: "ring-2 ring-yellow-500 ring-offset-2 ring-offset-background",
  },
  completed: {
    bg: "bg-green-500/20",
    border: "border-green-500",
    icon: <CheckCircle className="h-4 w-4 text-green-400" />,
  },
  failed: {
    bg: "bg-red-500/20",
    border: "border-red-500",
    icon: <AlertCircle className="h-4 w-4 text-red-400" />,
  },
  skipped: {
    bg: "bg-orange-500/20",
    border: "border-orange-500",
    icon: <AlertCircle className="h-4 w-4 text-orange-400" />,
  },
};

// ============================================================================
// WorkflowNode Component
// ============================================================================

type WorkflowNodeComponentProps = NodeProps<WorkflowNodeType>;

/**
 * Custom node component for workflow visualization
 */
function WorkflowNodeComponent({ data }: WorkflowNodeComponentProps) {
  const nodeData = data as WorkflowNodeData;
  const config = statusConfigs[nodeData.status];

  return (
    <>
      {/* Handles */}
      {nodeData.handles.target && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-3 !h-3 !bg-primary !border-2 !border-background"
        />
      )}
      {nodeData.handles.source && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-3 !h-3 !bg-primary !border-2 !border-background"
        />
      )}

      {/* Node content */}
      <div
        className={cn(
          "rounded-lg border-2 shadow-sm min-w-[200px] max-w-[260px]",
          config.bg,
          config.border,
          config.ring
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-inherit bg-black/10 rounded-t-md">
          <div className="flex items-center gap-2">
            {config.icon}
            <span className="text-sm font-medium text-foreground">
              {nodeData.label as string}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="px-3 py-2">
          <p className="text-xs text-muted-foreground line-clamp-2">
            {nodeData.description}
          </p>
        </div>

        {/* Footer (if completed) */}
        {nodeData.completedAt && (
          <div className="px-3 py-1.5 border-t border-inherit bg-black/10 rounded-b-md">
            <p className="text-xs text-muted-foreground">
              Completed: {format(new Date(nodeData.completedAt as string), "pp")}
            </p>
          </div>
        )}
      </div>
    </>
  );
}

// Memoize to prevent unnecessary re-renders
export const WorkflowNode = memo(WorkflowNodeComponent);
