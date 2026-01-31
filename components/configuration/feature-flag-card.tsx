"use client";

import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import type { FeatureFlag } from "@/hooks/use-configuration";

interface FeatureFlagTableProps {
  flags: FeatureFlag[];
}

export function FeatureFlagTable({ flags }: FeatureFlagTableProps) {
  if (flags.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No feature flags found
      </div>
    );
  }

  return (
    <TooltipProvider>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[250px]">Flag</TableHead>
            <TableHead className="w-[100px]">Status</TableHead>
            <TableHead className="w-[100px]">Type</TableHead>
            <TableHead>Description</TableHead>
            {flags.some((f) => f.variants && f.variants.length > 0) && (
              <TableHead>Variants</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {flags.map((flag) => (
            <TableRow key={flag.key}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-mono text-xs font-medium">
                    {flag.key}
                  </span>
                  {flag.name !== flag.key && (
                    <span className="text-xs text-muted-foreground">
                      {flag.name}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={flag.enabled}
                    disabled
                    aria-label={`${flag.key} is ${flag.enabled ? "enabled" : "disabled"}`}
                  />
                  <span
                    className={`text-xs ${flag.enabled ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}
                  >
                    {flag.enabled ? "On" : "Off"}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    flag.type === "BOOLEAN_FLAG_TYPE" ? "outline" : "secondary"
                  }
                  className="text-xs"
                >
                  {flag.type === "BOOLEAN_FLAG_TYPE" ? "boolean" : "variant"}
                </Badge>
              </TableCell>
              <TableCell className="max-w-[300px]">
                {flag.description ? (
                  flag.description.length > 60 ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-xs text-muted-foreground cursor-help flex items-center gap-1">
                          {flag.description.substring(0, 60)}...
                          <Info className="h-3 w-3" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="max-w-md text-xs"
                      >
                        {flag.description}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {flag.description}
                    </span>
                  )
                ) : (
                  <span className="text-xs text-muted-foreground/50">
                    No description
                  </span>
                )}
              </TableCell>
              {flags.some((f) => f.variants && f.variants.length > 0) && (
                <TableCell>
                  {flag.variants && flag.variants.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {flag.variants.map((variant) => (
                        <Badge
                          key={variant.key}
                          variant="outline"
                          className="text-xs"
                        >
                          {variant.name || variant.key}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TooltipProvider>
  );
}
