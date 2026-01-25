"use client";

import type React from "react";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { ArrowUp, Loader2 } from "lucide-react";
import { RepositoryBranchSelectors } from "./repo-branch-selectors";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useGitHubAppProvider } from "@/providers/github-app";
import { toast } from "sonner";

interface TerminalInputProps {
  placeholder?: string;
  disabled?: boolean;
}

export function TerminalInput({
  placeholder = "Describe your coding task or ask a question...",
  disabled = false,
}: TerminalInputProps) {
  const router = useRouter();
  const { selectedRepository, selectedBranch, isLoading: repoLoading } =
    useGitHubAppProvider();
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!selectedRepository) {
      toast.error("Please select a repository first", {
        closeButton: true,
      });
      return;
    }

    if (!selectedBranch) {
      toast.error("Please select a branch first", {
        closeButton: true,
      });
      return;
    }

    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      return;
    }

    setLoading(true);

    try {
      // Create agent session AND start workflow atomically via API
      const response = await fetch("/api/agent/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmedMessage.slice(0, 100),
          targetRepository: {
            owner: selectedRepository.owner,
            repo: selectedRepository.repo,
            branch: selectedBranch,
          },
          task: trimmedMessage,      // Pass the task prompt
          startWorkflow: true,       // Auto-start workflow
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        toast.error(data.error || "Failed to create session", {
          closeButton: true,
        });
        return;
      }

      const data = await response.json();
      const sessionId = data.session.id;

      // Redirect to session page (workflow is already started)
      router.push(`/agent/${sessionId}`);
      setMessage("");
    } catch (error) {
      console.error("Error creating session:", error);
      toast.error("Failed to create session", {
        closeButton: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-border bg-muted hover:border-muted-foreground/50 hover:bg-muted/80 focus-within:border-muted-foreground/70 focus-within:bg-muted/80 focus-within:shadow-muted-foreground/20 rounded-md border p-2 font-mono text-xs transition-all duration-200 focus-within:shadow-md">
      <div className="text-foreground flex items-center gap-1">
        <div className="border-border bg-background/50 flex items-center gap-1 rounded-md border p-1 transition-colors duration-200">
          <span className="text-muted-foreground">agent</span>
          <span className="text-muted-foreground/70">@</span>
          <span className="text-muted-foreground">github</span>
        </div>

        {/* Repository & Branch Selectors */}
        <RepositoryBranchSelectors />

        {/* Prompt */}
        <span className="text-muted-foreground">$</span>

        <Button
          onClick={handleSend}
          disabled={
            disabled ||
            !message.trim() ||
            !selectedRepository ||
            !selectedBranch ||
            repoLoading ||
            loading
          }
          size="icon"
          className="ml-auto size-8 rounded-full border border-white/20 bg-primary transition-all duration-200 hover:bg-primary/90 hover:border-white/30 disabled:border-transparent"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUp className="size-4" />
          )}
        </Button>
      </div>

      {/* Multiline Input */}
      <div className="my-2 flex gap-2">
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder={placeholder}
          disabled={disabled || loading}
          className="text-foreground placeholder:text-muted-foreground focus:placeholder:text-muted-foreground/60 max-h-[50vh] min-h-[80px] flex-1 resize-none border-none bg-transparent p-0 font-mono text-xs shadow-none transition-all duration-200 focus-visible:ring-0 focus-visible:ring-offset-0"
          rows={6}
        />
      </div>

      {/* Help text */}
      <div className="text-muted-foreground mt-1 text-xs">
        Press Cmd+Enter to send
      </div>
    </div>
  );
}
