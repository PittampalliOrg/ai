"use client";

import { memo, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowLeftIcon,
  ArchiveIcon,
  ShareIcon,
  GitPullRequestIcon,
  GitBranchIcon,
} from "@/components/icons";

interface AgentSessionHeaderProps {
  title: string;
  status: "idle" | "running" | "completed" | "error";
  createdAt: Date;
  repositoryOwner?: string;
  repositoryName?: string;
  branchName?: string;
  additions?: number;
  deletions?: number;
  onCreatePR?: () => void;
  onArchive?: () => void;
  onShare?: () => void;
}

export const AgentSessionHeader = memo(function AgentSessionHeader({
  title,
  status,
  createdAt,
  repositoryOwner,
  repositoryName,
  branchName,
  additions = 0,
  deletions = 0,
  onCreatePR,
  onArchive,
  onShare,
}: AgentSessionHeaderProps) {
  // Memoize formatted date to avoid recreation
  const formattedDate = useMemo(() => {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(createdAt);
  }, [createdAt]);

  const hasChanges = additions > 0 || deletions > 0;
  const hasRepo = repositoryOwner && repositoryName;

  return (
    <header className="flex h-14 shrink-0 items-center border-b px-4 gap-4">
      {/* Left section: Back button + Title */}
      <div className="flex items-center gap-3 min-w-0 flex-shrink">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/agent"
                className="flex-shrink-0 flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <ArrowLeftIcon size={18} />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Back to tasks</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <h1 className="font-medium truncate">{title}</h1>
      </div>

      {/* Center section: Metadata (date, repo, branch, stats) */}
      <div className="hidden md:flex items-center gap-3 flex-shrink-0 text-sm text-muted-foreground">
        <span className="whitespace-nowrap" suppressHydrationWarning>{formattedDate}</span>

        {hasRepo && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span className="font-mono text-xs whitespace-nowrap">
              {repositoryOwner}/{repositoryName}
            </span>
            {branchName && (
              <span className="flex items-center gap-1 font-mono text-xs whitespace-nowrap">
                <GitBranchIcon size={12} />
                {branchName}
              </span>
            )}
          </>
        )}

        {hasChanges && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-xs font-mono whitespace-nowrap">
              <span className="text-green-500">+{additions}</span>
              {" "}
              <span className="text-red-500">-{deletions}</span>
            </span>
          </>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right section: Status + Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Badge
          variant={
            status === "running"
              ? "secondary"
              : status === "completed"
                ? "default"
                : status === "error"
                  ? "destructive"
                  : "outline"
          }
        >
          {status === "running" && (
            <span className="mr-1.5 h-2 w-2 animate-pulse rounded-full bg-yellow-500" />
          )}
          {status}
        </Badge>

        <div className="h-4 w-px bg-border" />

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onArchive}
                className="h-8 px-2 text-muted-foreground hover:text-foreground"
              >
                <ArchiveIcon size={16} />
                <span className="ml-1.5 hidden lg:inline">Archive</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Archive task</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onShare}
                className="h-8 px-2 text-muted-foreground hover:text-foreground"
              >
                <ShareIcon size={16} />
                <span className="ml-1.5 hidden lg:inline">Share</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Share task</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="default"
                size="sm"
                onClick={onCreatePR}
                disabled={status !== "completed"}
                className="h-8"
              >
                <GitPullRequestIcon size={16} />
                <span className="ml-1.5">Create PR</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Create a pull request with these changes</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </header>
  );
});
