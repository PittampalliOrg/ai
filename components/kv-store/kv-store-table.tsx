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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { ServiceStatusBadge } from "@/components/diagrid/service-status-badge";
import type { KVStoreService, PaginationState } from "@/lib/types/diagrid-services";
import { cn } from "@/lib/utils";

interface KVStoreTableProps {
  services: KVStoreService[];
  pagination: PaginationState;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  className?: string;
}

export function KVStoreTable({
  services,
  pagination,
  onPageChange,
  onPageSizeChange,
  className,
}: KVStoreTableProps) {
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
                  href={`/kv-store/${encodeURIComponent(service.name)}`}
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 text-cyan-400 hover:text-cyan-300 hover:bg-transparent"
                      >
                        {service.components[0]}
                        {service.components.length > 1 && (
                          <span className="ml-1 text-gray-500">
                            +{service.components.length - 1}
                          </span>
                        )}
                        <ChevronDown className="ml-1 h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-[#1e2433] border-gray-700">
                      {service.components.map((component) => (
                        <DropdownMenuItem
                          key={component}
                          className="text-gray-300 hover:bg-[#252c3d] hover:text-white cursor-pointer"
                        >
                          {component}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
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
                No KV stores found
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
