"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Archive, Settings, Terminal } from "lucide-react";
import { useRouter } from "next/navigation";
import { TerminalInput } from "./terminal-input";
import { SessionCard, SessionCardLoading } from "./session-card";
import { UserPopover } from "./user-popover";
import type { AgentSession } from "@/lib/db/schema";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AgentHomeProps {
  sessions: AgentSession[];
  sessionsLoading?: boolean;
}

function OpenSettingsButton() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/settings"
            className="hover:bg-accent hover:text-accent-foreground size-8 rounded-md p-2 hover:cursor-pointer inline-flex items-center justify-center"
          >
            <Settings className="size-4" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="bottom">Open Settings</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function AgentHome({ sessions, sessionsLoading = false }: AgentHomeProps) {
  const router = useRouter();

  const displaySessions = sessions.slice(0, 4);

  return (
    <div className="flex flex-1 flex-col">
      {/* Header */}
      <div className="border-border bg-card border-b px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              <span className="font-semibold">Coding Agent</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">ready</span>
              <div className="h-1 w-1 rounded-full bg-green-500 dark:bg-green-600" />
            </div>
            <OpenSettingsButton />
            <UserPopover />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-6 p-4">
          {/* Terminal Chat Input */}
          <Card className="border-border bg-card py-0 border border-solid">
            <CardContent className="p-4">
              <div className="space-y-3">
                <TerminalInput placeholder="Describe your coding task or ask a question..." />
              </div>
            </CardContent>
          </Card>

          {/* Recent & Running Sessions */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-foreground text-base font-semibold">
                Recent & Running Sessions
              </h2>
              {sessions.length > 4 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-border text-muted-foreground hover:text-foreground h-7 text-xs"
                  onClick={() => router.push("/agent/sessions")}
                >
                  View All
                </Button>
              )}
            </div>

            {sessionsLoading || sessions.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {sessionsLoading && sessions.length === 0 && (
                  <>
                    <SessionCardLoading />
                    <SessionCardLoading />
                    <SessionCardLoading />
                    <SessionCardLoading />
                  </>
                )}
                {displaySessions.map((session) => (
                  <SessionCard key={session.id} session={session} />
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Archive className="size-4" />
                  <span className="text-sm">No sessions found</span>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
