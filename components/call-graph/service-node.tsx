"use client";

import { memo } from "react";
import { Handle, Position, type Node } from "@xyflow/react";
import { Server, Database, Radio } from "lucide-react";
import { cn } from "@/lib/utils";

interface ServiceNodeData extends Record<string, unknown> {
  label: string;
  type: "service" | "component";
  appId?: string;
  componentType?: string;
}

type ServiceNode = Node<ServiceNodeData, "serviceNode">;

interface ServiceNodeProps {
  data: ServiceNodeData;
  selected?: boolean;
}

function ServiceNodeComponent({ data, selected }: ServiceNodeProps) {
  const isService = data.type === "service";
  const Icon = isService
    ? Server
    : data.componentType?.includes("pubsub")
    ? Radio
    : Database;

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-cyan-500 !border-none !w-2 !h-2"
      />
      <div
        className={cn(
          "px-4 py-3 rounded-lg border shadow-lg min-w-[140px]",
          isService
            ? "bg-[#1e2433] border-cyan-500/30"
            : "bg-[#252c3d] border-purple-500/30",
          selected && "ring-2 ring-cyan-400"
        )}
      >
        <div className="flex items-center gap-2">
          <Icon
            className={cn(
              "h-4 w-4",
              isService ? "text-cyan-400" : "text-purple-400"
            )}
          />
          <span className="text-white text-sm font-medium">{data.label}</span>
        </div>
        {data.componentType && (
          <div className="text-xs text-gray-500 mt-1 ml-6">
            {data.componentType}
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-cyan-500 !border-none !w-2 !h-2"
      />
    </>
  );
}

export const ServiceNode = memo(ServiceNodeComponent);
export type { ServiceNodeData };
