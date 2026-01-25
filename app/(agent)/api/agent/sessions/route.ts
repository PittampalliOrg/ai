import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  createAgentSession,
  getAgentSessionsByUserId,
  deleteAgentSession,
  createOrGetTargetRepository,
  updateAgentSessionWorkflow,
} from "@/lib/db/agent-queries";
import { verifyUserExists } from "@/lib/db/queries";
import {
  initializeWorkflowPatternsRuntime,
  scheduleWorkflowPattern,
  isWorkflowPatternsRuntimeInitialized,
} from "@/lib/workflow-patterns/runtime";
import { registerWorkflow } from "@/lib/workflow-patterns/workflow-index";
import type { SequentialInput } from "@/lib/workflow-patterns/types";

// Workflow orchestrator service configuration (legacy fallback)
const WORKFLOW_SERVICE_URL =
  process.env.WORKFLOW_SERVICE_URL ||
  "http://workflow-orchestrator.dapr-agents.svc.cluster.local:80";

// Use workflow-patterns by default, fall back to orchestrator if disabled
const USE_WORKFLOW_PATTERNS = process.env.WORKFLOW_PATTERNS_ENABLED === "true";

/**
 * GET /api/agent/sessions
 * Get all agent sessions for the current user
 */
export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sessions = await getAgentSessionsByUserId({
      userId: session.user.id,
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("Failed to fetch sessions:", error);
    return NextResponse.json(
      { error: "Failed to fetch sessions" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/agent/sessions
 * Create a new agent session
 */
export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify user exists in database before creating session
  const userExists = await verifyUserExists(session.user.id);
  if (!userExists) {
    console.error(
      `[POST /api/agent/sessions] User ${session.user.id} not found in database`
    );
    return NextResponse.json(
      { error: "User not found. Please sign out and sign in again." },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { title, targetRepository, repoPath, task, startWorkflow } = body;

    let targetRepositoryId: string | undefined;

    // Create or get target repository if provided
    if (targetRepository) {
      const repo = await createOrGetTargetRepository({
        owner: targetRepository.owner,
        repo: targetRepository.repo,
        branch: targetRepository.branch,
        installationId: targetRepository.installationId,
      });
      targetRepositoryId = repo.id;
    }

    const agentSession = await createAgentSession({
      userId: session.user.id,
      targetRepositoryId,
      title: title || "New Session",
      repoPath,
    });

    // Start workflow if requested (atomic session + workflow creation)
    if (task && startWorkflow && targetRepository) {
      try {
        console.log(
          `[POST /api/agent/sessions] Starting workflow for session ${agentSession.id}`
        );

        let workflowId: string | undefined;

        // Try workflow-patterns (Dapr-based sequential workflow) first
        if (USE_WORKFLOW_PATTERNS) {
          try {
            // Initialize runtime if needed
            if (!isWorkflowPatternsRuntimeInitialized()) {
              console.log("[POST /api/agent/sessions] Initializing workflow-patterns runtime...");
              await initializeWorkflowPatternsRuntime();
            }

            // Build SequentialInput for workflow-patterns
            const sequentialInput: SequentialInput = {
              repository: {
                owner: targetRepository.owner,
                repo: targetRepository.repo,
                branch: targetRepository.branch || "main",
              },
              prompt: task,
            };

            // Schedule the sequential workflow
            workflowId = await scheduleWorkflowPattern(
              "sequentialWorkflow",
              sequentialInput
            );

            console.log(
              `[POST /api/agent/sessions] Sequential workflow ${workflowId} started via workflow-patterns`
            );

            // Register in workflow index for listing
            try {
              await registerWorkflow(
                workflowId,
                "sequentialWorkflow",
                "sequential",
                sequentialInput as unknown as Record<string, unknown>
              );
            } catch (indexError) {
              console.error(
                "[POST /api/agent/sessions] Failed to register in workflow index:",
                indexError
              );
            }
          } catch (patternsError) {
            console.error(
              "[POST /api/agent/sessions] Workflow-patterns failed, falling back to orchestrator:",
              patternsError
            );
            workflowId = undefined; // Clear to try fallback
          }
        }

        // Fallback to workflow-orchestrator if patterns disabled or failed
        if (!workflowId) {
          const workflowResponse = await fetch(
            `${WORKFLOW_SERVICE_URL}/api/workflows`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt: task,
                sessionId: agentSession.id,
                options: {
                  targetRepository: {
                    owner: targetRepository.owner,
                    repo: targetRepository.repo,
                    branch: targetRepository.branch,
                  },
                },
              }),
            }
          );

          if (workflowResponse.ok) {
            const workflowData = await workflowResponse.json();
            workflowId = workflowData.workflowId;
            console.log(
              `[POST /api/agent/sessions] Workflow ${workflowId} started via orchestrator`
            );
          } else {
            const errorText = await workflowResponse.text();
            console.error(
              `[POST /api/agent/sessions] Failed to start workflow: ${workflowResponse.status} - ${errorText}`
            );
          }
        }

        if (workflowId) {
          // Link workflow to session
          await updateAgentSessionWorkflow({
            id: agentSession.id,
            workflowId,
            workflowStatus: "pending",
          });

          // Return session with workflowId
          return NextResponse.json({
            session: {
              ...agentSession,
              workflowId,
              workflowStatus: "pending",
            },
          });
        }
        // Session created but workflow failed - return session anyway
        // The user can still use the legacy AgentChat view
      } catch (workflowError) {
        console.error(
          "[POST /api/agent/sessions] Failed to start workflow:",
          workflowError
        );
        // Session created but workflow failed - return session anyway
      }
    }

    return NextResponse.json({ session: agentSession });
  } catch (error) {
    console.error("Failed to create session:", error);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/agent/sessions?id=...
 * Delete an agent session
 */
export async function DELETE(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "Session ID is required" },
      { status: 400 }
    );
  }

  try {
    await deleteAgentSession({ id });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete session:", error);
    return NextResponse.json(
      { error: "Failed to delete session" },
      { status: 500 }
    );
  }
}
