"use client";

/**
 * Ralph Workflow Demo/Debug Page
 *
 * A dedicated page for demonstrating and debugging the Ralph Loop workflow.
 * Exposes workflow state, status, metadata, and provides controls for testing.
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  useRalphWorkflow,
  getPlanStatusLabel,
  getItemStatusLabel,
  getStatusColor,
} from "@/hooks/use-ralph-workflow";
import {
  Play,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Zap,
  ListTodo,
  GitBranch,
  MessageSquare,
  ArrowRight,
  Loader2,
  Bug,
  Settings,
  FileCode,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Generate a unique session ID for this demo
function generateDemoSessionId(): string {
  return `demo-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export default function WorkflowDemoPage() {
  // Session and workflow state - initialize empty to avoid hydration mismatch
  const [sessionId, setSessionId] = useState<string>("");
  const [isClient, setIsClient] = useState(false);

  // Generate session ID only on client to avoid hydration mismatch
  useEffect(() => {
    if (!sessionId) {
      setSessionId(generateDemoSessionId());
    }
    setIsClient(true);
  }, []);
  const [prompt, setPrompt] = useState("");
  const [feedback, setFeedback] = useState("");
  const [targetRepo, setTargetRepo] = useState({
    owner: "vpittamp",
    repo: "backstage-app",
    branch: "main",
  });

  // UI state
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showDebugInfo, setShowDebugInfo] = useState(true);
  const [logs, setLogs] = useState<Array<{ time: string; type: string; message: string }>>([]);

  // Ralph workflow hook - only auto-start when sessionId is available
  const workflow = useRalphWorkflow({
    sessionId: sessionId || "placeholder",
    pollInterval: 2000,
    autoStart: autoRefresh && Boolean(sessionId),
    onPlanChange: (plan) => {
      addLog("info", `Plan changed: ${plan?.status || "null"}`);
    },
    onComplete: (plan) => {
      addLog("success", `Workflow completed: ${plan.title}`);
    },
    onError: (error) => {
      addLog("error", `Workflow error: ${error}`);
    },
  });

  // Add log entry
  const addLog = (type: string, message: string) => {
    setLogs((prev) => [
      { time: new Date().toISOString().split("T")[1].split(".")[0], type, message },
      ...prev.slice(0, 99), // Keep last 100 logs
    ]);
  };

  // Handle start workflow
  const handleStartWorkflow = async () => {
    if (!prompt.trim()) {
      addLog("error", "Please enter a prompt");
      return;
    }
    addLog("info", `Starting workflow with prompt: ${prompt.substring(0, 50)}...`);
    const success = await workflow.startWorkflow(prompt, targetRepo);
    if (success) {
      addLog("success", "Workflow started successfully");
    } else {
      addLog("error", "Failed to start workflow");
    }
  };

  // Handle accept plan
  const handleAcceptPlan = async () => {
    addLog("info", "Accepting plan...");
    const success = await workflow.acceptPlan();
    if (success) {
      addLog("success", "Plan accepted, execution starting");
    } else {
      addLog("error", "Failed to accept plan");
    }
  };

  // Handle submit feedback
  const handleSubmitFeedback = async () => {
    if (!feedback.trim()) {
      addLog("error", "Please enter feedback");
      return;
    }
    addLog("info", `Submitting feedback: ${feedback.substring(0, 50)}...`);
    const success = await workflow.submitFeedback(feedback);
    if (success) {
      addLog("success", "Feedback submitted, plan will be updated");
      setFeedback("");
    } else {
      addLog("error", "Failed to submit feedback");
    }
  };

  // Reset demo
  const handleReset = () => {
    setSessionId(generateDemoSessionId());
    setPrompt("");
    setFeedback("");
    setLogs([]);
    addLog("info", "Demo reset with new session ID");
  };

  // Manual refresh
  const handleRefresh = async () => {
    addLog("info", "Refreshing workflow status...");
    await workflow.refresh();
    addLog("success", "Status refreshed");
  };

  // Get status badge variant
  const getStatusBadge = (status: string | null) => {
    if (!status) return <Badge variant="outline">None</Badge>;
    const colorClass = getStatusColor(status as any);
    return (
      <Badge className={cn("capitalize", colorClass)} variant="outline">
        {status}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Bug className="h-8 w-8 text-blue-500" />
              Ralph Workflow Demo
            </h1>
            <p className="text-muted-foreground mt-1">
              Test and debug the Ralph Loop planning workflow
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="auto-refresh"
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
              />
              <Label htmlFor="auto-refresh" className="text-sm">Auto-refresh</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="debug-info"
                checked={showDebugInfo}
                onCheckedChange={setShowDebugInfo}
              />
              <Label htmlFor="debug-info" className="text-sm">Debug info</Label>
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="destructive" size="sm" onClick={handleReset}>
              Reset Demo
            </Button>
          </div>
        </div>

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column - Controls */}
          <div className="space-y-6">
            {/* Session Info */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Session Configuration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Session ID</Label>
                  <Input
                    value={sessionId}
                    onChange={(e) => setSessionId(e.target.value)}
                    className="font-mono text-xs"
                    placeholder="Generating..."
                  />
                </div>
                <Separator />
                <div className="space-y-3">
                  <Label className="text-xs text-muted-foreground">Target Repository</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Owner"
                      value={targetRepo.owner}
                      onChange={(e) => setTargetRepo({ ...targetRepo, owner: e.target.value })}
                    />
                    <Input
                      placeholder="Repo"
                      value={targetRepo.repo}
                      onChange={(e) => setTargetRepo({ ...targetRepo, repo: e.target.value })}
                    />
                  </div>
                  <Input
                    placeholder="Branch"
                    value={targetRepo.branch}
                    onChange={(e) => setTargetRepo({ ...targetRepo, branch: e.target.value })}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Start Workflow */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Play className="h-5 w-5 text-green-500" />
                  Start Workflow
                </CardTitle>
                <CardDescription>Enter a task description to create a plan</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Describe your task for planning...&#10;&#10;Example: Add a user settings page with profile editing and notification preferences"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="min-h-[120px]"
                />
                <Button
                  onClick={handleStartWorkflow}
                  disabled={workflow.isLoading || workflow.isActive}
                  className="w-full"
                >
                  {workflow.isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <ListTodo className="h-4 w-4 mr-2" />
                      Start Planning Workflow
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Plan Actions */}
            {workflow.plan && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-blue-500" />
                    Plan Actions
                  </CardTitle>
                  <CardDescription>
                    {workflow.plan.status === "draft" || workflow.plan.status === "iterating"
                      ? "Review the plan and accept or provide feedback"
                      : "Plan is being executed"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(workflow.plan.status === "draft" || workflow.plan.status === "iterating") && (
                    <>
                      <Button
                        onClick={handleAcceptPlan}
                        className="w-full bg-green-600 hover:bg-green-700"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Accept Plan & Execute
                      </Button>
                      <Separator />
                      <Textarea
                        placeholder="Provide feedback to iterate on the plan..."
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        className="min-h-[80px]"
                      />
                      <Button
                        onClick={handleSubmitFeedback}
                        variant="outline"
                        className="w-full"
                      >
                        <ArrowRight className="h-4 w-4 mr-2" />
                        Submit Feedback
                      </Button>
                    </>
                  )}
                  {workflow.plan.status === "executing" && (
                    <div className="text-center py-4">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-500" />
                      <p className="mt-2 text-sm text-muted-foreground">
                        Executing plan items...
                      </p>
                    </div>
                  )}
                  {workflow.plan.status === "completed" && (
                    <div className="text-center py-4">
                      <CheckCircle className="h-8 w-8 mx-auto text-green-500" />
                      <p className="mt-2 text-sm text-muted-foreground">
                        Plan completed successfully!
                      </p>
                      {workflow.plan.prInfo && (
                        <a
                          href={workflow.plan.prInfo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:underline mt-2 block"
                        >
                          View PR #{workflow.plan.prInfo.number}
                        </a>
                      )}
                    </div>
                  )}
                  {workflow.plan.status === "failed" && (
                    <div className="text-center py-4">
                      <XCircle className="h-8 w-8 mx-auto text-red-500" />
                      <p className="mt-2 text-sm text-muted-foreground">
                        Plan execution failed
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Middle column - Plan View */}
          <div className="space-y-6">
            {/* Workflow Status Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-yellow-500" />
                    Workflow Status
                  </span>
                  {getStatusBadge(workflow.workflowStatus)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Loading:</span>
                    <Badge variant="outline" className="ml-2">
                      {workflow.isLoading ? "Yes" : "No"}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Active:</span>
                    <Badge variant="outline" className="ml-2">
                      {workflow.isActive ? "Yes" : "No"}
                    </Badge>
                  </div>
                  {workflow.error && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Error:</span>
                      <span className="ml-2 text-red-500">{workflow.error}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Plan Details */}
            {workflow.plan ? (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{workflow.plan.title}</CardTitle>
                    {getStatusBadge(workflow.plan.status)}
                  </div>
                  <CardDescription>{workflow.plan.objective}</CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Progress */}
                  {workflow.stats && (
                    <div className="mb-4">
                      <div className="flex justify-between text-sm mb-1">
                        <span>Progress</span>
                        <span>{workflow.stats.percentComplete}%</span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full transition-all"
                          style={{ width: `${workflow.stats.percentComplete}%` }}
                        />
                      </div>
                      <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
                        <span className="text-green-500">{workflow.stats.completed} done</span>
                        <span className="text-blue-500">{workflow.stats.inProgress} running</span>
                        <span className="text-yellow-500">{workflow.stats.pending} pending</span>
                        {workflow.stats.failed > 0 && (
                          <span className="text-red-500">{workflow.stats.failed} failed</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Plan Items */}
                  <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-3">
                      {workflow.plan.items.map((item, index) => (
                        <div
                          key={item.id}
                          className={cn(
                            "p-3 rounded-lg border",
                            item.status === "completed" && "border-green-500/50 bg-green-500/10",
                            item.status === "in_progress" && "border-blue-500/50 bg-blue-500/10",
                            item.status === "failed" && "border-red-500/50 bg-red-500/10",
                            item.status === "pending" && "border-border",
                            item.status === "skipped" && "border-gray-500/50 bg-gray-500/10"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">#{index + 1}</span>
                              {item.status === "completed" && <CheckCircle className="h-4 w-4 text-green-500" />}
                              {item.status === "in_progress" && <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />}
                              {item.status === "failed" && <XCircle className="h-4 w-4 text-red-500" />}
                              {item.status === "pending" && <Clock className="h-4 w-4 text-yellow-500" />}
                              {item.status === "skipped" && <AlertCircle className="h-4 w-4 text-gray-500" />}
                              <span className="font-medium text-sm">{item.title}</span>
                            </div>
                            <Badge variant="outline" className={cn("text-xs", getStatusColor(item.status))}>
                              {getItemStatusLabel(item.status)}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {item.description}
                          </p>
                          {item.files.length > 0 && (
                            <div className="flex items-center gap-1 mt-2">
                              <FileCode className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {item.files.join(", ")}
                              </span>
                            </div>
                          )}
                          {item.result && (
                            <div className="mt-2 p-2 rounded bg-background/50 text-xs">
                              {item.result.success ? (
                                <span className="text-green-500">{item.result.message}</span>
                              ) : (
                                <span className="text-red-500">{item.result.error}</span>
                              )}
                              {item.result.filesModified && item.result.filesModified.length > 0 && (
                                <div className="mt-1 text-muted-foreground">
                                  Modified: {item.result.filesModified.join(", ")}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <ListTodo className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    No active plan. Start a workflow to see the plan here.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right column - Debug Info */}
          <div className="space-y-6">
            {showDebugInfo && (
              <>
                {/* Raw State */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Bug className="h-5 w-5 text-orange-500" />
                      Debug: Workflow State
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="text-sm font-medium mb-2">State</h4>
                      <ScrollArea className="h-[120px]">
                        <pre className="text-xs font-mono bg-muted p-3 rounded">
                          {JSON.stringify(
                            {
                              isLoading: workflow.isLoading,
                              isActive: workflow.isActive,
                              error: workflow.error,
                              workflowStatus: workflow.workflowStatus,
                            },
                            null,
                            2
                          )}
                        </pre>
                      </ScrollArea>
                    </div>
                    <Separator />
                    <div>
                      <h4 className="text-sm font-medium mb-2">Plan (JSON)</h4>
                      <ScrollArea className="h-[150px]">
                        <pre className="text-xs font-mono bg-muted p-3 rounded">
                          {JSON.stringify(workflow.plan, null, 2)}
                        </pre>
                      </ScrollArea>
                    </div>
                    <Separator />
                    <div>
                      <h4 className="text-sm font-medium mb-2">Stats</h4>
                      <ScrollArea className="h-[100px]">
                        <pre className="text-xs font-mono bg-muted p-3 rounded">
                          {JSON.stringify(workflow.stats, null, 2)}
                        </pre>
                      </ScrollArea>
                    </div>
                  </CardContent>
                </Card>

                {/* Metadata */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <GitBranch className="h-5 w-5 text-purple-500" />
                      Debug: Metadata
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Session ID:</span>
                        <code className="text-xs bg-muted px-1 rounded">{sessionId || "Loading..."}</code>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Target Repo:</span>
                        <code className="text-xs bg-muted px-1 rounded">
                          {targetRepo.owner}/{targetRepo.repo}
                        </code>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Branch:</span>
                        <code className="text-xs bg-muted px-1 rounded">{targetRepo.branch}</code>
                      </div>
                      {workflow.plan && (
                        <>
                          <Separator />
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Plan Version:</span>
                            <code className="text-xs bg-muted px-1 rounded">{workflow.plan.version}</code>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Iteration:</span>
                            <code className="text-xs bg-muted px-1 rounded">{workflow.plan.iteration}</code>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Items:</span>
                            <code className="text-xs bg-muted px-1 rounded">{workflow.plan.items.length}</code>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Current Index:</span>
                            <code className="text-xs bg-muted px-1 rounded">{workflow.plan.currentItemIndex}</code>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Created:</span>
                            <code className="text-xs bg-muted px-1 rounded">
                              {new Date(workflow.plan.createdAt).toLocaleString()}
                            </code>
                          </div>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {/* Activity Log */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Activity Log
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setLogs([])}
                    className="text-xs"
                  >
                    Clear
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[250px]">
                  <div className="space-y-1">
                    {logs.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No activity yet
                      </p>
                    ) : (
                      logs.map((log, index) => (
                        <div
                          key={index}
                          className={cn(
                            "text-xs py-1 px-2 rounded",
                            log.type === "error" && "bg-red-500/10 text-red-500",
                            log.type === "success" && "bg-green-500/10 text-green-500",
                            log.type === "info" && "bg-blue-500/10 text-blue-500"
                          )}
                        >
                          <span className="text-muted-foreground mr-2">[{log.time}]</span>
                          {log.message}
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
