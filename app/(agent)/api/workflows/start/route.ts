/**
 * Workflow Start API
 *
 * POST /api/workflows/start
 * Starts the workflow-builder coding-agent workflow directly.
 */

import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { resolveRepositoryAccess } from "@/lib/github/app-auth";
import { startWorkflowBuilderCodingAgentExecution } from "@/lib/workflow-builder-client";

export const maxDuration = 60;

interface StartWorkflowRequest {
  task: string;
  sessionId?: string;
  targetRepository?: {
    owner: string;
    repo: string;
    branch: string;
  };
  options?: {
    autoApprove?: boolean;
    workingDirectory?: string;
  };
}

interface StartWorkflowResponse {
  success: boolean;
  workflowId?: string;
  status?: string;
  error?: string;
}

export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      {
        success: false,
        error: "Unauthorized",
      } satisfies StartWorkflowResponse,
      { status: 401 }
    );
  }

  let requestBody: StartWorkflowRequest;

  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid JSON body",
      } satisfies StartWorkflowResponse,
      { status: 400 }
    );
  }

  try {
    const { task, sessionId, targetRepository } = requestBody;

    if (!task || task.trim() === "") {
      return NextResponse.json(
        {
          success: false,
          error: "Task description is required",
        } satisfies StartWorkflowResponse,
        { status: 400 }
      );
    }

    if (!targetRepository) {
      return NextResponse.json(
        {
          success: false,
          error: "Target repository is required",
        } satisfies StartWorkflowResponse,
        { status: 400 }
      );
    }

    const repositoryAccess = await resolveRepositoryAccess({
      owner: targetRepository.owner,
      repo: targetRepository.repo,
      userOAuthToken: session.accessToken,
    });
    const repoToken = repositoryAccess.token;
    console.log(
      `[Workflow Start] Using ${repositoryAccess.source} repository access for ${targetRepository.owner}/${targetRepository.repo}`
    );

    const workflowResponse = await startWorkflowBuilderCodingAgentExecution({
      task,
      userId: session.user.id,
      sessionId: sessionId?.trim() || `adhoc-${crypto.randomUUID()}`,
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

    console.log(
      `[Workflow Start] Workflow-builder execution started successfully: ${workflowResponse.executionId}`
    );

    return NextResponse.json(
      {
        success: true,
        workflowId: workflowResponse.executionId,
        status: workflowResponse.status,
      } satisfies StartWorkflowResponse,
      { status: 201 }
    );
  } catch (error) {
    console.error("[Workflow Start] Error:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        success: false,
        error: message,
      } satisfies StartWorkflowResponse,
      {
        status: message.includes("No repository access is available") ? 400 : 500,
      }
    );
  }
}
