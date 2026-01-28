"use client";

/**
 * Stream Test Dashboard Component
 *
 * Full-page dashboard for visualizing and debugging workflow streaming events.
 * Features:
 * - Workflow selector dropdown
 * - Connection status indicator
 * - Raw event log with timestamps and JSON
 * - Parsed event visualization by type
 * - Agent activity timeline
 * - Latency metrics
 * - Export functionality
 */

import { useState, useEffect, useRef, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Wifi,
  WifiOff,
  Radio,
  Download,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Terminal,
  Wrench,
  AlertCircle,
  CheckCircle,
  Clock,
  Activity,
} from "lucide-react";
import {
  useWorkflowStream,
  getEventTypeLabel,
  getEventTypeColor,
  type WorkflowStreamEvent,
  type WorkflowStreamEventType,
  type StreamConnectionStatus,
} from "@/hooks/use-workflow-stream";
import { useWorkflows } from "@/hooks/use-workflows";
import { format, formatDistanceToNow } from "date-fns";

// ============================================================================
// Connection Status Component
// ============================================================================

interface ConnectionStatusProps {
  status: StreamConnectionStatus;
  reconnectAttempts: number;
  eventCount: number;
  onConnect: () => void;
  onDisconnect: () => void;
}

function ConnectionStatus({
  status,
  reconnectAttempts,
  eventCount,
  onConnect,
  onDisconnect,
}: ConnectionStatusProps) {
  const getStatusConfig = () => {
    switch (status) {
      case "connected":
        return {
          icon: <Wifi className="h-5 w-5 text-green-500" />,
          label: "Connected",
          color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
        };
      case "connecting":
        return {
          icon: <Radio className="h-5 w-5 text-yellow-500 animate-pulse" />,
          label: "Connecting...",
          color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
        };
      case "reconnecting":
        return {
          icon: <RefreshCw className="h-5 w-5 text-yellow-500 animate-spin" />,
          label: `Reconnecting (${reconnectAttempts})...`,
          color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
        };
      case "error":
        return {
          icon: <AlertCircle className="h-5 w-5 text-red-500" />,
          label: "Error",
          color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
        };
      default:
        return {
          icon: <WifiOff className="h-5 w-5 text-gray-500" />,
          label: "Disconnected",
          color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className="flex items-center gap-4">
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${config.color}`}>
        {config.icon}
        <span className="font-medium">{config.label}</span>
      </div>
      <Badge variant="outline" className="text-sm">
        {eventCount} events
      </Badge>
      {status === "connected" ? (
        <Button size="sm" variant="outline" onClick={onDisconnect}>
          Disconnect
        </Button>
      ) : status !== "connecting" && status !== "reconnecting" ? (
        <Button size="sm" onClick={onConnect}>
          Connect
        </Button>
      ) : null}
    </div>
  );
}

// ============================================================================
// Raw Event Log Component
// ============================================================================

interface RawEventLogProps {
  events: WorkflowStreamEvent[];
  autoScroll: boolean;
}

function RawEventLog({ events, autoScroll }: RawEventLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  const toggleExpanded = (eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  return (
    <div ref={scrollRef} className="h-[500px] overflow-auto font-mono text-xs">
      {events.length === 0 ? (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          No events received yet...
        </div>
      ) : (
        <div className="divide-y divide-border">
          {events.map((event, idx) => {
            const isExpanded = expandedEvents.has(event.id);
            const timestamp = event.receivedAt
              ? format(new Date(event.receivedAt), "HH:mm:ss.SSS")
              : format(new Date(event.timestamp), "HH:mm:ss.SSS");

            return (
              <div
                key={event.id || idx}
                className="p-2 hover:bg-muted/50 cursor-pointer"
                onClick={() => toggleExpanded(event.id)}
              >
                <div className="flex items-start gap-2">
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3 mt-1 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3 w-3 mt-1 text-muted-foreground" />
                  )}
                  <span className="text-muted-foreground">[{timestamp}]</span>
                  <span className={getEventTypeColor(event.type)}>{event.type}</span>
                  {event.agentId && (
                    <span className="text-blue-500">{event.agentId}</span>
                  )}
                </div>
                {isExpanded && (
                  <pre className="mt-2 ml-5 p-2 bg-muted rounded text-xs overflow-auto">
                    {JSON.stringify(event, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Parsed Event View Component
// ============================================================================

interface ParsedEventViewProps {
  events: WorkflowStreamEvent[];
}

function ParsedEventView({ events }: ParsedEventViewProps) {
  const eventsByType = useMemo(() => {
    const groups: Record<WorkflowStreamEventType, WorkflowStreamEvent[]> = {
      initial: [],
      llm_chunk: [],
      thinking: [],
      tool_call: [],
      tool_result: [],
      file_changed: [],
      task_progress: [],
      task_completed: [],
      heartbeat: [],
      stream_timeout: [],
      error: [],
    };

    for (const event of events) {
      if (groups[event.type]) {
        groups[event.type].push(event);
      }
    }

    return groups;
  }, [events]);

  const sections = [
    { type: "llm_chunk" as const, label: "LLM Chunks", icon: Terminal },
    { type: "tool_call" as const, label: "Tool Calls", icon: Wrench },
    { type: "tool_result" as const, label: "Tool Results", icon: CheckCircle },
    { type: "task_progress" as const, label: "Progress Events", icon: Activity },
    { type: "task_completed" as const, label: "Completed Tasks", icon: CheckCircle },
    { type: "error" as const, label: "Errors", icon: AlertCircle },
  ];

  return (
    <div className="h-[500px] overflow-auto">
      <div className="space-y-4 p-4">
        {sections.map(({ type, label, icon: Icon }) => (
          <Collapsible key={type} defaultOpen={eventsByType[type].length > 0}>
            <CollapsibleTrigger asChild>
              <div className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-muted">
                <Icon className={`h-4 w-4 ${getEventTypeColor(type)}`} />
                <span className="font-medium">{label}</span>
                <Badge variant="secondary" className="ml-auto">
                  {eventsByType[type].length}
                </Badge>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="pl-6 space-y-2 mt-2">
                {eventsByType[type].length === 0 ? (
                  <p className="text-sm text-muted-foreground">No events</p>
                ) : (
                  eventsByType[type].slice(-20).map((event, idx) => (
                    <ParsedEventItem key={event.id || idx} event={event} type={type} />
                  ))
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    </div>
  );
}

function ParsedEventItem({
  event,
  type,
}: {
  event: WorkflowStreamEvent;
  type: WorkflowStreamEventType;
}) {
  const timestamp = event.receivedAt
    ? format(new Date(event.receivedAt), "HH:mm:ss")
    : format(new Date(event.timestamp), "HH:mm:ss");

  const renderContent = () => {
    switch (type) {
      case "llm_chunk":
        return (
          <span className="text-green-600 dark:text-green-400">
            {event.data.content?.substring(0, 100)}
            {(event.data.content?.length ?? 0) > 100 ? "..." : ""}
          </span>
        );
      case "tool_call":
        return (
          <span>
            <span className="font-medium text-purple-600 dark:text-purple-400">
              {event.data.toolName}
            </span>
            {event.data.toolInput != null && (
              <span className="text-muted-foreground ml-2">
                ({typeof event.data.toolInput === "string"
                  ? event.data.toolInput.substring(0, 50)
                  : JSON.stringify(event.data.toolInput).substring(0, 50)}
                )
              </span>
            )}
          </span>
        );
      case "tool_result":
        return (
          <span className="text-indigo-600 dark:text-indigo-400">
            {event.data.toolOutput?.substring(0, 100)}
            {(event.data.toolOutput?.length ?? 0) > 100 ? "..." : ""}
          </span>
        );
      case "task_progress":
        return (
          <span className="text-yellow-600 dark:text-yellow-400">
            {event.data.status}
          </span>
        );
      case "task_completed":
        return (
          <span className="text-emerald-600 dark:text-emerald-400">
            Task {event.taskId} completed
          </span>
        );
      case "error":
        return (
          <span className="text-red-600 dark:text-red-400">{event.data.error}</span>
        );
      default:
        return <span>{JSON.stringify(event.data)}</span>;
    }
  };

  return (
    <div className="flex items-start gap-2 text-sm p-2 bg-muted/30 rounded">
      <span className="text-xs text-muted-foreground font-mono">{timestamp}</span>
      <div className="flex-1 break-words">{renderContent()}</div>
    </div>
  );
}

// ============================================================================
// Agent Timeline Component
// ============================================================================

interface AgentTimelineProps {
  events: WorkflowStreamEvent[];
}

function AgentTimeline({ events }: AgentTimelineProps) {
  const agentEvents = useMemo(() => {
    const byAgent: Record<string, WorkflowStreamEvent[]> = {};

    for (const event of events) {
      const agent = event.agentId ?? "unknown";
      if (!byAgent[agent]) {
        byAgent[agent] = [];
      }
      byAgent[agent].push(event);
    }

    return byAgent;
  }, [events]);

  const agents = Object.keys(agentEvents);

  if (agents.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        No agent activity yet
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {agents.map((agent) => {
        const agentEvts = agentEvents[agent];
        const firstEvent = agentEvts[0];
        const lastEvent = agentEvts[agentEvts.length - 1];
        const toolCalls = agentEvts.filter((e) => e.type === "tool_call").length;
        const llmChunks = agentEvts.filter((e) => e.type === "llm_chunk").length;
        const errors = agentEvts.filter((e) => e.type === "error").length;

        return (
          <div key={agent} className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    agent === "claude-code-agent"
                      ? "bg-purple-500"
                      : agent === "claude-planner"
                      ? "bg-blue-500"
                      : "bg-gray-500"
                  }`}
                />
                <span className="font-medium">{agent}</span>
              </div>
              <div className="flex gap-2 text-xs">
                <Badge variant="outline">Events: {agentEvts.length}</Badge>
                <Badge variant="outline">Tools: {toolCalls}</Badge>
                <Badge variant="outline">LLM: {llmChunks}</Badge>
                {errors > 0 && (
                  <Badge variant="destructive">Errors: {errors}</Badge>
                )}
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              <span>
                Started:{" "}
                {format(new Date(firstEvent.timestamp), "HH:mm:ss")}
              </span>
              <span className="mx-2">→</span>
              <span>
                Last activity:{" "}
                {formatDistanceToNow(new Date(lastEvent.timestamp), {
                  addSuffix: true,
                })}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Latency Metrics Component
// ============================================================================

interface LatencyMetricsProps {
  events: WorkflowStreamEvent[];
}

function LatencyMetrics({ events }: LatencyMetricsProps) {
  const metrics = useMemo(() => {
    if (events.length < 2) {
      return { avg: 0, min: 0, max: 0, total: 0 };
    }

    const latencies: number[] = [];
    for (let i = 1; i < events.length; i++) {
      const prev = new Date(events[i - 1].timestamp).getTime();
      const curr = new Date(events[i].timestamp).getTime();
      latencies.push(curr - prev);
    }

    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const min = Math.min(...latencies);
    const max = Math.max(...latencies);
    const total =
      new Date(events[events.length - 1].timestamp).getTime() -
      new Date(events[0].timestamp).getTime();

    return { avg: Math.round(avg), min, max, total };
  }, [events]);

  return (
    <div className="grid grid-cols-4 gap-4 p-4">
      <div className="text-center">
        <p className="text-2xl font-bold">{metrics.avg}ms</p>
        <p className="text-sm text-muted-foreground">Avg Interval</p>
      </div>
      <div className="text-center">
        <p className="text-2xl font-bold">{metrics.min}ms</p>
        <p className="text-sm text-muted-foreground">Min Interval</p>
      </div>
      <div className="text-center">
        <p className="text-2xl font-bold">{metrics.max}ms</p>
        <p className="text-sm text-muted-foreground">Max Interval</p>
      </div>
      <div className="text-center">
        <p className="text-2xl font-bold">{(metrics.total / 1000).toFixed(1)}s</p>
        <p className="text-sm text-muted-foreground">Total Duration</p>
      </div>
    </div>
  );
}

// ============================================================================
// Main Dashboard Component
// ============================================================================

export function StreamDashboard() {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Fetch available workflows
  const { workflows, isLoading: workflowsLoading } = useWorkflows(10000);

  // Stream connection
  const {
    events,
    status,
    isConnected,
    reconnectAttempts,
    error,
    connect,
    disconnect,
    clearEvents,
  } = useWorkflowStream(selectedWorkflowId, {
    maxEvents: 2000,
    autoReconnect: true,
  });

  // Export events as JSON
  const handleExport = () => {
    const exportData = {
      workflowId: selectedWorkflowId,
      exportedAt: new Date().toISOString(),
      eventCount: events.length,
      events,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stream-events-${selectedWorkflowId || "unknown"}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Filter to active/recent workflows
  const activeWorkflows = workflows.filter(
    (w) =>
      w.status === "EXECUTING" ||
      w.status === "PLANNING" ||
      w.status === "AWAITING_APPROVAL"
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Stream Test Dashboard</h1>
          <p className="text-muted-foreground">
            Real-time visualization of workflow streaming events
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExport} disabled={events.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" onClick={clearEvents} disabled={events.length === 0}>
            <Trash2 className="h-4 w-4 mr-2" />
            Clear
          </Button>
        </div>
      </div>

      {/* Workflow Selector and Status */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Workflow</label>
                <Select
                  value={selectedWorkflowId ?? undefined}
                  onValueChange={setSelectedWorkflowId}
                >
                  <SelectTrigger className="w-[300px]">
                    <SelectValue placeholder="Select a workflow..." />
                  </SelectTrigger>
                  <SelectContent>
                    {workflowsLoading ? (
                      <SelectItem value="loading" disabled>
                        Loading workflows...
                      </SelectItem>
                    ) : activeWorkflows.length === 0 ? (
                      <SelectItem value="none" disabled>
                        No active workflows
                      </SelectItem>
                    ) : (
                      activeWorkflows.map((w) => (
                        <SelectItem key={w.instanceId} value={w.instanceId}>
                          <span className="flex items-center gap-2">
                            <Badge
                              variant={
                                w.status === "EXECUTING"
                                  ? "default"
                                  : w.status === "PLANNING"
                                  ? "secondary"
                                  : "outline"
                              }
                              className="text-xs"
                            >
                              {w.status}
                            </Badge>
                            {w.instanceId.substring(0, 8)}...
                          </span>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant={autoScroll ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAutoScroll(!autoScroll)}
                >
                  <Clock className="h-4 w-4 mr-1" />
                  Auto-scroll {autoScroll ? "ON" : "OFF"}
                </Button>
              </div>
            </div>

            <ConnectionStatus
              status={status}
              reconnectAttempts={reconnectAttempts}
              eventCount={events.length}
              onConnect={connect}
              onDisconnect={disconnect}
            />
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-300">
                Error: {error.message}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Latency Metrics */}
      {events.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Latency Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <LatencyMetrics events={events} />
          </CardContent>
        </Card>
      )}

      {/* Main Content Area */}
      <div className="grid grid-cols-2 gap-6">
        {/* Raw Event Log */}
        <Card>
          <CardHeader>
            <CardTitle>Raw Event Log</CardTitle>
            <CardDescription>
              Click on events to expand JSON details
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <RawEventLog events={events} autoScroll={autoScroll} />
          </CardContent>
        </Card>

        {/* Parsed View */}
        <Card>
          <CardHeader>
            <CardTitle>Parsed View</CardTitle>
            <CardDescription>Events grouped by type</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ParsedEventView events={events} />
          </CardContent>
        </Card>
      </div>

      {/* Agent Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Agent Timeline</CardTitle>
          <CardDescription>Activity breakdown by agent</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <AgentTimeline events={events} />
        </CardContent>
      </Card>
    </div>
  );
}
