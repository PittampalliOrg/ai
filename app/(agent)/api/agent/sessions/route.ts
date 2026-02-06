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
import { invokeService } from "@/lib/dapr/client";
import { getRepoAccessToken } from "@/lib/github/app-auth";
import { getConfig } from "@/lib/dapr/config-provider";
import { AGENT_WORKFLOW_DEFINITION } from "@/lib/workflows/agent-workflow-definition";

// Workflow orchestrator Dapr app ID (cross-namespace invocation to workflow-builder)
const getWorkflowOrchestratorAppId = () =>
  getConfig("WORKFLOW_ORCHESTRATOR_APP_ID", "workflow-orchestrator.workflow-builder");

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
    // Uses workflow-orchestrator for 5-node workflow: Clone → Plan → Approve → Execute
    if (task && startWorkflow && targetRepository) {
      try {
        console.log(
          `[POST /api/agent/sessions] Starting workflow for session ${agentSession.id}`
        );
        console.log(
          `[POST /api/agent/sessions] Repository: ${targetRepository.owner}/${targetRepository.repo}@${targetRepository.branch}`
        );

        // Get GitHub token for repository cloning
        let repoToken: string | undefined;
        try {
          const tokenResult = await getRepoAccessToken(targetRepository.owner);
          repoToken = tokenResult.token;
          console.log(
            `[POST /api/agent/sessions] Got ${tokenResult.source} token for ${targetRepository.owner}`
          );
        } catch (tokenError) {
          console.warn(
            `[POST /api/agent/sessions] Failed to get GitHub token, will try public clone:`,
            tokenError
          );
        }

        // Call workflow-orchestrator's workflow API via Dapr service invocation
        // This uses the 5-node workflow: Clone → Plan → Approve → Execute
        const workflowResponse = await invokeService<{
          instanceId: string;
          workflowId: string;
          status: string;
          error?: string;
        }>({
          appId: getWorkflowOrchestratorAppId(),
          method: "POST",
          path: "/api/v2/workflows",
          body: {
            definition: AGENT_WORKFLOW_DEFINITION,
            triggerData: {
              owner: targetRepository.owner,
              repo: targetRepository.repo,
              branch: targetRepository.branch || "main",
              token: repoToken || "",
              task,
            },
          },
          timeout: 60000,
        });

        if (workflowResponse.ok && workflowResponse.data) {
          const workflowId = workflowResponse.data.instanceId;
          console.log(
            `[POST /api/agent/sessions] Workflow ${workflowId} started via workflow-orchestrator`
          );

          // Link workflow to session
          await updateAgentSessionWorkflow({
            id: agentSession.id,
            workflowId,
            workflowStatus: "running",
          });

          // Return session with workflowId
          return NextResponse.json({
            session: {
              ...agentSession,
              workflowId,
              workflowStatus: "running",
            },
            workflow: {
              id: workflowId,
              status: workflowResponse.data.status,
            },
          });
        } else {
          const errorMsg = workflowResponse.data?.error || `HTTP ${workflowResponse.status}`;
          console.error(
            `[POST /api/agent/sessions] Failed to start workflow: ${errorMsg}`
          );
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
