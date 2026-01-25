"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  BoxIcon,
  RefreshCwIcon,
  XCircleIcon,
  CheckCircleIcon,
  LoaderIcon,
  AlertCircleIcon,
  ServerIcon,
} from "lucide-react";

interface SandboxStatusData {
  config: {
    mode: "local" | "k8s";
    namespace: string;
    templateName: string;
  };
  availability: {
    available: boolean;
    reason?: string;
  };
  session: {
    id: string;
    sandboxClaimName: string | null;
    sandboxPodName: string | null;
    sandboxNamespace: string | null;
    sandboxStatus: string | null;
  };
  sandbox: {
    claimName: string;
    podName: string;
    podIP?: string;
    phase: string;
    workdir: string;
    provisionedAt: string;
  } | null;
  k8sPhase: string | null;
}

interface SandboxStatusProps {
  sessionId: string;
  compact?: boolean;
  showDetails?: boolean;
  onRelease?: () => void;
}

const statusConfig = {
  pending: {
    icon: LoaderIcon,
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    label: "Provisioning",
    description: "Sandbox is being provisioned from warm pool",
  },
  bound: {
    icon: LoaderIcon,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    label: "Bound",
    description: "Sandbox has been allocated, starting up",
  },
  ready: {
    icon: CheckCircleIcon,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    label: "Ready",
    description: "Sandbox is running and ready for commands",
  },
  failed: {
    icon: XCircleIcon,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    label: "Failed",
    description: "Sandbox provisioning failed",
  },
  released: {
    icon: AlertCircleIcon,
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    label: "Released",
    description: "Sandbox has been released",
  },
  local: {
    icon: ServerIcon,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    label: "Local",
    description: "Running in local mode (no K8s sandbox)",
  },
};

export function SandboxStatus({
  sessionId,
  compact = true,
  showDetails = false,
  onRelease,
}: SandboxStatusProps) {
  const [status, setStatus] = useState<SandboxStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/sandbox?sessionId=${sessionId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch sandbox status");
      }
      const data = await response.json();
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleRelease = async () => {
    try {
      setReleasing(true);
      const response = await fetch(`/api/sandbox?sessionId=${sessionId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to release sandbox");
      }
      await fetchStatus();
      onRelease?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to release");
    } finally {
      setReleasing(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    // Poll for status updates when pending or bound
    const interval = setInterval(() => {
      if (
        status?.session?.sandboxStatus === "pending" ||
        status?.session?.sandboxStatus === "bound"
      ) {
        fetchStatus();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [sessionId, status?.session?.sandboxStatus]);

  if (loading && !status) {
    return (
      <Badge variant="outline" className="gap-1.5">
        <LoaderIcon className="h-3 w-3 animate-spin" />
        <span className="text-xs">Loading...</span>
      </Badge>
    );
  }

  if (error) {
    return (
      <Badge variant="destructive" className="gap-1.5">
        <AlertCircleIcon className="h-3 w-3" />
        <span className="text-xs">Error</span>
      </Badge>
    );
  }

  if (!status) {
    return null;
  }

  // Determine the effective status
  const effectiveStatus =
    status.config.mode === "local"
      ? "local"
      : status.session.sandboxStatus || "pending";

  const config = statusConfig[effectiveStatus as keyof typeof statusConfig] ||
    statusConfig.pending;
  const StatusIcon = config.icon;

  // Compact badge view
  if (compact && !showDetails) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className={`gap-1.5 ${config.bgColor}`}>
              <StatusIcon className={`h-3 w-3 ${config.color}`} />
              <span className="text-xs">{config.label}</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="font-medium">{config.label}</p>
            <p className="text-xs text-muted-foreground">{config.description}</p>
            {status.sandbox?.podName && (
              <p className="text-xs font-mono mt-1">
                Pod: {status.sandbox.podName}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Detailed popover view
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 h-8">
          <BoxIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Sandbox</span>
          <Badge variant="secondary" className={`ml-1 ${config.bgColor}`}>
            <StatusIcon className={`h-3 w-3 mr-1 ${config.color}`} />
            {config.label}
          </Badge>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium flex items-center gap-2">
              <BoxIcon className="h-4 w-4" />
              Sandbox Status
            </h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchStatus}
              disabled={loading}
            >
              <RefreshCwIcon
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>

          <div className="space-y-3">
            {/* Mode */}
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Mode</span>
              <Badge variant="outline">{status.config.mode.toUpperCase()}</Badge>
            </div>

            {/* Status */}
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Status</span>
              <Badge className={config.bgColor}>
                <StatusIcon className={`h-3 w-3 mr-1 ${config.color}`} />
                {config.label}
              </Badge>
            </div>

            {/* K8s Details */}
            {status.config.mode === "k8s" && status.sandbox && (
              <>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Namespace</span>
                  <span className="font-mono text-xs">
                    {status.sandbox.claimName.split("-")[0] ||
                      status.config.namespace}
                  </span>
                </div>

                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Pod</span>
                  <span className="font-mono text-xs truncate max-w-[150px]">
                    {status.sandbox.podName}
                  </span>
                </div>

                {status.sandbox.podIP && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Pod IP</span>
                    <span className="font-mono text-xs">
                      {status.sandbox.podIP}
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Workdir</span>
                  <span className="font-mono text-xs">
                    {status.sandbox.workdir}
                  </span>
                </div>
              </>
            )}

            {/* Availability */}
            {!status.availability.available && (
              <div className="p-2 bg-yellow-500/10 rounded-md text-sm">
                <p className="text-yellow-600 dark:text-yellow-400">
                  {status.availability.reason}
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          {status.config.mode === "k8s" &&
            status.session.sandboxStatus === "ready" && (
              <div className="pt-2 border-t">
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={handleRelease}
                  disabled={releasing}
                >
                  {releasing ? (
                    <LoaderIcon className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <XCircleIcon className="h-4 w-4 mr-2" />
                  )}
                  Release Sandbox
                </Button>
              </div>
            )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
