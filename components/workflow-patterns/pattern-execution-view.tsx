"use client";

/**
 * Pattern Execution View Component
 *
 * Real-time execution progress view with SSE updates.
 * Includes approval UI for human-in-the-loop workflows.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import {
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

interface PatternExecutionViewProps {
  instanceId: string;
  className?: string;
}

interface WorkflowState {
  instanceId: string;
  workflowName: string;
  status: string;
  output?: unknown;
  customStatus?: unknown;
  createdAt: string;
  lastUpdatedAt: string;
}

interface EventMessage {
  type: string;
  timestamp: string;
  data: unknown;
}

// Status badge colors
const STATUS_VARIANTS: Record<string, string> = {
  PENDING: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  RUNNING: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  COMPLETED: "bg-green-500/10 text-green-500 border-green-500/20",
  FAILED: "bg-red-500/10 text-red-500 border-red-500/20",
  TERMINATED: "bg-gray-500/10 text-gray-500 border-gray-500/20",
};

// Status icons
const STATUS_ICONS: Record<string, React.ReactNode> = {
  PENDING: <Circle className="h-4 w-4" />,
  RUNNING: <Loader2 className="h-4 w-4 animate-spin" />,
  COMPLETED: <CheckCircle2 className="h-4 w-4" />,
  FAILED: <XCircle className="h-4 w-4" />,
  TERMINATED: <AlertCircle className="h-4 w-4" />,
};

export function PatternExecutionView({
  instanceId,
  className,
}: PatternExecutionViewProps) {
  const [state, setState] = useState<WorkflowState | null>(null);
  const [events, setEvents] = useState<EventMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [approvalState, setApprovalState] = useState<"pending" | "submitting" | "approved" | "rejected">("pending");
  const [approvalComments, setApprovalComments] = useState("");
  const eventSourceRef = useRef<EventSource | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Check if workflow is waiting for plan approval
  const isWaitingForApproval: boolean =
    state?.status === "RUNNING" &&
    typeof state?.customStatus === "string" &&
    state.customStatus.toLowerCase().includes("waiting for plan approval");

  // Handle plan approval/rejection
  const handleApproval = useCallback(async (approved: boolean) => {
    setApprovalState("submitting");

    try {
      const response = await fetch(
        `/api/workflow-patterns/${instanceId}/event/plan_approval`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            approved,
            comments: approvalComments || undefined,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to submit approval");
      }

      setApprovalState(approved ? "approved" : "rejected");
    } catch (err) {
      console.error("Approval error:", err);
      setApprovalState("pending");
      setError(err instanceof Error ? err.message : "Failed to submit approval");
    }
  }, [instanceId, approvalComments]);

  useEffect(() => {
    // Connect to SSE stream
    const eventSource = new EventSource(
      `/api/workflow-patterns/${instanceId}/stream`
    );
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      setError("Connection lost. Workflow may still be running.");
    };

    // Handle state event
    eventSource.addEventListener("state", (event) => {
      const data = JSON.parse(event.data);
      setState(data);
      setEvents((prev) => [
        ...prev,
        { type: "state", timestamp: new Date().toISOString(), data },
      ]);
    });

    // Handle update event
    eventSource.addEventListener("update", (event) => {
      const data = JSON.parse(event.data);
      setState((prev) => (prev ? { ...prev, ...data } : data));
      setEvents((prev) => [
        ...prev,
        { type: "update", timestamp: new Date().toISOString(), data },
      ]);
    });

    // Handle complete event
    eventSource.addEventListener("complete", (event) => {
      const data = JSON.parse(event.data);
      setState((prev) => (prev ? { ...prev, ...data } : data));
      setEvents((prev) => [
        ...prev,
        { type: "complete", timestamp: new Date().toISOString(), data },
      ]);
      eventSource.close();
      setIsConnected(false);
    });

    // Handle error event
    eventSource.addEventListener("error", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        setError(data.error);
      } catch {
        setError("Unknown error occurred");
      }
      eventSource.close();
      setIsConnected(false);
    });

    // Handle timeout event
    eventSource.addEventListener("timeout", (event) => {
      const data = JSON.parse(event.data);
      setError(data.message);
      eventSource.close();
      setIsConnected(false);
    });

    return () => {
      eventSource.close();
    };
  }, [instanceId]);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  if (error && !state) {
    return (
      <Card className={cn("border-destructive", className)}>
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <XCircle className="h-5 w-5" />
            Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Execution Progress</CardTitle>
          <div className="flex items-center gap-2">
            {isConnected && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                Live
              </div>
            )}
            {state && (
              <Badge
                variant="outline"
                className={cn(STATUS_VARIANTS[state.status] || "")}
              >
                <span className="mr-1.5">{STATUS_ICONS[state.status]}</span>
                {state.status}
              </Badge>
            )}
          </div>
        </div>
        {state && (
          <p className="text-sm text-muted-foreground">
            Instance: {state.instanceId.substring(0, 8)}...
          </p>
        )}
      </CardHeader>
      <Separator />
      <CardContent className="p-0">
        <ScrollArea className="h-[300px]" ref={scrollRef}>
          <div className="p-4 space-y-3">
            {events.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Connecting to workflow...
              </div>
            ) : (
              events.map((event, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 text-sm"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {event.type === "complete" ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : event.type === "error" ? (
                      <XCircle className="h-4 w-4 text-red-500" />
                    ) : (
                      <Circle className="h-4 w-4 text-blue-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium capitalize">
                        {event.type.replace(":", " ")}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <pre className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-all overflow-hidden">
                      {JSON.stringify(event.data, null, 2).substring(0, 500)}
                      {JSON.stringify(event.data, null, 2).length > 500 && "..."}
                    </pre>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Plan Approval Section */}
        {isWaitingForApproval && approvalState === "pending" && (
          <>
            <Separator />
            <div className="p-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20 p-4">
                <div className="flex items-start gap-3">
                  <ClipboardCheck className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 space-y-3">
                    <div>
                      <h4 className="font-medium text-blue-900 dark:text-blue-100">
                        Plan Ready for Review
                      </h4>
                      <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                        The implementation plan has been created. Please review the plan details above and approve or reject it.
                      </p>
                    </div>

                    <Textarea
                      placeholder="Add comments (optional)..."
                      value={approvalComments}
                      onChange={(e) => setApprovalComments(e.target.value)}
                      className="h-20 bg-white dark:bg-gray-950 text-sm"
                    />

                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => handleApproval(true)}
                        className="bg-green-600 hover:bg-green-700 text-white"
                        size="sm"
                      >
                        <ThumbsUp className="h-4 w-4 mr-1.5" />
                        Approve Plan
                      </Button>
                      <Button
                        onClick={() => handleApproval(false)}
                        variant="outline"
                        className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
                        size="sm"
                      >
                        <ThumbsDown className="h-4 w-4 mr-1.5" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Approval Submitting State */}
        {approvalState === "submitting" && (
          <>
            <Separator />
            <div className="p-4">
              <div className="flex items-center justify-center gap-2 text-muted-foreground py-4">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Submitting approval...</span>
              </div>
            </div>
          </>
        )}

        {/* Approval Completed State */}
        {(approvalState === "approved" || approvalState === "rejected") && (
          <>
            <Separator />
            <div className="p-4">
              <div
                className={cn(
                  "rounded-lg border p-4 flex items-center gap-3",
                  approvalState === "approved"
                    ? "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20"
                    : "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20"
                )}
              >
                {approvalState === "approved" ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                )}
                <div>
                  <p
                    className={cn(
                      "font-medium",
                      approvalState === "approved"
                        ? "text-green-900 dark:text-green-100"
                        : "text-red-900 dark:text-red-100"
                    )}
                  >
                    Plan {approvalState === "approved" ? "Approved" : "Rejected"}
                  </p>
                  {approvalComments && (
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {approvalComments}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Output section */}
        {state?.output !== undefined && state.output !== null && (
          <>
            <Separator />
            <div className="p-4">
              <h4 className="text-sm font-medium mb-2">Output</h4>
              <ScrollArea className="h-[200px] rounded-md border bg-muted/50 p-3">
                <pre className="text-xs whitespace-pre-wrap break-all">
                  {JSON.stringify(state.output, null, 2)}
                </pre>
              </ScrollArea>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
