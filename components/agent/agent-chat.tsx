"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowUpIcon, LoaderIcon } from "@/components/icons";
import { ListTodo, Zap } from "lucide-react";
import { AgentMessage } from "./agent-message";
import { AgentTaskSidebar } from "./agent-task-sidebar";
import { AgentExecutionPanel } from "./agent-execution-panel";
import { RalphWorkflowSidebar } from "./ralph-workflow-sidebar";
import { useProcessedMessages, type LogEntry } from "@/hooks/use-processed-messages";
import { useAgentExecutionContextOptional } from "@/contexts/agent-execution-context";
import { useRalphWorkflow } from "@/hooks/use-ralph-workflow";
import { generateUUID } from "@/lib/utils";
import type { TabType } from "@/hooks/use-agent-execution";

/** Workflow mode: direct execution or planning with approval */
type WorkflowMode = "direct" | "planning";

// Schema for custom data parts from the server
const setupDataSchema = z.object({
  phase: z.enum(["provisioning", "cloning", "ready", "init"]),
  status: z.enum(["running", "success", "error"]),
  message: z.string(),
  namespace: z.string().optional(),
  branch: z.string().optional(),
  logs: z.string().optional(),
});

const setupCompleteSchema = z.object({});

interface AgentChatProps {
  sessionId: string;
  initialMessages: Array<{
    id: string;
    role: "user" | "assistant";
    parts: unknown[];
    createdAt?: Date;
  }>;
  repoPath?: string;
  status: "idle" | "running" | "completed" | "error";
  initialPrompt?: string;
  targetRepository?: {
    owner: string;
    repo: string;
    branch: string;
  };
}

export function AgentChat({
  sessionId,
  initialMessages,
  repoPath,
  status: initialStatus,
  initialPrompt,
  targetRepository,
}: AgentChatProps) {
  const [inputValue, setInputValue] = useState("");
  const [isPanelMaximized, setIsPanelMaximized] = useState(false);
  const [selectedTab, setSelectedTab] = useState<TabType>("logs");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [setupLogs, setSetupLogs] = useState<LogEntry[]>([]);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>("direct");
  const [ralphWorkflowStarted, setRalphWorkflowStarted] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasSubmittedInitialPrompt = useRef(false);
  const hasReceivedServerSetupLogs = useRef(false);
  const hasSwitchedToDiff = useRef(false);

  const agentContext = useAgentExecutionContextOptional();
  const updateStats = agentContext?.updateStats;

  // Ralph workflow hook for planning mode
  const ralphWorkflow = useRalphWorkflow({
    sessionId,
    pollInterval: 2000,
    autoStart: ralphWorkflowStarted,
    onComplete: (plan) => {
      console.log("[AgentChat] Ralph workflow completed:", plan.title);
    },
    onError: (error) => {
      console.error("[AgentChat] Ralph workflow error:", error);
    },
  });

  // Callbacks for setup events - these are stable
  const addSetupLog = useCallback((event: {
    phase: "provisioning" | "cloning" | "ready" | "init";
    status: "running" | "success" | "error";
    message: string;
    namespace?: string;
    branch?: string;
    logs?: string;
  }) => {
    const newLog: LogEntry = {
      id: `setup-${event.phase}-${Date.now()}`,
      type: "setup",
      content: event.message,
      timestamp: new Date(),
      status: event.status,
      setupPhase: event.phase,
      setupLogs: event.logs,
    };
    setSetupLogs(prev => [...prev, newLog]);
    if (!startTime) setStartTime(new Date());
  }, [startTime]);

  const markSetupComplete = useCallback(() => {
    const dividerLog: LogEntry = {
      id: `setup-divider-${Date.now()}`,
      type: "setup-divider",
      content: "",
      timestamp: new Date(),
    };
    setSetupLogs(prev => [...prev, dividerLog]);
  }, []);

  // Use useChat with inline callbacks - matching the working chat.tsx pattern
  const { messages, sendMessage, status } = useChat({
    id: sessionId,
    messages: initialMessages as UIMessage[],
    generateId: generateUUID,
    experimental_throttle: 100,
    dataPartSchemas: {
      setup: setupDataSchema,
      "setup-complete": setupCompleteSchema,
    },
    transport: new DefaultChatTransport({
      api: "/api/agent",
      prepareSendMessagesRequest(request) {
        const lastMessage = request.messages.at(-1);
        const isToolApproval = request.messages.some((msg) =>
          msg.parts?.some((part) => {
            const state = (part as { state?: string }).state;
            return state === "approval-responded";
          })
        );

        return {
          body: {
            id: sessionId,
            ...(isToolApproval
              ? { messages: request.messages }
              : { message: lastMessage }),
            repoPath,
            targetRepository,
          },
        };
      },
    }),
    onData: (dataPart) => {
      if (dataPart.type === "data-setup") {
        hasReceivedServerSetupLogs.current = true;
        const setupData = dataPart.data as {
          phase: "provisioning" | "cloning" | "ready" | "init";
          status: "running" | "success" | "error";
          message: string;
          namespace?: string;
          branch?: string;
          logs?: string;
        };
        addSetupLog({
          phase: setupData.phase,
          status: setupData.status,
          message: setupData.message,
          namespace: setupData.namespace,
          branch: setupData.branch,
          logs: setupData.logs,
        });
      }

      if (dataPart.type === "data-setup-complete") {
        markSetupComplete();
      }
    },
  });

  // Pure computation - derive all execution state from messages without setting state
  const processed = useProcessedMessages(messages, setupLogs);

  // Fallback: Add setup logs on page reload if we have targetRepository but no server events
  const hasAddedFallbackSetupLogs = useRef(false);
  useEffect(() => {
    const shouldAddFallbackLogs =
      targetRepository &&
      !hasAddedFallbackSetupLogs.current &&
      !hasReceivedServerSetupLogs.current &&
      messages.length > 0 &&
      status === "ready" &&
      setupLogs.length === 0;

    if (shouldAddFallbackLogs) {
      hasAddedFallbackSetupLogs.current = true;
      addSetupLog({ phase: "provisioning", status: "success", message: "Sandbox environment provisioned" });
      addSetupLog({ phase: "cloning", status: "success", message: `Repository cloned: ${targetRepository.owner}/${targetRepository.repo} (${targetRepository.branch})` });
      addSetupLog({ phase: "ready", status: "success", message: `Working directory: /workspace/${targetRepository.repo}` });
      markSetupComplete();
    }
  }, [status, targetRepository, messages.length, setupLogs.length, addSetupLog, markSetupComplete]);

  const isLoading = status === "streaming" || status === "submitted";

  // Track previous stats to avoid redundant context updates
  const prevStatsRef = useRef<{ additions: number; deletions: number; status: "idle" | "running" | "completed" | "error" }>({ additions: 0, deletions: 0, status: "idle" });

  // Update context with execution stats for header display
  useEffect(() => {
    const newStats = {
      additions: processed.fileChangeStats.additions,
      deletions: processed.fileChangeStats.deletions,
      status: processed.status,
    };

    if (
      prevStatsRef.current.additions !== newStats.additions ||
      prevStatsRef.current.deletions !== newStats.deletions ||
      prevStatsRef.current.status !== newStats.status
    ) {
      prevStatsRef.current = newStats;
      updateStats?.(newStats);
    }
  }, [processed.fileChangeStats, processed.status, updateStats]);

  // Auto-switch to diff tab when files are modified and execution completes
  useEffect(() => {
    if (processed.fileChangeArray.length > 0 && processed.status === "completed" && !hasSwitchedToDiff.current) {
      hasSwitchedToDiff.current = true;
      setSelectedTab("diff");
    }
  }, [processed.fileChangeArray.length, processed.status]);

  // Scroll to bottom when messages change (only in non-split view)
  useEffect(() => {
    if (!processed.isExecuting && processed.status === "idle") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, processed.isExecuting, processed.status]);

  // Compute execution time
  const getExecutionTime = useCallback(() => {
    if (!startTime) return "";
    const end = processed.status === "completed" || processed.status === "error" ? new Date() : new Date();
    const diffMs = end.getTime() - startTime.getTime();
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
    return `${seconds}s`;
  }, [startTime, processed.status]);

  // Send initial prompt if provided and no messages exist yet
  useEffect(() => {
    if (
      initialPrompt &&
      !hasSubmittedInitialPrompt.current &&
      initialMessages.length === 0
    ) {
      hasSubmittedInitialPrompt.current = true;
      sendMessage({
        role: "user",
        parts: [{ type: "text", text: initialPrompt }],
      });
    }
  }, [initialPrompt, initialMessages.length, sendMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    // Planning mode: start Ralph workflow
    if (workflowMode === "planning" && targetRepository && !ralphWorkflowStarted) {
      console.log("[AgentChat] Starting Ralph workflow in planning mode");
      setRalphWorkflowStarted(true);

      // Add a user message to show the prompt
      sendMessage({
        role: "user",
        parts: [{ type: "text", text: inputValue }],
      });

      // Start the Ralph workflow
      const success = await ralphWorkflow.startWorkflow(inputValue, {
        owner: targetRepository.owner,
        repo: targetRepository.repo,
        branch: targetRepository.branch,
      });

      if (!success) {
        console.error("[AgentChat] Failed to start Ralph workflow");
        setRalphWorkflowStarted(false);
      }

      setInputValue("");
      return;
    }

    // Direct mode: use regular chat
    sendMessage({
      role: "user",
      parts: [{ type: "text", text: inputValue }],
    });
    setInputValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleFollowUp = (message: string) => {
    sendMessage({
      role: "user",
      parts: [{ type: "text", text: message }],
    });
  };

  // Determine if we should show split view
  const showSplitView = processed.isExecuting || processed.status !== "idle" ||
    (workflowMode === "planning" && ralphWorkflowStarted && ralphWorkflow.plan);

  return (
    <div className="flex h-full overflow-hidden">
      <AnimatePresence mode="wait">
        {showSplitView ? (
          // Split view layout
          <motion.div
            key="split-view"
            className="flex h-full w-full relative"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Task Sidebar - hidden when panel is maximized */}
            {!isPanelMaximized && (
              workflowMode === "planning" && ralphWorkflowStarted ? (
                <RalphWorkflowSidebar
                  sessionId={sessionId}
                  targetRepository={targetRepository}
                  ralphEnabled={true}
                  taskSidebarProps={{
                    taskPrompt: processed.taskPrompt,
                    executionTime: getExecutionTime(),
                    status: processed.status,
                    summary: processed.summary,
                    fileChanges: processed.fileChanges,
                    fileChangeArray: processed.fileChangeArray,
                    selectedFile,
                    onFileSelect: (path) => {
                      setSelectedFile(path);
                      setSelectedTab("diff");
                    },
                    onFollowUp: handleFollowUp,
                    isLoading,
                  }}
                />
              ) : (
                <AgentTaskSidebar
                  taskPrompt={processed.taskPrompt}
                  executionTime={getExecutionTime()}
                  status={processed.status}
                  summary={processed.summary}
                  fileChanges={processed.fileChanges}
                  fileChangeArray={processed.fileChangeArray}
                  selectedFile={selectedFile}
                  onFileSelect={(path) => {
                    setSelectedFile(path);
                    setSelectedTab("diff");
                  }}
                  onFollowUp={handleFollowUp}
                  isLoading={isLoading}
                />
              )
            )}

            {/* Execution Panel */}
            <AgentExecutionPanel
              selectedTab={selectedTab}
              onTabChange={setSelectedTab}
              fileChanges={processed.fileChanges}
              fileChangeArray={processed.fileChangeArray}
              logs={processed.logs}
              selectedFile={selectedFile}
              onFileSelect={setSelectedFile}
              isMaximized={isPanelMaximized}
              onToggleMaximize={() => setIsPanelMaximized(!isPanelMaximized)}
            />
          </motion.div>
        ) : (
          // Standard chat layout
          <motion.div
            key="chat-view"
            className="flex h-full w-full flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Messages area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <p className="text-lg font-medium">Ready to code</p>
                    <p className="text-sm">
                      {repoPath
                        ? `Working in: ${repoPath}`
                        : "No repository specified"}
                    </p>
                    <p className="text-sm mt-2">
                      Try: &quot;List the files in this directory&quot; or &quot;What is this project about?&quot;
                    </p>
                  </div>
                </div>
              ) : (
                messages.map((message) => (
                  <AgentMessage key={message.id} message={message} />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="border-t p-4">
              {/* Workflow Mode Toggle */}
              <div className="flex items-center justify-between mb-3 pb-3 border-b">
                <div className="flex items-center gap-2 text-sm">
                  <Zap className={`h-4 w-4 ${workflowMode === "direct" ? "text-yellow-500" : "text-muted-foreground"}`} />
                  <span className={workflowMode === "direct" ? "font-medium" : "text-muted-foreground"}>
                    Direct
                  </span>
                </div>
                <Switch
                  checked={workflowMode === "planning"}
                  onCheckedChange={(checked) => setWorkflowMode(checked ? "planning" : "direct")}
                  disabled={ralphWorkflowStarted || isLoading}
                />
                <div className="flex items-center gap-2 text-sm">
                  <span className={workflowMode === "planning" ? "font-medium" : "text-muted-foreground"}>
                    Planning
                  </span>
                  <ListTodo className={`h-4 w-4 ${workflowMode === "planning" ? "text-blue-500" : "text-muted-foreground"}`} />
                </div>
              </div>

              {/* Mode Description */}
              <p className="text-xs text-muted-foreground mb-3">
                {workflowMode === "direct"
                  ? "Execute tasks immediately without a review step."
                  : "Create a plan first, review it, then execute after approval."}
              </p>

              <form onSubmit={handleSubmit} className="flex gap-2">
                <Textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={workflowMode === "planning"
                    ? "Describe your task for planning..."
                    : "Ask the agent to help with your code..."}
                  className="min-h-[60px] resize-none"
                  disabled={isLoading || (workflowMode === "planning" && ralphWorkflowStarted)}
                />
                <Button
                  type="submit"
                  disabled={!inputValue.trim() || isLoading || (workflowMode === "planning" && ralphWorkflowStarted)}
                  className="h-auto px-4"
                >
                  {isLoading ? (
                    <LoaderIcon size={20} />
                  ) : (
                    <ArrowUpIcon size={20} />
                  )}
                </Button>
              </form>
              {isLoading && (
                <p className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                  <LoaderIcon size={12} />
                  Agent is working...
                </p>
              )}
              {workflowMode === "planning" && ralphWorkflowStarted && ralphWorkflow.plan && (
                <p className="mt-2 text-xs text-blue-600 dark:text-blue-400 flex items-center gap-2">
                  <ListTodo size={12} />
                  Planning mode active - review the plan in the sidebar
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
