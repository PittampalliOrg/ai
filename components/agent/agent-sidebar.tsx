"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "next-auth";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PlusIcon, TerminalIcon } from "@/components/icons";
import { SidebarUserNav } from "@/components/sidebar-user-nav";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AgentSession } from "@/lib/db/schema";

export function AgentSidebar({ user }: { user: User | undefined }) {
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchSessions() {
      try {
        const response = await fetch("/api/agent/sessions");
        if (response.ok) {
          const data = await response.json();
          setSessions(data.sessions || []);
        }
      } catch (error) {
        console.error("Failed to fetch sessions:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchSessions();
  }, []);

  const handleNewSession = async () => {
    try {
      const response = await fetch("/api/agent/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Session" }),
      });

      if (response.ok) {
        const data = await response.json();
        setOpenMobile(false);
        router.push(`/agent/${data.session.id}`);
        router.refresh();
      } else {
        toast.error("Failed to create session");
      }
    } catch (error) {
      toast.error("Failed to create session");
    }
  };

  return (
    <Sidebar className="group-data-[side=left]:border-r-0">
      <SidebarHeader>
        <SidebarMenu>
          <div className="flex flex-row items-center justify-between">
            <Link
              className="flex flex-row items-center gap-3"
              href="/agent"
              onClick={() => setOpenMobile(false)}
            >
              <TerminalIcon size={20} />
              <span className="cursor-pointer rounded-md px-2 font-semibold text-lg hover:bg-muted">
                Agent
              </span>
            </Link>
            <div className="flex flex-row gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="h-8 p-1 md:h-fit md:p-2"
                    onClick={handleNewSession}
                    type="button"
                    variant="ghost"
                  >
                    <PlusIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent align="end" className="hidden md:block">
                  New Session
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="/">
                <span className="text-muted-foreground">← Back to Chat</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <div className="mt-4 px-2">
            <span className="text-xs font-medium text-muted-foreground uppercase">
              Navigation
            </span>
          </div>

          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="/workflows" onClick={() => setOpenMobile(false)}>
                <span>Workflows</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="/dapr-workflows" onClick={() => setOpenMobile(false)}>
                <span>Dapr Workflows</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <div className="mt-4 px-2">
            <span className="text-xs font-medium text-muted-foreground uppercase">
              Recent Sessions
            </span>
          </div>

          {isLoading ? (
            <div className="px-4 py-2 text-sm text-muted-foreground">
              Loading...
            </div>
          ) : sessions.length === 0 ? (
            <div className="px-4 py-2 text-sm text-muted-foreground">
              No sessions yet
            </div>
          ) : (
            sessions.slice(0, 20).map((session) => (
              <SidebarMenuItem key={session.id}>
                <SidebarMenuButton asChild>
                  <Link
                    href={`/agent/${session.id}`}
                    onClick={() => setOpenMobile(false)}
                  >
                    <div className="flex flex-col gap-0.5 overflow-hidden">
                      <span className="truncate text-sm">{session.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {session.status} •{" "}
                        {new Date(session.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))
          )}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter>{user && <SidebarUserNav user={user} />}</SidebarFooter>
    </Sidebar>
  );
}
