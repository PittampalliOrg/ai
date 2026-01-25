import { auth } from "@/app/(auth)/auth";
import { getAgentSession } from "@/lib/db/agent-queries";
import { updateAgentSessionSandbox } from "@/lib/db/agent-queries";
import { ChatSDKError } from "@/lib/errors";
import {
  getSandboxConfig,
  getSandbox,
  getSandboxPhase,
  releaseSandbox,
  isSandboxModeAvailable,
} from "@/lib/sandbox";

/**
 * GET /api/sandbox?sessionId=xxx
 * Get sandbox status for a session
 */
export async function GET(request: Request) {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return Response.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    // Verify session belongs to user
    const agentSession = await getAgentSession({ id: sessionId });
    if (!agentSession) {
      return Response.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    if (agentSession.userId !== session.user.id) {
      return new ChatSDKError("forbidden:chat").toResponse();
    }

    // Get sandbox configuration
    const config = getSandboxConfig();

    // Check if sandbox mode is available
    const availability = await isSandboxModeAvailable();

    // Get sandbox info from K8s if available
    let sandboxInfo = null;
    let k8sPhase = null;

    if (config.mode === "k8s" && availability.available) {
      sandboxInfo = await getSandbox(sessionId);
      k8sPhase = await getSandboxPhase(sessionId);
    }

    return Response.json({
      config: {
        mode: config.mode,
        namespace: config.namespace,
        templateName: config.templateName,
      },
      availability,
      session: {
        id: sessionId,
        sandboxClaimName: agentSession.sandboxClaimName,
        sandboxPodName: agentSession.sandboxPodName,
        sandboxNamespace: agentSession.sandboxNamespace,
        sandboxStatus: agentSession.sandboxStatus,
      },
      sandbox: sandboxInfo
        ? {
            claimName: sandboxInfo.claimName,
            podName: sandboxInfo.podName,
            podIP: sandboxInfo.podIP,
            phase: sandboxInfo.phase,
            workdir: sandboxInfo.workdir,
            provisionedAt: sandboxInfo.provisionedAt,
          }
        : null,
      k8sPhase,
    });
  } catch (error) {
    console.error("Sandbox status API error:", error);
    return Response.json(
      { error: "Failed to get sandbox status" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sandbox?sessionId=xxx
 * Force release a sandbox
 */
export async function DELETE(request: Request) {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return Response.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    // Verify session belongs to user
    const agentSession = await getAgentSession({ id: sessionId });
    if (!agentSession) {
      return Response.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    if (agentSession.userId !== session.user.id) {
      return new ChatSDKError("forbidden:chat").toResponse();
    }

    // Get sandbox configuration
    const config = getSandboxConfig();

    if (config.mode !== "k8s") {
      return Response.json(
        { error: "Sandbox mode not enabled" },
        { status: 400 }
      );
    }

    // Release the sandbox
    await releaseSandbox({ sessionId, force: true });

    // Update session status
    await updateAgentSessionSandbox({
      id: sessionId,
      sandboxStatus: "released",
    });

    return Response.json({
      success: true,
      message: `Sandbox for session ${sessionId} has been released`,
    });
  } catch (error) {
    console.error("Sandbox release API error:", error);
    return Response.json(
      { error: "Failed to release sandbox" },
      { status: 500 }
    );
  }
}
