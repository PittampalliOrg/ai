"use client";

import { ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ConfigSectionProps {
  title: string;
  description?: string;
  source?: string;
  sourceAvailable?: boolean;
  itemCount?: number;
  externalUrl?: string;
  externalLabel?: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  className?: string;
}

export function ConfigSection({
  title,
  description,
  source,
  sourceAvailable = true,
  itemCount,
  externalUrl,
  externalLabel = "Open",
  children,
  defaultExpanded = true,
  className,
}: ConfigSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setExpanded(!expanded)}
              aria-label={expanded ? "Collapse section" : "Expand section"}
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                {title}
                {itemCount !== undefined && (
                  <Badge variant="secondary" className="text-xs">
                    {itemCount}
                  </Badge>
                )}
              </CardTitle>
              {description && (
                <CardDescription className="text-xs mt-1">
                  {description}
                </CardDescription>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {source && (
              <Badge
                variant={sourceAvailable ? "outline" : "secondary"}
                className="text-xs"
              >
                {sourceAvailable ? source : `${source} (unavailable)`}
              </Badge>
            )}
            {externalUrl && (
              <Button
                variant="outline"
                size="sm"
                asChild
                className="gap-1 text-xs"
              >
                <a href={externalUrl} target="_blank" rel="noopener noreferrer">
                  {externalLabel}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      {expanded && <CardContent>{children}</CardContent>}
    </Card>
  );
}
