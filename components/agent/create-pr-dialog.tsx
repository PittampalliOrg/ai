"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GitPullRequestIcon, LoaderIcon } from "@/components/icons";

interface CreatePRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repositoryOwner?: string;
  repositoryName?: string;
  branchName?: string;
  defaultTitle?: string;
  defaultBody?: string;
  onSubmit: (data: { title: string; body: string; baseBranch: string }) => Promise<void>;
}

export function CreatePRDialog({
  open,
  onOpenChange,
  repositoryOwner,
  repositoryName,
  branchName,
  defaultTitle = "",
  defaultBody = "",
  onSubmit,
}: CreatePRDialogProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [body, setBody] = useState(defaultBody);
  const [baseBranch, setBaseBranch] = useState("main");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await onSubmit({ title: title.trim(), body: body.trim(), baseBranch });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create pull request");
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasRepo = repositoryOwner && repositoryName;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitPullRequestIcon size={20} />
            Create Pull Request
          </DialogTitle>
          <DialogDescription>
            {hasRepo ? (
              <>
                Create a pull request for{" "}
                <span className="font-mono text-foreground">
                  {repositoryOwner}/{repositoryName}
                </span>
                {branchName && (
                  <>
                    {" "}from{" "}
                    <span className="font-mono text-foreground">{branchName}</span>
                  </>
                )}
              </>
            ) : (
              "Create a pull request with your changes"
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pr-title">Title</Label>
            <Input
              id="pr-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add a descriptive title..."
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pr-body">Description</Label>
            <Textarea
              id="pr-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe the changes in this pull request..."
              className="min-h-[120px] resize-none"
              disabled={isSubmitting}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="base-branch">Base Branch</Label>
              <Input
                id="base-branch"
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
                placeholder="main"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="head-branch">Head Branch</Label>
              <Input
                id="head-branch"
                value={branchName || ""}
                disabled
                className="bg-muted"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {!hasRepo && (
            <div className="rounded-md bg-yellow-50 dark:bg-yellow-900/20 p-3 text-sm text-yellow-700 dark:text-yellow-400">
              <p className="font-medium">Repository not configured</p>
              <p className="mt-1 text-yellow-600 dark:text-yellow-500">
                To create a pull request, you need to have a GitHub repository selected for this session.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !hasRepo}>
              {isSubmitting ? (
                <>
                  <LoaderIcon size={16} />
                  <span className="ml-2">Creating...</span>
                </>
              ) : (
                <>
                  <GitPullRequestIcon size={16} />
                  <span className="ml-2">Create Pull Request</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
