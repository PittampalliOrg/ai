"use client";

/**
 * Pattern Card Component
 *
 * Displays a workflow pattern as a selectable card with metadata.
 */

import Link from "next/link";
import {
  ArrowRight,
  GitBranch,
  GitMerge,
  Network,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { WorkflowPatternMetadata } from "@/lib/workflow-patterns/types";

interface PatternCardProps {
  pattern: WorkflowPatternMetadata;
  className?: string;
}

// Map icon names to components
const ICONS = {
  ArrowRight,
  GitBranch,
  GitMerge,
  Network,
  RefreshCw,
};

// Complexity badge variants
const COMPLEXITY_VARIANTS = {
  beginner: "bg-green-500/10 text-green-500 border-green-500/20",
  intermediate: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  advanced: "bg-red-500/10 text-red-500 border-red-500/20",
};

export function PatternCard({ pattern, className }: PatternCardProps) {
  const Icon = ICONS[pattern.icon as keyof typeof ICONS] || ArrowRight;

  return (
    <Link href={`/workflow-patterns/${pattern.id}`}>
      <Card
        className={cn(
          "group cursor-pointer transition-all hover:border-primary/50 hover:shadow-md",
          className
        )}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg group-hover:text-primary transition-colors">
                  {pattern.name}
                </CardTitle>
              </div>
            </div>
            <Badge
              variant="outline"
              className={cn(
                "text-xs capitalize",
                COMPLEXITY_VARIANTS[pattern.complexity]
              )}
            >
              {pattern.complexity}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <CardDescription className="mb-4 line-clamp-2">
            {pattern.description}
          </CardDescription>
          <div className="flex flex-wrap gap-2">
            {pattern.useCases.slice(0, 2).map((useCase, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {useCase}
              </Badge>
            ))}
            {pattern.useCases.length > 2 && (
              <Badge variant="secondary" className="text-xs">
                +{pattern.useCases.length - 2} more
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
