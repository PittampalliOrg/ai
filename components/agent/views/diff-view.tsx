"use client";

import { useMemo, memo } from "react";
import type { FileChange } from "@/contexts/workflow-execution-context";
import { FileDiffAccordion } from "./file-diff-accordion";

interface DiffViewProps {
  fileChanges: Map<string, FileChange>;
  fileChangeArray: FileChange[]; // Stable array from hook
  selectedFile: string | null;
  onFileSelect: (path: string | null) => void;
  isLoading?: boolean;
  hasDurableDiffs?: boolean;
  isWorkflowActive?: boolean;
}

export const DiffView = memo(function DiffView({
  fileChanges,
  fileChangeArray,
  selectedFile,
  onFileSelect,
  isLoading = false,
  hasDurableDiffs = false,
  isWorkflowActive = false,
}: DiffViewProps) {
  // Calculate total stats using stable array
  const stats = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    let newFiles = 0;

    fileChangeArray.forEach((file) => {
      additions += file.additions;
      deletions += file.deletions;
      if (file.isNew) newFiles++;
    });

    return { additions, deletions, newFiles, totalFiles: fileChanges.size };
  }, [fileChangeArray, fileChanges]);

  if (fileChangeArray.length === 0) {
    const helperText = isLoading
      ? "Waiting for persisted file changes from the execution."
      : hasDurableDiffs
        ? isWorkflowActive
          ? "The agent is running, but no durable file-change artifacts have been published yet."
          : "No durable file-change artifacts were found for this run. Older runs may only have coarse workflow state."
        : "Files will appear here when modified by the agent.";

    return (
      <div className="flex h-full items-center justify-center p-8 text-zinc-500">
        <p className="text-center">
          {isLoading ? "Loading file changes..." : "No file changes to display."}
          <br />
          <span className="text-sm">{helperText}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-5 space-y-4">
      {/* Summary header - Codex style with enhanced styling */}
      <div className="flex items-center justify-between px-2 pb-3 border-b border-zinc-700/40">
        <span className="text-sm font-medium text-zinc-300">
          {stats.totalFiles} {stats.totalFiles === 1 ? "file" : "files"} changed
          {stats.newFiles > 0 && (
            <span className="ml-2 text-zinc-500 font-normal">
              ({stats.newFiles} new)
            </span>
          )}
        </span>
        <span className="text-sm font-mono tabular-nums">
          <span className="text-emerald-400 font-medium">+{stats.additions}</span>
          <span className="text-zinc-600 mx-1">/</span>
          <span className="text-red-400 font-medium">-{stats.deletions}</span>
        </span>
      </div>

      {/* File list with enhanced visual separation */}
      <div className="space-y-4">
        {fileChangeArray.map((file) => (
          <FileDiffAccordion
            key={file.path}
            file={file}
            isExpanded={selectedFile === file.path || fileChangeArray.length === 1}
            onToggle={() => onFileSelect(selectedFile === file.path ? null : file.path)}
          />
        ))}
      </div>
    </div>
  );
});
