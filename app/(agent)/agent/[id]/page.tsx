import { Suspense } from "react";
import { auth, signOut } from "@/app/(auth)/auth";
import { redirect, notFound } from "next/navigation";
import { getAgentSession, getAgentMessages, getTargetRepository } from "@/lib/db/agent-queries";
import { AgentChat } from "@/components/agent/agent-chat";
import { AgentSessionWrapper } from "@/components/agent/agent-session-wrapper";
import { AgentExecutionProvider } from "@/contexts/agent-execution-context";
import { WorkflowExecutionProvider } from "@/contexts/workflow-execution-context";
import { AgentWorkflowView } from "@/components/agent/agent-workflow-view";

interface AgentSessionPageProps {
  params: Promise<{ id: string }>;
}

export default function Page(props: AgentSessionPageProps) {
  return (
    <Suspense fallback={<div className="flex h-dvh" />}>
      <AgentSessionPage params={props.params} />
    </Suspense>
  );
}

async function AgentSessionPage({ params }: AgentSessionPageProps) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/agent");
  }

  // Handle token refresh errors - sign out and redirect to re-authenticate
  if (session.error === "RefreshTokenError") {
    console.log("[AgentPage] Token refresh error detected, signing out");
    await signOut({ redirect: false });
    redirect("/login?callbackUrl=/agent&error=session_expired");
  }

  const agentSession = await getAgentSession({ id });

  if (!agentSession) {
    notFound();
  }

  if (agentSession.userId !== session.user.id) {
    redirect("/agent");
  }

  // Fetch target repository if available
  const targetRepo = agentSession.targetRepositoryId
    ? await getTargetRepository({ id: agentSession.targetRepositoryId })
    : null;

  const messages = await getAgentMessages({ sessionId: id });

  // Convert DB messages to UI format
  const initialMessages = messages.map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    parts: m.parts as unknown[],
    createdAt: m.createdAt,
  }));

  // Extract task prompt from first user message or session title
  const taskPrompt = initialMessages.find((m) => m.role === "user")?.parts?.[0];
  const taskPromptText = typeof taskPrompt === "object" && taskPrompt !== null && "text" in taskPrompt
    ? (taskPrompt as { text: string }).text
    : typeof taskPrompt === "string"
    ? taskPrompt
    : agentSession.title || null;

  // Use workflow view when session has a workflowId
  const hasWorkflow = !!agentSession.workflowId;

  if (hasWorkflow) {
    return (
      <WorkflowExecutionProvider
        workflowId={agentSession.workflowId!} // Use actual orchestrator workflow ID (e.g. "planner-xxx")
        initialTaskPrompt={taskPromptText}
      >
        <div className="flex h-dvh flex-col">
          <AgentSessionWrapper
            sessionId={id}
            title={agentSession.title}
            status={agentSession.status as "idle" | "running" | "completed" | "error"}
            createdAt={agentSession.createdAt}
            repositoryOwner={targetRepo?.owner}
            repositoryName={targetRepo?.repo}
            branchName={agentSession.branchName || targetRepo?.branch}
          >
            <main className="flex-1 overflow-hidden">
              <AgentWorkflowView taskPrompt={taskPromptText} />
            </main>
          </AgentSessionWrapper>
        </div>
      </WorkflowExecutionProvider>
    );
  }

  // Legacy: Use old AgentChat for sessions without workflow
  return (
    <AgentExecutionProvider>
      <div className="flex h-dvh flex-col">
        <AgentSessionWrapper
          sessionId={id}
          title={agentSession.title}
          status={agentSession.status as "idle" | "running" | "completed" | "error"}
          createdAt={agentSession.createdAt}
          repositoryOwner={targetRepo?.owner}
          repositoryName={targetRepo?.repo}
          branchName={agentSession.branchName || targetRepo?.branch}
        >
          <main className="flex-1 overflow-hidden">
            <AgentChat
              sessionId={id}
              initialMessages={initialMessages}
              repoPath={agentSession.repoPath || undefined}
              status={agentSession.status as "idle" | "running" | "completed" | "error"}
              targetRepository={targetRepo ? {
                owner: targetRepo.owner,
                repo: targetRepo.repo,
                branch: targetRepo.branch,
              } : undefined}
            />
          </main>
        </AgentSessionWrapper>
      </div>
    </AgentExecutionProvider>
  );
}
