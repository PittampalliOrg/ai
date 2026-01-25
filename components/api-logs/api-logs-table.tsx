"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApiLogEntry, PaginationState } from "@/lib/types/diagrid-services";

interface ApiLogsTableProps {
  logs: ApiLogEntry[];
  pagination: PaginationState;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onRowClick: (log: ApiLogEntry) => void;
  selectedLogId?: string;
  className?: string;
}

function StatusBadge({ status, statusCode }: { status: string; statusCode: string }) {
  const isOk = statusCode === "OK";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        isOk
          ? "bg-green-500/20 text-green-400 border border-green-500/30"
          : "bg-red-500/20 text-red-400 border border-red-500/30"
      )}
    >
      {status}
    </span>
  );
}

export function ApiLogsTable({
  logs,
  pagination,
  onPageChange,
  onPageSizeChange,
  onRowClick,
  selectedLogId,
  className,
}: ApiLogsTableProps) {
  const { page, pageSize, total } = pagination;
  const totalPages = Math.ceil(total / pageSize);
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  return (
    <div className={cn("flex flex-col", className)}>
      <Table>
        <TableHeader>
          <TableRow className="border-gray-700 hover:bg-transparent">
            <TableHead className="text-gray-400">App ID</TableHead>
            <TableHead className="text-gray-400">Status</TableHead>
            <TableHead className="text-gray-400">Type</TableHead>
            <TableHead className="text-gray-400">Method</TableHead>
            <TableHead className="text-gray-400">Execution</TableHead>
            <TableHead className="text-gray-400">Timestamp</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow
              key={log.id}
              className={cn(
                "border-gray-700 cursor-pointer transition-colors",
                selectedLogId === log.id
                  ? "bg-[#252c3d]"
                  : "hover:bg-[#252c3d]"
              )}
              onClick={() => onRowClick(log)}
            >
              <TableCell className="text-cyan-400 font-medium">
                {log.appId}
              </TableCell>
              <TableCell>
                <StatusBadge status={log.status} statusCode={log.statusCode} />
              </TableCell>
              <TableCell className="text-gray-300 capitalize">{log.type}</TableCell>
              <TableCell className="text-gray-300 font-mono text-sm max-w-xs truncate">
                {log.method}
              </TableCell>
              <TableCell className="text-gray-400">{log.executionTime}</TableCell>
              <TableCell className="text-gray-400">{log.timestamp}</TableCell>
            </TableRow>
          ))}
          {logs.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                No API logs found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span>Rows per page:</span>
          <Select
            value={pageSize.toString()}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger className="w-16 h-8 bg-transparent border-gray-600">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">
            {total > 0 ? `${startItem}-${endItem} of ${total}` : "0 rows"}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="h-8 w-8 p-0 text-gray-400 hover:text-white hover:bg-[#252c3d]"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="h-8 w-8 p-0 text-gray-400 hover:text-white hover:bg-[#252c3d]"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
