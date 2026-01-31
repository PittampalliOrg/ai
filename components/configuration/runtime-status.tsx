"use client";

import { CheckCircle, XCircle, Circle } from "lucide-react";
import type { ConfigurationSources, ConfigurationDebug } from "@/hooks/use-configuration";

interface RuntimeStatusProps {
  sources: ConfigurationSources | undefined;
  debug?: ConfigurationDebug;
}

function StatusIndicator({
  active,
  label,
  detail,
}: {
  active: boolean;
  label: string;
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      {active ? (
        <CheckCircle className="h-4 w-4 text-green-500" />
      ) : (
        <XCircle className="h-4 w-4 text-muted-foreground" />
      )}
      <div className="flex-1">
        <span className="text-sm">{label}</span>
        {detail && (
          <span className="text-xs text-muted-foreground ml-2">({detail})</span>
        )}
      </div>
    </div>
  );
}

export function RuntimeStatus({ sources, debug }: RuntimeStatusProps) {
  if (!sources) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Circle className="h-4 w-4 animate-pulse" />
        <span className="text-sm">Loading status...</span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <StatusIndicator
        active={sources.runtime.initialized}
        label="Config Provider"
        detail={sources.runtime.initialized ? "Initialized" : "Not initialized"}
      />
      <StatusIndicator
        active={sources.runtime.daprEnabled}
        label="Dapr Sidecar"
        detail={sources.runtime.daprEnabled ? "Available" : "Unavailable"}
      />
      <StatusIndicator
        active={true}
        label="Config Source"
        detail={
          sources.runtime.configSource === "dapr"
            ? "Dapr Configuration Store"
            : "Environment Variables"
        }
      />
      <StatusIndicator
        active={sources.azureAppConfig.available}
        label="Azure App Config"
        detail={
          sources.azureAppConfig.available
            ? `${sources.azureAppConfig.itemCount} items`
            : "Not connected"
        }
      />
      <StatusIndicator
        active={sources.flipt.available}
        label="Flipt Feature Flags"
        detail={
          sources.flipt.available
            ? `${sources.flipt.flagCount} flags`
            : "Not connected"
        }
      />

      {/* Debug info */}
      {debug && (
        <div className="mt-4 pt-4 border-t">
          <p className="text-xs text-muted-foreground mb-2 font-medium">Debug Info</p>
          <div className="text-xs text-muted-foreground space-y-1 font-mono">
            <div>Dapr URL: http://{debug.daprHost}:{debug.daprPort}</div>
            <div>Realtime Dapr Check: {debug.realtimeDaprCheck ? "true" : "false"}</div>
            <div>Cached Initialized: {debug.cachedInitialized ? "true" : "false"}</div>
            <div>Cached Dapr Enabled: {debug.cachedDaprEnabled ? "true" : "false"}</div>
          </div>
        </div>
      )}
    </div>
  );
}
