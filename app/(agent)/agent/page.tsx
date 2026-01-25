import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import { redirect } from "next/navigation";
import { getAgentSessionsByUserId } from "@/lib/db/agent-queries";
import { AgentHome } from "@/components/agent/agent-home";
import { GitHubAppProvider } from "@/providers/github-app";

export default function Page() {
  return (
    <Suspense fallback={<AgentPageLoading />}>
      <AgentPage />
    </Suspense>
  );
}

function AgentPageLoading() {
  return (
    <div className="flex h-dvh flex-col">
      <div className="border-border bg-card border-b px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-5 w-32 animate-pulse rounded bg-muted" />
          </div>
          <div className="flex items-center gap-4">
            <div className="h-6 w-20 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>
      <div className="flex-1 animate-pulse bg-muted/20" />
    </div>
  );
}

async function AgentPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/agent");
  }

  const sessions = await getAgentSessionsByUserId({ userId: session.user.id });

  return (
    <div className="flex h-dvh flex-col">
      <GitHubAppProvider>
        <AgentHome sessions={sessions} />
      </GitHubAppProvider>
    </div>
  );
}
