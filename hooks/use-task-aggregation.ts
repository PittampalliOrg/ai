"use client";

/**
 * Hook for aggregating tasks from workflow events
 *
 * Extracts task data from:
 * - task_created events
 * - task_updated events
 * - TaskCreate/TaskUpdate tool calls in "part" events
 * - EnterPlanMode/ExitPlanMode tool calls
 */

import { useMemo } from "react";
import type { WorkflowStreamEvent, TaskData } from "@/hooks/use-workflow-stream";
import type { DynamicToolUIPart } from "ai";

export type PlanStatus = "planning" | "awaiting_approval" | "approved" | "rejected" | "executing";

export interface TaskAggregationResult {
  tasks: TaskData[];
  planStatus: PlanStatus;
  hasActivePlan: boolean;
  inPlanMode: boolean;
  planCompleted: boolean;
}

/**
 * Normalize subject for comparison (trim and lowercase)
 */
function normalizeSubject(subject: string): string {
  return subject.trim().toLowerCase();
}

/**
 * Check if a task with similar subject already exists
 */
function hasSimilarTask(tasksMap: Map<string, TaskData>, subject: string): boolean {
  const normalizedSubject = normalizeSubject(subject);
  return Array.from(tasksMap.values()).some(t => normalizeSubject(t.subject) === normalizedSubject);
}

/**
 * Aggregate tasks from workflow events
 */
export function useTaskAggregation(events: WorkflowStreamEvent[]): TaskAggregationResult {
  return useMemo(() => {
    const tasksMap = new Map<string, TaskData>();
    const backendToFrontendId = new Map<string, string>(); // Maps backend task IDs to frontend IDs
    let inPlanMode = false;
    let planCompleted = false;
    let taskCreationOrder: string[] = []; // Track order of task creation

    for (const event of events) {
      // Track plan mode entry/exit
      if (event.type === "plan_created") {
        inPlanMode = true;
      }
      if (event.type === "plan_complete") {
        planCompleted = true;
      }

      // Collect tasks from task_created events
      if (event.type === "task_created" && event.data.task) {
        const task = event.data.task as TaskData;
        // Check for duplicate by normalized subject before adding
        if (!hasSimilarTask(tasksMap, task.subject)) {
          tasksMap.set(task.id, task);
        }
      }

      // Update task status from task_updated events
      if (event.type === "task_updated") {
        const taskId = event.data.taskId as string;
        const newStatus = event.data.taskStatus as "pending" | "in_progress" | "completed";

        if (taskId && newStatus) {
          // Try exact ID match first
          if (tasksMap.has(taskId)) {
            const existing = tasksMap.get(taskId)!;
            tasksMap.set(taskId, { ...existing, status: newStatus });
            console.log(`[useTaskAggregation] task_updated: Updated task ${taskId} to ${newStatus}`);
          } else {
            // Fallback: try to find task by numeric position
            const numericId = parseInt(taskId);
            if (!isNaN(numericId)) {
              const tasksArray = Array.from(tasksMap.entries());
              if (numericId > 0 && numericId <= tasksArray.length) {
                const [existingId, existingTask] = tasksArray[numericId - 1];
                tasksMap.set(existingId, { ...existingTask, status: newStatus });
                console.log(`[useTaskAggregation] task_updated: Updated task ${existingId} (position ${numericId}) to ${newStatus}`);
              }
            }
          }
        }
      }

      // Also look for TaskCreate tool results in "part" events
      if (event.type === "part" && event.data) {
        const part = event.data as DynamicToolUIPart;
        if (part.type === "dynamic-tool" && part.toolName === "TaskCreate" && part.state === "output-available") {
          try {
            // Get task details from input (subject, description, activeForm)
            const input = part.input as Record<string, unknown> | undefined;
            if (!input?.subject) continue; // Skip if no subject

            const subject = input.subject as string;

            // Check if we already have a task with similar subject (deduplication)
            if (hasSimilarTask(tasksMap, subject)) continue; // Skip duplicate

            // Try to get task ID from output
            let taskId: string | undefined;
            if (typeof part.output === "string") {
              try {
                const outputData = JSON.parse(part.output);
                taskId = outputData?.id || outputData?.taskId;
              } catch {
                // Output might be a plain string message, extract ID if present
                const match = part.output.match(/(?:task|id)[:\s]*["']?(\d+)["']?/i);
                taskId = match?.[1];
              }
            } else if (part.output && typeof part.output === "object") {
              taskId = (part.output as Record<string, unknown>).id as string ||
                       (part.output as Record<string, unknown>).taskId as string;
            }

            // Generate unique ID if not found - use incremental counter
            if (!taskId) {
              taskId = String(tasksMap.size + 1);
              // Ensure unique ID
              while (tasksMap.has(taskId)) {
                taskId = String(parseInt(taskId) + 1);
              }
              console.log(`[useTaskAggregation] TaskCreate: Generated ID ${taskId} for "${subject}"`);
            } else {
              console.log(`[useTaskAggregation] TaskCreate: Extracted ID ${taskId} for "${subject}" from output`);
            }

            const taskData: TaskData = {
              id: taskId,
              subject,
              description: (input.description as string) || "",
              activeForm: input.activeForm as string | undefined,
              status: "pending",
              blocks: input.blocks as string[] | undefined,
              blockedBy: input.blockedBy as string[] | undefined,
            };
            tasksMap.set(taskId, taskData);
            taskCreationOrder.push(taskId);
          } catch {
            // Ignore parse errors
          }
        }
        // Also handle TaskUpdate - process any state that has input (not just output-available)
        if (part.type === "dynamic-tool" && part.toolName === "TaskUpdate") {
          const input = part.input as Record<string, unknown> | undefined;
          const backendTaskId = input?.taskId as string;
          const newStatus = input?.status as "pending" | "in_progress" | "completed";

          // Only log for status updates to reduce noise
          if (newStatus) {
            console.log(`[useTaskAggregation] TaskUpdate received: taskId=${backendTaskId}, status=${newStatus}, state=${part.state}, tasksMap.size=${tasksMap.size}`);
          }

          if (backendTaskId && newStatus) {
            let updated = false;
            let frontendId: string | undefined;

            // Strategy 1: Check if we already have a mapping for this backend ID
            if (backendToFrontendId.has(backendTaskId)) {
              frontendId = backendToFrontendId.get(backendTaskId)!;
              if (tasksMap.has(frontendId)) {
                const existing = tasksMap.get(frontendId)!;
                tasksMap.set(frontendId, { ...existing, status: newStatus });
                console.log(`[useTaskAggregation] TaskUpdate: Updated task ${frontendId} to ${newStatus} (mapped from backend ${backendTaskId})`);
                updated = true;
              }
            }

            // Strategy 2: Try exact ID match
            if (!updated && tasksMap.has(backendTaskId)) {
              const existing = tasksMap.get(backendTaskId)!;
              tasksMap.set(backendTaskId, { ...existing, status: newStatus });
              console.log(`[useTaskAggregation] TaskUpdate: Updated task ${backendTaskId} to ${newStatus} (exact match)`);
              updated = true;
            }

            // Strategy 3: For new backend IDs, try to map to next unmapped frontend task
            if (!updated) {
              // Find frontend tasks that haven't been mapped to any backend ID yet
              const mappedFrontendIds = new Set(backendToFrontendId.values());
              for (const fId of taskCreationOrder) {
                if (!mappedFrontendIds.has(fId) && tasksMap.has(fId)) {
                  // Map this backend ID to this frontend task
                  backendToFrontendId.set(backendTaskId, fId);
                  const existing = tasksMap.get(fId)!;
                  tasksMap.set(fId, { ...existing, status: newStatus });
                  console.log(`[useTaskAggregation] TaskUpdate: Mapped backend ${backendTaskId} to frontend ${fId}, updated to ${newStatus}`);
                  updated = true;
                  break;
                }
              }
            }

            // Strategy 4: Try subject matching as last resort
            if (!updated && input?.subject) {
              const subjectToMatch = normalizeSubject(input.subject as string);
              for (const [id, task] of tasksMap.entries()) {
                if (normalizeSubject(task.subject) === subjectToMatch) {
                  backendToFrontendId.set(backendTaskId, id);
                  tasksMap.set(id, { ...task, status: newStatus });
                  console.log(`[useTaskAggregation] TaskUpdate: Updated task ${id} to ${newStatus} (subject match)`);
                  updated = true;
                  break;
                }
              }
            }

            if (!updated) {
              console.log(`[useTaskAggregation] TaskUpdate: Could not find task to update. backendId=${backendTaskId}, frontendIds:`, Array.from(tasksMap.keys()));
            }
          }
        }
        // Track EnterPlanMode/ExitPlanMode
        if (part.type === "dynamic-tool" && part.toolName === "EnterPlanMode") {
          inPlanMode = true;
        }
        // Mark plan as complete when ExitPlanMode is called (any state means planning is done)
        if (part.type === "dynamic-tool" && part.toolName === "ExitPlanMode") {
          planCompleted = true;
        }
      }
    }

    const tasks = Array.from(tasksMap.values());
    const hasActivePlan = tasks.length > 0 || inPlanMode;

    // Debug logging
    if (tasks.length > 0) {
      console.log("[useTaskAggregation] Found tasks:", tasks.length, tasks.map(t => t.subject));
    }

    // Determine plan status
    let planStatus: PlanStatus = "planning";

    // If we have tasks, determine status based on task states
    if (tasks.length > 0) {
      const allCompleted = tasks.every(t => t.status === "completed");
      const anyInProgress = tasks.some(t => t.status === "in_progress");

      if (allCompleted) {
        planStatus = "approved"; // All tasks done
      } else if (anyInProgress) {
        planStatus = "executing";
      } else if (planCompleted || tasks.length >= 3) {
        // Plan is ready if ExitPlanMode was called OR we have 3+ tasks
        // (heuristic: 3+ tasks means planning phase is likely complete)
        planStatus = "awaiting_approval";
      } else {
        planStatus = "planning";
      }
    } else if (inPlanMode) {
      planStatus = "planning";
    }

    return { tasks, planStatus, hasActivePlan, inPlanMode, planCompleted };
  }, [events]);
}
