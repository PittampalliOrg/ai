"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle,
  GitBranch,
  AlertCircle,
  Clock,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { AgentSession } from "@/lib/db/schema";
import { formatDistanceToNow } from "date-fns";

interface SessionCardProps {
  session: AgentSession;
}

type SessionStatus = "idle" | "running" | "completed" | "error";

export function SessionCard({ session }: SessionCardProps) {
  const router = useRouter();

  const status = (session.status as SessionStatus) || "idle";

  const getStatusColor = (status: SessionStatus) => {
    switch (status) {
      case "running":
        return "bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300";
      case "completed":
        return "bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300";
      case "error":
        return "bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300";
      default:
        return "bg-gray-200 dark:bg-muted text-gray-700 dark:text-muted-foreground";
    }
  };

  const getStatusIcon = (status: SessionStatus) => {
    switch (status) {
      case "running":
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case "completed":
        return <CheckCircle className="h-4 w-4" />;
      case "error":
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  // Defer relative time calculation to client to avoid hydration mismatch
  const [lastActivity, setLastActivity] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      setLastActivity(
        formatDistanceToNow(new Date(session.updatedAt), { addSuffix: true })
      );
    };
    updateTime();
    // Update every minute
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, [session.updatedAt]);

  return (
    <Card
      className="border-border bg-card hover:bg-muted/50 hover:shadow-primary/3 hover:border-primary/10 group cursor-pointer px-0 py-3 transition-all duration-200 hover:shadow-md"
      onClick={() => {
        router.push(`/agent/${session.id}`);
      }}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-foreground line-clamp-2 text-sm leading-tight">
              {session.title}
            </CardTitle>
            {session.repoPath && (
              <div className="mt-1 flex items-center gap-1">
                <GitBranch className="text-muted-foreground h-2 w-2" />
                <span className="text-muted-foreground truncate text-xs">
                  {session.repoPath}
                </span>
              </div>
            )}
          </div>
          <Badge
            variant="secondary"
            className={cn(
              "text-xs transition-all duration-300 group-hover:scale-105",
              getStatusColor(status)
            )}
          >
            <div className="flex items-center gap-1">
              <div className="transition-transform duration-300 group-hover:rotate-12">
                {getStatusIcon(status)}
              </div>
              <span className="capitalize">{status}</span>
            </div>
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">{lastActivity}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function SessionCardLoading() {
  return (
    <Card className="border-border bg-card px-0 py-3">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-foreground truncate text-sm font-medium">
              <Skeleton className="h-5 w-48" />
            </CardTitle>
            <div className="mt-1 flex items-center gap-1">
              <Skeleton className="h-3 w-3 rounded-full" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
