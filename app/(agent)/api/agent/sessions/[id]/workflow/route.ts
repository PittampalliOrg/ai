/**
 * Session Workflow API
 *
 * PATCH /api/agent/sessions/[id]/workflow
 * Updates the workflow information for an agent session.
 */

import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getAgentSession, updateAgentSessionWorkflow } from "@/lib/db/agent-queries";

interface WorkflowUpdateRequest {
  workflowId?: string;
  workflowStatus?: "none" | "pending" | "running" | "suspended" | "completed" | "failed" | "terminated";
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify ownership
  const agentSession = await getAgentSession({ id });

  if (!agentSession) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (agentSession.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body: WorkflowUpdateRequest = await request.json();

    await updateAgentSessionWorkflow({
      id,
      workflowId: body.workflowId,
      workflowStatus: body.workflowStatus,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Session Workflow] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
