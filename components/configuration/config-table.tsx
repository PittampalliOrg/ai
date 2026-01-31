"use client";

import { useState, useCallback } from "react";
import { Search, Copy, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ConfigItem } from "@/hooks/use-configuration";

interface ConfigTableProps {
  items: ConfigItem[];
  searchTerm: string;
  onSearchChange: (value: string) => void;
  showCategory?: boolean;
  showSource?: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  sandbox: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  dapr: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  observability: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  ai: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  auth: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  redis: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
  workflow: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  flipt: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  kubernetes: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  storage: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  execution: "bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200",
  general: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

function truncateValue(value: string, maxLength: number = 50): string {
  if (value.length <= maxLength) return value;
  return value.substring(0, maxLength) + "...";
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.error("Failed to copy to clipboard");
    }
  }, [value]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleCopy}
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {copied ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copied!" : "Copy value"}</TooltipContent>
    </Tooltip>
  );
}

export function ConfigTable({
  items,
  searchTerm,
  onSearchChange,
  showCategory = true,
  showSource = true,
}: ConfigTableProps) {
  return (
    <TooltipProvider>
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search configuration keys or values..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        {items.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No configuration items found
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">Key</TableHead>
                <TableHead>Value</TableHead>
                {showCategory && <TableHead className="w-[120px]">Category</TableHead>}
                {showSource && <TableHead className="w-[80px]">Source</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.key} className="group">
                  <TableCell className="font-mono text-xs">
                    {item.key}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <div className="flex items-center gap-2">
                      {item.value.length > 50 ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">
                              {truncateValue(item.value)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="max-w-md break-all font-mono text-xs"
                          >
                            {item.value}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span>{item.value}</span>
                      )}
                      <CopyButton value={item.value} />
                    </div>
                  </TableCell>
                  {showCategory && (
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-xs border-0 ${CATEGORY_COLORS[item.category] || CATEGORY_COLORS.general}`}
                      >
                        {item.category}
                      </Badge>
                    </TableCell>
                  )}
                  {showSource && (
                    <TableCell>
                      <Badge
                        variant={item.source === "azure" ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {item.source}
                      </Badge>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </TooltipProvider>
  );
}
