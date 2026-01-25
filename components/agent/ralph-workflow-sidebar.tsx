"use client";

/**
 * Ralph Workflow Sidebar Component
 *
 * A smart sidebar that shows either the Ralph Plan View (during planning/iteration)
 * or delegates to the regular task sidebar (during execution).
 */

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  PlayCircle,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  ListTodo,
  Loader2,
} from "lucide-react";
import { RalphPlanView } from "./ralph-plan-view";
import { RalphAcceptanceDialog } from "./ralph-acceptance-dialog";
import { AgentTaskSidebar } from "./agent-task-sidebar";
import {
  useRalphWorkflow,
  getPlanStatusLabel,
  getStatusColor,
} from "@/hooks/use-ralph-workflow";
import type { TaskPlan, TaskPlanItem } from "@/lib/types/ralph-plan";
import type { FileChange } from "@/hooks/use-agent-execution";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

interface RalphWorkflowSidebarProps {
  /** Session ID */
  sessionId: string;
  /** Target repository info */
  targetRepository?: {
    owner: string;
    repo: string;
    branch: string;
    installationId?: string;
  };
  /** Whether Ralph mode is enabled for this session */
  ralphEnabled?: boolean;
  /** Props for the regular task sidebar (when in execution mode) */
  taskSidebarProps?: {
    taskPrompt: string | null;
    executionTime: string;
    status: "idle" | "running" | "completed" | "error";
    summary: string[];
    fileChanges: Map<string, FileChange>;
    fileChangeArray: FileChange[];
    selectedFile: string | null;
    onFileSelect: (path: string) => void;
    onFollowUp: (message: string) => void;
    isLoading: boolean;
  };
}

// ============================================================================
// Main Component
// ============================================================================

export function RalphWorkflowSidebar({
  sessionId,
  targetRepository,
  ralphEnabled = false,
  taskSidebarProps,
}: RalphWorkflowSidebarProps) {
  const [showAcceptanceDialog, setShowAcceptanceDialog] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | undefined>();

  // Use Ralph workflow hook
  const {
    isLoading,
    isActive,
    plan,
    workflowStatus,
    acceptPlan,
    submitFeedback,
    startWorkflow,
  } = useRalphWorkflow({
    sessionId,
    pollInterval: 2000,
    autoStart: ralphEnabled,
  });

  // Handlers
  const handleAccept = useCallback(async () => {
    await acceptPlan();
  }, [acceptPlan]);

  const handleFeedback = useCallback(
    async (feedback: string) => {
      await submitFeedback(feedback);
    },
    [submitFeedback]
  );

  const handleItemSelect = useCallback((item: TaskPlanItem) => {
    setSelectedItemId(item.id);
  }, []);

  // Determine what to show based on plan status
  const shouldShowPlanView =
    ralphEnabled &&
    plan &&
    ["draft", "iterating", "accepted"].includes(plan.status);

  const shouldShowTaskSidebar =
    !shouldShowPlanView && taskSidebarProps && plan?.status !== "executing";

  const shouldShowExecutingView =
    ralphEnabled && plan?.status === "executing";

  // If Ralph is not enabled, just show the regular task sidebar
  if (!ralphEnabled) {
    if (!taskSidebarProps) {
      return null;
    }
    return <AgentTaskSidebar {...taskSidebarProps} />;
  }

  return (
    <div className="flex h-full w-[400px] min-w-[400px] flex-shrink-0 flex-col border-r bg-background">
      <AnimatePresence mode="wait">
        {/* Planning/Iteration View */}
        {shouldShowPlanView && plan && (
          <motion.div
            key="plan-view"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-col h-full"
          >
            {/* Plan View */}
            <div className="flex-1 overflow-hidden">
              <RalphPlanView
                plan={plan}
                onItemSelect={handleItemSelect}
                selectedItemId={selectedItemId}
              />
            </div>

            {/* Action Buttons */}
            {(plan.status === "draft" || plan.status === "iterating") && (
              <div className="border-t p-4 space-y-2">
                <Button
                  onClick={() => setShowAcceptanceDialog(true)}
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <PlayCircle className="h-4 w-4 mr-2" />
                  )}
                  Review & Accept Plan
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Iteration {plan.iteration}
                </p>
              </div>
            )}

            {/* Accepted, waiting for execution */}
            {plan.status === "accepted" && (
              <div className="border-t p-4 bg-green-50 dark:bg-green-950/30">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                  <CheckCircle2 className="h-5 w-5" />
                  <div>
                    <p className="font-medium text-sm">Plan Accepted</p>
                    <p className="text-xs text-green-600 dark:text-green-400">
                      Starting execution...
                    </p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Executing View */}
        {shouldShowExecutingView && plan && (
          <motion.div
            key="executing-view"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-col h-full"
          >
            {/* Show plan view in compact mode during execution */}
            <div className="flex-1 overflow-hidden">
              <RalphPlanView
                plan={plan}
                compact
                onItemSelect={handleItemSelect}
                selectedItemId={selectedItemId}
              />
            </div>
          </motion.div>
        )}

        {/* Regular Task Sidebar */}
        {shouldShowTaskSidebar && taskSidebarProps && (
          <motion.div
            key="task-sidebar"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="h-full"
          >
            <AgentTaskSidebar {...taskSidebarProps} />
          </motion.div>
        )}

        {/* Loading State */}
        {isLoading && !plan && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex items-center justify-center"
          >
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Loading workflow...
              </p>
            </div>
          </motion.div>
        )}

        {/* No Active Workflow */}
        {!isLoading && !plan && !taskSidebarProps && (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex items-center justify-center p-4"
          >
            <div className="text-center">
              <ListTodo className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground mb-2">
                No active workflow
              </p>
              <p className="text-xs text-muted-foreground/70">
                Start a new task to begin planning
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Acceptance Dialog */}
      {plan && (
        <RalphAcceptanceDialog
          open={showAcceptanceDialog}
          onOpenChange={setShowAcceptanceDialog}
          plan={plan}
          onAccept={handleAccept}
          onFeedback={handleFeedback}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}

export default RalphWorkflowSidebar;
