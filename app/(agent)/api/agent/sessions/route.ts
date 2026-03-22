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
import { getRepoAccessToken } from "@/lib/github/app-auth";
import { startWorkflowBuilderCodingAgentExecution } from "@/lib/workflow-builder-client";

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

    // Start workflow if requested (session + workflow execution creation)
    // Uses a saved workflow-builder system workflow backed by dapr-agent/run.
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

        const workflowResponse = await startWorkflowBuilderCodingAgentExecution({
          task,
          userId: session.user.id,
          sessionId: agentSession.id,
          targetRepository: {
            owner: targetRepository.owner,
            repo: targetRepository.repo,
            branch: targetRepository.branch || "main",
            token: repoToken,
          },
        });

        if (!workflowResponse.success) {
          throw new Error("Workflow-builder execution did not start successfully");
        }

        const workflowId = workflowResponse.executionId;
        const workflowResult = {
          id: workflowId,
          status: workflowResponse.status,
          daprInstanceId: workflowResponse.instanceId,
          savedWorkflowId: workflowResponse.workflowId,
          savedWorkflowName: workflowResponse.workflowName,
        };

        console.log(
          `[POST /api/agent/sessions] Workflow execution ${workflowId} started via workflow-builder`
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
          workflow: workflowResult,
        });
      } catch (workflowError) {
        console.error(
          "[POST /api/agent/sessions] Failed to start workflow:",
          workflowError
        );

        await deleteAgentSession({ id: agentSession.id }).catch((deleteError) => {
          console.error(
            `[POST /api/agent/sessions] Failed to roll back session ${agentSession.id}:`,
            deleteError
          );
        });

        return NextResponse.json(
          {
            error: "Failed to start coding workflow",
          },
          { status: 502 }
        );
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
