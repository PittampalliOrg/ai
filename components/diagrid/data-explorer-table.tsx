"use client";

import { useState } from "react";
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
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { KVEntry, PaginationState } from "@/lib/types/diagrid-services";

interface DataExplorerTableProps {
  entries: KVEntry[];
  pagination: PaginationState;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onExpandEntry?: (key: string) => void;
  expandedEntry?: string | null;
  expandedValue?: unknown;
  sortField?: "createdAt" | "updatedAt";
  sortDirection?: "asc" | "desc";
  onSort?: (field: "createdAt" | "updatedAt") => void;
  className?: string;
}

export function DataExplorerTable({
  entries,
  pagination,
  onPageChange,
  onPageSizeChange,
  onExpandEntry,
  expandedEntry,
  expandedValue,
  sortField,
  sortDirection,
  onSort,
  className,
}: DataExplorerTableProps) {
  const { page, pageSize, total } = pagination;
  const totalPages = Math.ceil(total / pageSize);
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  const getSortIcon = (field: "createdAt" | "updatedAt") => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    }
    return sortDirection === "asc" ? (
      <ChevronUp className="h-4 w-4 ml-1" />
    ) : (
      <ChevronDown className="h-4 w-4 ml-1" />
    );
  };

  return (
    <div className={cn("flex flex-col", className)}>
      <Table>
        <TableHeader>
          <TableRow className="border-gray-700 hover:bg-transparent">
            <TableHead className="text-gray-400 w-8"></TableHead>
            <TableHead className="text-gray-400">Key</TableHead>
            <TableHead
              className="text-gray-400 cursor-pointer hover:text-white"
              onClick={() => onSort?.("createdAt")}
            >
              <div className="flex items-center">
                Created at
                {getSortIcon("createdAt")}
              </div>
            </TableHead>
            <TableHead
              className="text-gray-400 cursor-pointer hover:text-white"
              onClick={() => onSort?.("updatedAt")}
            >
              <div className="flex items-center">
                Updated at
                {getSortIcon("updatedAt")}
              </div>
            </TableHead>
            <TableHead className="text-gray-400">Expires at</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <>
              <TableRow
                key={entry.key}
                className={cn(
                  "border-gray-700 hover:bg-[#252c3d] cursor-pointer",
                  expandedEntry === entry.key && "bg-[#252c3d]"
                )}
                onClick={() => onExpandEntry?.(entry.key)}
              >
                <TableCell className="w-8">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-gray-400 hover:text-white"
                  >
                    {expandedEntry === entry.key ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </TableCell>
                <TableCell className="text-white font-mono text-sm">
                  {entry.key}
                </TableCell>
                <TableCell className="text-gray-400">{entry.createdAt}</TableCell>
                <TableCell className="text-gray-400">{entry.updatedAt}</TableCell>
                <TableCell className="text-gray-400">
                  {entry.expiresAt || "-"}
                </TableCell>
              </TableRow>
              {expandedEntry === entry.key && (
                <TableRow
                  key={`${entry.key}-expanded`}
                  className="border-gray-700 bg-[#1a1f2e]"
                >
                  <TableCell colSpan={5} className="p-4">
                    <div className="bg-[#0d1117] rounded-md p-4 font-mono text-sm">
                      <div className="text-gray-400 mb-2">Value:</div>
                      <pre className="text-gray-300 whitespace-pre-wrap overflow-auto max-h-64">
                        {expandedValue !== undefined
                          ? JSON.stringify(expandedValue, null, 2)
                          : "Loading..."}
                      </pre>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </>
          ))}
          {entries.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                No entries found
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
            {total > 0 ? `${startItem}-${endItem} of ${total}` : "0 items"}
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
