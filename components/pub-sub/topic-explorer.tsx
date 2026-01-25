"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import type { PubSubTopic } from "@/lib/types/diagrid-services";
import { cn } from "@/lib/utils";

interface TopicExplorerProps {
  topics: PubSubTopic[];
  onRefresh: () => void;
  isLoading?: boolean;
  className?: string;
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}

export function TopicExplorer({
  topics,
  onRefresh,
  isLoading,
  className,
}: TopicExplorerProps) {
  return (
    <div className={cn("bg-[#1e2433] rounded-lg border border-gray-700", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <h3 className="text-sm font-medium text-white">Topic explorer</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          className="h-8 px-2 text-gray-400 hover:text-white hover:bg-[#252c3d]"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow className="border-gray-700 hover:bg-transparent">
            <TableHead className="text-gray-400">Topic name</TableHead>
            <TableHead className="text-gray-400 text-right">Subscriber count</TableHead>
            <TableHead className="text-gray-400 text-right">Total message count</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {topics.map((topic) => (
            <TableRow
              key={topic.name}
              className="border-gray-700 hover:bg-[#252c3d]"
            >
              <TableCell className="text-white font-mono text-sm">
                {topic.name}
              </TableCell>
              <TableCell className="text-gray-300 text-right">
                {topic.subscriberCount}
              </TableCell>
              <TableCell className="text-gray-300 text-right font-mono">
                {formatNumber(topic.totalMessageCount)}
              </TableCell>
            </TableRow>
          ))}
          {topics.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-gray-500 py-8">
                No topics found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
