"use client";

import { useMemo, useState, useEffect, useRef, memo } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CodeBlock } from "@/components/ai-elements/code-block";
import { ChevronDownIcon, ChevronUpIcon, FileIcon, CopyIcon, MoreIcon, CheckIcon } from "@/components/icons";
import type { FileChange } from "@/contexts/workflow-execution-context";
import { toast } from "sonner";
import { computeDiff, flattenHunks } from "@/lib/diff/compute-diff";
import { highlightHunks } from "@/lib/diff/highlight-diff";
import type { DiffHunk } from "@/lib/diff/types";
import { useDiffPreferences } from "@/hooks/use-diff-preferences";
import { DiffToolbar, UnifiedDiffView, SplitDiffView } from "./diff";

interface FileDiffAccordionProps {
  file: FileChange;
  isExpanded: boolean;
  onToggle: () => void;
}

export const FileDiffAccordion = memo(function FileDiffAccordion({ file, isExpanded, onToggle }: FileDiffAccordionProps) {
  const [copied, setCopied] = useState(false);
  const [highlightedHunks, setHighlightedHunks] = useState<DiffHunk[]>([]);
  const [isHighlighting, setIsHighlighting] = useState(false);
  const { viewMode, contentMode, setViewMode, setContentMode } = useDiffPreferences();
  const hasSnapshotContent = file.oldContent !== null || file.newContent !== null;

  // Track previous inputs to avoid unnecessary re-highlighting
  const prevInputsRef = useRef<string>("");
  const highlightVersionRef = useRef<number>(0);

  // Compute diff with the new algorithm
  const diffResult = useMemo(() => {
    return computeDiff(file.oldContent, file.newContent, contentMode);
  }, [file.oldContent, file.newContent, contentMode]);

  // Create a stable key for the current diff inputs
  const inputsKey = useMemo(() => {
    return `${file.path}|${file.oldContent?.length ?? 0}|${file.newContent?.length ?? 0}|${contentMode}`;
  }, [file.path, file.oldContent, file.newContent, contentMode]);
  const showRawPatchFallback = !hasSnapshotContent && Boolean(file.rawPatch?.trim());
  const additions = file.additions || diffResult.additions;
  const deletions = file.deletions || diffResult.deletions;

  // Apply syntax highlighting asynchronously - only when inputs actually change
  useEffect(() => {
    // If not expanded or no hunks, just use raw hunks without highlighting
    if (!isExpanded || diffResult.hunks.length === 0) {
      setHighlightedHunks(diffResult.hunks);
      setIsHighlighting(false);
      return;
    }

    // Skip if inputs haven't changed (prevents flicker from parent re-renders)
    if (inputsKey === prevInputsRef.current) {
      return;
    }
    prevInputsRef.current = inputsKey;

    // Track version to handle race conditions
    const currentVersion = ++highlightVersionRef.current;

    // Start with unhighlighted hunks immediately to avoid empty state
    setHighlightedHunks(diffResult.hunks);
    setIsHighlighting(true);

    highlightHunks(diffResult.hunks, file.path)
      .then((result) => {
        // Only update if this is still the latest version
        if (highlightVersionRef.current === currentVersion) {
          setHighlightedHunks(result);
        }
      })
      .catch((error) => {
        console.warn("Failed to highlight diff:", error);
        // Keep unhighlighted hunks on error
      })
      .finally(() => {
        if (highlightVersionRef.current === currentVersion) {
          setIsHighlighting(false);
        }
      });
  }, [inputsKey, isExpanded, diffResult.hunks, file.path]);

  const handleCopyPath = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(file.path);
      setCopied(true);
      toast.success("Path copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy path");
    }
  };

  const handleCopyContent = async () => {
    try {
      const content = file.newContent || file.oldContent || file.rawPatch || "";
      await navigator.clipboard.writeText(content);
      toast.success("File content copied to clipboard");
    } catch {
      toast.error("Failed to copy content");
    }
  };

  const handleCopyDiff = async () => {
    try {
      if (file.rawPatch) {
        await navigator.clipboard.writeText(file.rawPatch);
        toast.success("Diff copied to clipboard");
        return;
      }

      const lines = flattenHunks(diffResult.hunks);
      const diffText = lines
        .map((line) => {
          const prefix = { context: " ", addition: "+", deletion: "-", header: "@@" }[line.type];
          return `${prefix} ${line.content}`;
        })
        .join("\n");
      await navigator.clipboard.writeText(diffText);
      toast.success("Diff copied to clipboard");
    } catch {
      toast.error("Failed to copy diff");
    }
  };

  // Extract filename from path for display
  const fileName = file.path.split("/").pop() || file.path;
  const dirPath = file.path.includes("/") ? file.path.substring(0, file.path.lastIndexOf("/")) : "";

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card shadow-sm">
      {/* Header - Codex style with distinct background */}
      <div className="flex w-full items-center justify-between px-4 py-3 bg-muted/50 border-b border-border hover:bg-muted/80 transition-colors">
        <button
          onClick={onToggle}
          className="flex items-center gap-3 flex-1 text-left min-w-0"
        >
          <span className="text-muted-foreground flex-shrink-0">
            {isExpanded ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
          </span>
          <span className="text-muted-foreground flex-shrink-0"><FileIcon size={16} /></span>
          <span className="truncate">
            {dirPath && (
              <span className="text-muted-foreground text-sm">{dirPath}/</span>
            )}
            <span className="font-medium text-foreground text-sm">{fileName}</span>
          </span>
        </button>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Diff toolbar (only when expanded) */}
          {isExpanded && (
            <DiffToolbar
              viewMode={viewMode}
              contentMode={contentMode}
              onViewModeChange={setViewMode}
              onContentModeChange={setContentMode}
            />
          )}

          {/* New badge (Codex green pill style) or Change stats */}
          {file.status === "D" ? (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30">
              Deleted
            </span>
          ) : file.status === "R" ? (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
              Renamed
            </span>
          ) : file.isNew ? (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
              New
            </span>
          ) : (
            <span className="text-xs font-mono tabular-nums">
              <span className="text-emerald-600 dark:text-emerald-400">+{additions}</span>
              {" "}
              <span className="text-red-600 dark:text-red-400">-{deletions}</span>
            </span>
          )}

          {/* Copy button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyPath}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
                >
                  {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Copy path</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* More menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => e.stopPropagation()}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <MoreIcon size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleCopyPath}>
                Copy file path
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCopyContent}>
                Copy file content
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCopyDiff}>
                Copy diff
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Diff Content - scrollable for long files */}
      {isExpanded && (
        <div className="max-h-[500px] overflow-y-auto">
          {file.oldPath && file.oldPath !== file.path && (
            <div className="border-b border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
              Renamed from <span className="font-mono text-foreground">{file.oldPath}</span>
            </div>
          )}

          {showRawPatchFallback ? (
            <div className="space-y-3 p-4">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                Snapshot content is unavailable for this file, so this view is showing the persisted patch instead.
              </div>
              <CodeBlock
                code={file.rawPatch || ""}
                language="diff"
                showLineNumbers
              />
            </div>
          ) : viewMode === "unified" ? (
            <UnifiedDiffView hunks={highlightedHunks} isLoading={isHighlighting} />
          ) : (
            <SplitDiffView hunks={highlightedHunks} isLoading={isHighlighting} />
          )}
        </div>
      )}
    </div>
  );
});
