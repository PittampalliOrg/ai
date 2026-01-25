"use client";

import Link from "next/link";
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
import { ServiceStatusBadge } from "@/components/diagrid/service-status-badge";
import type { PubSubService, PaginationState } from "@/lib/types/diagrid-services";
import { cn } from "@/lib/utils";

interface PubSubTableProps {
  services: PubSubService[];
  pagination: PaginationState;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  className?: string;
}

export function PubSubTable({
  services,
  pagination,
  onPageChange,
  onPageSizeChange,
  className,
}: PubSubTableProps) {
  const { page, pageSize, total } = pagination;
  const totalPages = Math.ceil(total / pageSize);
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  return (
    <div className={cn("flex flex-col", className)}>
      <Table>
        <TableHeader>
          <TableRow className="border-gray-700 hover:bg-transparent">
            <TableHead className="text-gray-400">Name</TableHead>
            <TableHead className="text-gray-400">Status</TableHead>
            <TableHead className="text-gray-400">Components</TableHead>
            <TableHead className="text-gray-400">Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {services.map((service) => (
            <TableRow
              key={service.name}
              className="border-gray-700 hover:bg-[#252c3d] cursor-pointer"
            >
              <TableCell>
                <Link
                  href={`/pub-sub/${encodeURIComponent(service.name)}`}
                  className="text-cyan-400 hover:underline"
                >
                  {service.name}
                </Link>
              </TableCell>
              <TableCell>
                <ServiceStatusBadge status={service.status} />
              </TableCell>
              <TableCell className="text-gray-300">
                {service.components.length > 0 ? (
                  <span className="text-cyan-400 hover:underline cursor-pointer">
                    {service.components.join(", ")}
                  </span>
                ) : (
                  <span className="text-gray-500">-</span>
                )}
              </TableCell>
              <TableCell className="text-gray-400">{service.updatedAt}</TableCell>
            </TableRow>
          ))}
          {services.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-gray-500 py-8">
                No pub/sub services found
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
