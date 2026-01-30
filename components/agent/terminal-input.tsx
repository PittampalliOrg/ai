"use client";

import type React from "react";
import { useState, useCallback } from "react";
import { Paperclip } from "lucide-react";
import { RepositoryBranchSelectors } from "./repo-branch-selectors";
import { useRouter } from "next/navigation";
import { useGitHubAppProvider } from "@/providers/github-app";
import { toast } from "sonner";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
  PromptInputButton,
  usePromptInputAttachments,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentInfo,
  AttachmentRemove,
} from "@/components/ai-elements/attachments";

interface TerminalInputProps {
  placeholder?: string;
  disabled?: boolean;
}

function AttachmentButton() {
  const attachments = usePromptInputAttachments();
  return (
    <PromptInputButton
      type="button"
      onClick={() => attachments.openFileDialog()}
      className="text-muted-foreground hover:text-foreground"
    >
      <Paperclip className="size-4" />
    </PromptInputButton>
  );
}

function AttachmentList() {
  const attachments = usePromptInputAttachments();

  if (attachments.files.length === 0) return null;

  return (
    <Attachments variant="inline" className="flex flex-wrap gap-2 px-3 pt-2">
      {attachments.files.map((file) => (
        <Attachment
          key={file.id}
          data={file}
          onRemove={() => attachments.remove(file.id)}
        >
          <AttachmentPreview />
          <AttachmentInfo />
          <AttachmentRemove />
        </Attachment>
      ))}
    </Attachments>
  );
}

export function TerminalInput({
  placeholder = "Describe your coding task or ask a question...",
  disabled = false,
}: TerminalInputProps) {
  const router = useRouter();
  const { selectedRepository, selectedBranch, isLoading: repoLoading } =
    useGitHubAppProvider();
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(async (message: PromptInputMessage) => {
    if (!selectedRepository) {
      toast.error("Please select a repository first", {
        closeButton: true,
      });
      throw new Error("No repository selected");
    }

    if (!selectedBranch) {
      toast.error("Please select a branch first", {
        closeButton: true,
      });
      throw new Error("No branch selected");
    }

    const trimmedMessage = message.text.trim();
    if (!trimmedMessage) {
      throw new Error("Empty message");
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
          task: trimmedMessage,
          startWorkflow: true,
          // Include file attachments if any
          attachments: message.files.length > 0 ? message.files : undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        toast.error(data.error || "Failed to create session", {
          closeButton: true,
        });
        throw new Error(data.error || "Failed to create session");
      }

      const data = await response.json();
      const sessionId = data.session.id;

      // Redirect to session page (workflow is already started)
      router.push(`/agent/${sessionId}`);
    } catch (error) {
      console.error("Error creating session:", error);
      if (error instanceof Error && !error.message.includes("repository") && !error.message.includes("branch")) {
        toast.error("Failed to create session", {
          closeButton: true,
        });
      }
      throw error;
    } finally {
      setLoading(false);
    }
  }, [selectedRepository, selectedBranch, router]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Cmd+Enter or Ctrl+Enter
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const form = e.currentTarget.form;
      form?.requestSubmit();
    }
    // Prevent default Enter behavior (PromptInputTextarea handles Enter as submit)
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
    }
  };

  const isDisabled = disabled || loading || repoLoading;

  return (
    <div className="border-border bg-muted hover:border-muted-foreground/50 hover:bg-muted/80 focus-within:border-muted-foreground/70 focus-within:bg-muted/80 focus-within:shadow-muted-foreground/20 rounded-md border p-2 font-mono text-xs transition-all duration-200 focus-within:shadow-md">
      {/* Header with agent info and selectors */}
      <div className="text-foreground flex items-center gap-1 mb-2">
        <div className="border-border bg-background/50 flex items-center gap-1 rounded-md border p-1 transition-colors duration-200">
          <span className="text-muted-foreground">agent</span>
          <span className="text-muted-foreground/70">@</span>
          <span className="text-muted-foreground">github</span>
        </div>

        {/* Repository & Branch Selectors */}
        <RepositoryBranchSelectors />

        {/* Prompt indicator */}
        <span className="text-muted-foreground">$</span>
      </div>

      {/* PromptInput form */}
      <PromptInput
        onSubmit={handleSubmit}
        accept="image/*,.pdf,.txt,.md,.json,.csv"
        multiple
        className="border-0 bg-transparent shadow-none"
        onError={(err) => {
          toast.error(err.message, { closeButton: true });
        }}
      >
        {/* Attachments display */}
        <AttachmentList />

        {/* Textarea */}
        <PromptInputTextarea
          placeholder={placeholder}
          disabled={isDisabled}
          onKeyDown={handleKeyDown}
          className="text-foreground placeholder:text-muted-foreground focus:placeholder:text-muted-foreground/60 max-h-[50vh] min-h-[80px] font-mono text-xs bg-transparent border-0 shadow-none focus-visible:ring-0"
        />

        {/* Footer with tools and submit */}
        <PromptInputFooter className="border-0 pt-2">
          <PromptInputTools>
            <AttachmentButton />
            <span className="text-muted-foreground text-xs">
              Cmd+Enter to send
            </span>
          </PromptInputTools>
          <PromptInputSubmit
            disabled={isDisabled || !selectedRepository || !selectedBranch}
            status={loading ? "submitted" : "ready"}
            className="size-8 rounded-full border border-white/20 bg-primary transition-all duration-200 hover:bg-primary/90 hover:border-white/30 disabled:border-transparent"
          />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
