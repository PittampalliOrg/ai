"use client";

import { useState, useEffect, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  WorkflowStatusBadge,
  PlanTaskStatusBadge,
  ExecutionLogEventBadge,
} from "./workflow-status-badge";
import type { WorkflowEntry, ExecutionLog } from "@/lib/types/workflow";
import { getWorkflowEntryProgress } from "@/lib/types/workflow";
import { formatDistanceToNow, format } from "date-fns";
import { ChevronDown, ChevronRight, Radio, Wifi, WifiOff, Terminal, Wrench } from "lucide-react";
import { WorkflowVisualization } from "./workflow-visualization";
import {
  useWorkflowStream,
  getEventTypeLabel,
  getEventTypeColor,
  type WorkflowStreamEvent,
  type StreamConnectionStatus,
} from "@/hooks/use-workflow-stream";

// ============================================================================
// Helpers
// ============================================================================

function safeFormatDate(dateString: string | undefined, formatStr: string): string | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  return format(date, formatStr);
}

function safeFormatTimeAgo(dateString: string | undefined): string | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  return formatDistanceToNow(date, { addSuffix: true });
}

// ============================================================================
// Section Components
// ============================================================================

interface SectionProps {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  count?: number;
}

function Section({
  title,
  description,
  defaultOpen = true,
  children,
  count,
}: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <CardTitle className="text-lg">{title}</CardTitle>
                {count !== undefined && (
                  <span className="text-sm text-muted-foreground">
                    ({count})
                  </span>
                )}
              </div>
            </div>
            {description && (
              <CardDescription>{description}</CardDescription>
            )}
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ============================================================================
// Overview Section
// ============================================================================

interface OverviewSectionProps {
  workflow: WorkflowEntry;
  onApprove?: () => void;
  onReject?: () => void;
  isApproving?: boolean;
}

function OverviewSection({ workflow, onApprove, onReject, isApproving }: OverviewSectionProps) {
  const progress = getWorkflowEntryProgress(workflow);
  const createdAt = safeFormatDate(workflow.createdAt, "PPpp") ?? "Unknown";
  const updatedAt = safeFormatTimeAgo(workflow.updatedAt);

  // Check if workflow is awaiting approval
  const isAwaitingApproval = workflow.status === "AWAITING_APPROVAL";

  // Get plan info directly from WorkflowEntry
  const planTitle = workflow.plan?.title;
  const planSummary = workflow.plan?.summary;

  return (
    <Section title="Overview">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">Instance ID</p>
            <p className="font-mono text-sm">{workflow.id}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <WorkflowStatusBadge status={workflow.status} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Created</p>
            <p className="text-sm">{createdAt}</p>
          </div>
          {updatedAt && (
            <div>
              <p className="text-sm text-muted-foreground">Last Updated</p>
              <p className="text-sm">{updatedAt}</p>
            </div>
          )}
        </div>

        {/* Plan Summary */}
        {(planTitle || planSummary) && (
          <>
            <Separator />
            <div>
              <p className="text-sm text-muted-foreground mb-1">Plan</p>
              <p className="font-medium">{planTitle || "Untitled Plan"}</p>
              {planSummary && (
                <p className="text-sm text-muted-foreground mt-1">{planSummary}</p>
              )}
            </div>
          </>
        )}

        {workflow.plan?.tasks && workflow.plan.tasks.length > 0 && (
          <>
            <Separator />
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Plan Progress</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          </>
        )}

        {/* Approval Actions */}
        {isAwaitingApproval && onApprove && onReject && (
          <>
            <Separator />
            <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-3">
                This workflow is awaiting your approval to proceed with execution.
              </p>
              <div className="flex gap-3">
                <Button
                  onClick={onApprove}
                  disabled={isApproving}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {isApproving ? "Processing..." : "Approve & Execute"}
                </Button>
                <Button
                  onClick={onReject}
                  disabled={isApproving}
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950"
                >
                  Reject
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Section>
  );
}

// ============================================================================
// Visualization Section
// ============================================================================

interface VisualizationSectionProps {
  workflow: WorkflowEntry;
}

function VisualizationSection({ workflow }: VisualizationSectionProps) {
  return (
    <Section title="Workflow Visualization" description="Visual representation of the workflow plan">
      <WorkflowVisualization workflow={workflow} height={500} />
    </Section>
  );
}

// ============================================================================
// Plan Tasks Section (New Orchestrator Format)
// ============================================================================

interface PlanTasksSectionProps {
  workflow: WorkflowEntry;
}

function PlanTasksSection({ workflow }: PlanTasksSectionProps) {
  const tasks = workflow.plan?.tasks || [];

  if (tasks.length === 0) {
    return (
      <Section title="Plan Tasks" count={0}>
        <p className="text-sm text-muted-foreground">No plan tasks available</p>
      </Section>
    );
  }

  return (
    <Section title="Plan Tasks" count={tasks.length}>
      <ScrollArea className="h-[400px] pr-4">
        <div className="space-y-3">
          {tasks.map((task, index) => (
            <div
              key={task.id || index}
              className="p-3 border rounded-lg space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-muted-foreground">
                    #{index + 1}
                  </span>
                  <PlanTaskStatusBadge status={task.status} size="sm" />
                </div>
                {task.dependsOn && task.dependsOn.length > 0 && (
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    Depends on: {task.dependsOn.join(", ")}
                  </span>
                )}
              </div>
              <p className="text-sm font-medium">{task.title}</p>
              {task.description && (
                <p className="text-xs text-muted-foreground">{task.description}</p>
              )}
              {task.result && (
                <div className="bg-muted p-2 rounded text-xs font-mono whitespace-pre-wrap overflow-auto max-h-32">
                  {task.result}
                </div>
              )}
              {task.error && (
                <div className="bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 p-2 rounded text-xs font-mono whitespace-pre-wrap overflow-auto max-h-32">
                  {task.error}
                </div>
              )}
              {task.completedAt && safeFormatDate(task.completedAt, "PPpp") && (
                <p className="text-xs text-muted-foreground">
                  Completed: {safeFormatDate(task.completedAt, "PPpp")}
                </p>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </Section>
  );
}

// ============================================================================
// Execution Logs Section (New Orchestrator Format)
// ============================================================================

interface ExecutionLogsSectionProps {
  workflow: WorkflowEntry;
}

function ExecutionLogsSection({ workflow }: ExecutionLogsSectionProps) {
  const logs = workflow.execution?.logs || [];

  if (logs.length === 0) {
    return (
      <Section title="Execution Logs" count={0} defaultOpen={false}>
        <p className="text-sm text-muted-foreground">No execution logs yet</p>
      </Section>
    );
  }

  return (
    <Section title="Execution Logs" count={logs.length} defaultOpen={false}>
      <ScrollArea className="h-[400px] pr-4">
        <div className="space-y-3">
          {logs.map((log: ExecutionLog, index: number) => (
            <div
              key={`${log.taskId}-${index}`}
              className="p-3 border rounded-lg space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ExecutionLogEventBadge event={log.event} size="sm" />
                  <span className="text-xs font-mono text-muted-foreground">
                    {log.taskId}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {safeFormatDate(log.timestamp, "PPpp") ?? "Unknown"}
                </span>
              </div>
              {log.message && (
                <p className="text-sm">{log.message}</p>
              )}
              {log.details != null ? (
                <div className="bg-muted p-2 rounded text-xs font-mono whitespace-pre-wrap overflow-auto max-h-32">
                  {String(typeof log.details === "string" ? log.details : JSON.stringify(log.details, null, 2))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </ScrollArea>
    </Section>
  );
}

// ============================================================================
// Live Stream Section
// ============================================================================

interface LiveStreamSectionProps {
  workflowId: string;
  isActive: boolean;
}

function LiveStreamSection({ workflowId, isActive }: LiveStreamSectionProps) {
  const {
    events,
    status,
    isConnected,
    latestChunk,
    latestToolCall,
    accumulatedText,
    reconnectAttempts,
    disconnect,
    connect,
    clearEvents,
    getEventsByType,
  } = useWorkflowStream(isActive ? workflowId : null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  const llmChunks = getEventsByType("llm_chunk");
  const toolCalls = getEventsByType("tool_call");
  const toolResults = getEventsByType("tool_result");

  const getStatusIcon = (s: StreamConnectionStatus) => {
    switch (s) {
      case "connected":
        return <Wifi className="h-4 w-4 text-green-500" />;
      case "connecting":
      case "reconnecting":
        return <Radio className="h-4 w-4 text-yellow-500 animate-pulse" />;
      default:
        return <WifiOff className="h-4 w-4 text-red-500" />;
    }
  };

  const getStatusLabel = (s: StreamConnectionStatus) => {
    switch (s) {
      case "connected":
        return "Connected";
      case "connecting":
        return "Connecting...";
      case "reconnecting":
        return `Reconnecting (${reconnectAttempts})...`;
      case "error":
        return "Connection Error";
      default:
        return "Disconnected";
    }
  };

  if (!isActive) {
    return (
      <Section title="Live Stream" description="Real-time agent activity" defaultOpen={false}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <WifiOff className="h-4 w-4" />
          <span>Workflow is not active. Live streaming available during execution.</span>
        </div>
      </Section>
    );
  }

  return (
    <Section title="Live Stream" description="Real-time agent activity">
      <div className="space-y-4">
        {/* Connection Status Bar */}
        <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
          <div className="flex items-center gap-3">
            {getStatusIcon(status)}
            <span className="text-sm font-medium">{getStatusLabel(status)}</span>
            <Badge variant="outline" className="text-xs">
              {events.length} events
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAutoScroll(!autoScroll)}
              className={autoScroll ? "text-green-600" : "text-muted-foreground"}
            >
              {autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
            </Button>
            <Button size="sm" variant="outline" onClick={clearEvents}>
              Clear
            </Button>
            {isConnected ? (
              <Button size="sm" variant="outline" onClick={disconnect}>
                Disconnect
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={connect}>
                Connect
              </Button>
            )}
          </div>
        </div>

        {/* Live Output Display */}
        {accumulatedText && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
              <Terminal className="h-4 w-4" />
              <span>Agent Response</span>
            </div>
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3 max-h-48 overflow-auto">
              <pre className="text-sm whitespace-pre-wrap font-mono">{accumulatedText}</pre>
            </div>
          </div>
        )}

        {/* Latest Tool Call */}
        {latestToolCall && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-purple-700 dark:text-purple-400">
              <Wrench className="h-4 w-4" />
              <span>Current Tool</span>
            </div>
            <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
              <p className="text-sm font-medium">{latestToolCall.toolName}</p>
              {latestToolCall.toolInput != null && (
                <pre className="text-xs text-muted-foreground mt-1 truncate">
                  {typeof latestToolCall.toolInput === "string"
                    ? latestToolCall.toolInput.substring(0, 100)
                    : JSON.stringify(latestToolCall.toolInput, null, 2).substring(0, 200)}
                </pre>
              )}
            </div>
          </div>
        )}

        {/* Event Stream */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Event Log</p>
            <div className="flex gap-2 text-xs text-muted-foreground">
              <span>LLM: {llmChunks.length}</span>
              <span>Tools: {toolCalls.length}</span>
              <span>Results: {toolResults.length}</span>
            </div>
          </div>
          <div
            ref={scrollRef}
            className="border rounded-lg h-64 overflow-auto bg-muted/20"
          >
            {events.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                Waiting for events...
              </div>
            ) : (
              <div className="divide-y divide-border">
                {events.slice(-100).map((event, idx) => (
                  <StreamEventRow key={event.id || idx} event={event} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

/**
 * Single event row in the stream log
 */
function StreamEventRow({ event }: { event: WorkflowStreamEvent }) {
  const [expanded, setExpanded] = useState(false);
  const timestamp = safeFormatDate(event.receivedAt, "HH:mm:ss.SSS")
    ?? safeFormatDate(event.timestamp, "HH:mm:ss.SSS")
    ?? "--:--:--.---";

  // Skip heartbeat events in display
  if (event.type === "heartbeat") return null;

  return (
    <div
      className="px-3 py-2 hover:bg-muted/50 cursor-pointer text-sm"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-muted-foreground w-24">
          {timestamp}
        </span>
        <Badge variant="outline" className={`text-xs ${getEventTypeColor(event.type)}`}>
          {getEventTypeLabel(event.type)}
        </Badge>
        {event.agentId && (
          <span className="text-xs text-muted-foreground">{event.agentId}</span>
        )}
        <span className="text-xs text-muted-foreground truncate flex-1">
          {event.data?.content?.substring(0, 50) ||
            event.data?.toolName ||
            event.data?.status ||
            event.data?.error ||
            ""}
        </span>
      </div>
      {expanded && (
        <div className="mt-2 ml-24">
          <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">
            {JSON.stringify(event.data ?? {}, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// WorkflowDetail
// ============================================================================

interface WorkflowDetailProps {
  workflow: WorkflowEntry;
  onApprove?: () => void;
  onReject?: () => void;
  isApproving?: boolean;
}

/**
 * Full detail view for a workflow instance (uses WorkflowEntry format)
 */
export function WorkflowDetail({ workflow, onApprove, onReject, isApproving }: WorkflowDetailProps) {
  // Determine if workflow is actively executing (stream should be active)
  const isExecuting = workflow.status === "EXECUTING" || workflow.status === "PLANNING";

  return (
    <div className="space-y-4">
      <OverviewSection
        workflow={workflow}
        onApprove={onApprove}
        onReject={onReject}
        isApproving={isApproving}
      />
      {/* Live Stream Section - shows real-time agent activity */}
      <LiveStreamSection workflowId={workflow.id} isActive={isExecuting} />
      <VisualizationSection workflow={workflow} />
      <PlanTasksSection workflow={workflow} />
      <ExecutionLogsSection workflow={workflow} />
    </div>
  );
}

// ============================================================================
// Skeleton
// ============================================================================

export function WorkflowDetailSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <div className="h-6 w-32 bg-muted animate-pulse rounded" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="h-4 w-full bg-muted animate-pulse rounded" />
              <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
              <div className="h-4 w-1/2 bg-muted animate-pulse rounded" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
