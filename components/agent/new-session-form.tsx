"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TerminalIcon, FolderIcon, GitBranchIcon } from "@/components/icons";
import type { AgentSession } from "@/lib/db/schema";

interface NewSessionFormProps {
  hasGitHubToken: boolean;
  recentSessions?: AgentSession[];
}

export function NewSessionForm({
  hasGitHubToken,
  recentSessions = [],
}: NewSessionFormProps) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [localPath, setLocalPath] = useState("");
  const [error, setError] = useState("");

  const handleCreateSession = async () => {
    setIsCreating(true);
    setError("");

    try {
      const response = await fetch("/api/agent/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: localPath ? `Session: ${localPath.split("/").pop()}` : "New Session",
          repoPath: localPath || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "Failed to create session");
        return;
      }

      const data = await response.json();
      router.push(`/agent/${data.session.id}`);
    } catch (err) {
      setError("Failed to create session");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="w-full max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TerminalIcon size={24} />
            Start Coding Session
          </CardTitle>
          <CardDescription>
            Create a new session to work on code with the AI agent.
            Point it to a local repository or specify a path to work in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="local-path" className="flex items-center gap-2">
              <FolderIcon size={16} />
              Local Repository Path
            </Label>
            <Input
              id="local-path"
              placeholder="/path/to/your/repo"
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Enter the absolute path to a local git repository or directory.
              Leave empty to use the current working directory.
            </p>
          </div>

          {!hasGitHubToken && (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
              <p className="flex items-center gap-2">
                <GitBranchIcon size={16} />
                <span>
                  Sign in with GitHub to clone and work with remote repositories.
                </span>
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              {error}
            </div>
          )}

          <Button
            onClick={handleCreateSession}
            disabled={isCreating}
            className="w-full"
          >
            {isCreating ? "Creating..." : "Start Session"}
          </Button>
        </CardContent>
      </Card>

      {recentSessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {recentSessions.map((session) => (
                <li key={session.id}>
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-left"
                    onClick={() => router.push(`/agent/${session.id}`)}
                  >
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{session.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {session.status} •{" "}
                        {new Date(session.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
