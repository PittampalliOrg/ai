"use client";

import { useMemo } from "react";
import type { DiffLine, DiffHunk } from "@/lib/diff/types";
import { SplitDiffLineRow } from "./diff-line";

interface SplitDiffViewProps {
  hunks: DiffHunk[];
  isLoading?: boolean;
}

interface SplitLinePair {
  oldLine: DiffLine | null;
  newLine: DiffLine | null;
  isHeader?: boolean;
}

/**
 * Convert unified diff lines into side-by-side pairs
 */
function convertToSplitPairs(hunks: DiffHunk[]): SplitLinePair[] {
  const pairs: SplitLinePair[] = [];

  for (const hunk of hunks) {
    // Collect deletions and additions in sequence
    const pendingDeletions: DiffLine[] = [];
    const pendingAdditions: DiffLine[] = [];

    const flushPending = () => {
      // Pair up deletions with additions
      const maxLen = Math.max(pendingDeletions.length, pendingAdditions.length);
      for (let i = 0; i < maxLen; i++) {
        pairs.push({
          oldLine: pendingDeletions[i] ?? null,
          newLine: pendingAdditions[i] ?? null,
        });
      }
      pendingDeletions.length = 0;
      pendingAdditions.length = 0;
    };

    for (const line of hunk.lines) {
      if (line.type === "header") {
        flushPending();
        pairs.push({ oldLine: line, newLine: null, isHeader: true });
      } else if (line.type === "context") {
        flushPending();
        pairs.push({ oldLine: line, newLine: line });
      } else if (line.type === "deletion") {
        pendingDeletions.push(line);
      } else if (line.type === "addition") {
        pendingAdditions.push(line);
      }
    }

    flushPending();
  }

  return pairs;
}

export function SplitDiffView({ hunks, isLoading }: SplitDiffViewProps) {
  const splitPairs = useMemo(() => convertToSplitPairs(hunks), [hunks]);

  if (isLoading) {
    return (
      <div className="bg-zinc-950/90 p-6 text-center text-zinc-500 text-sm">
        Loading diff...
      </div>
    );
  }

  if (hunks.length === 0) {
    return (
      <div className="bg-zinc-950/90 p-6 text-center text-zinc-500 text-sm">
        No changes
      </div>
    );
  }

  return (
    <div className="bg-zinc-950/90 overflow-x-auto">
      <table className="w-full text-[13px] leading-relaxed font-mono border-collapse table-fixed">
        <colgroup>
          <col className="w-14" />
          <col className="w-1/2" />
          <col className="w-14" />
          <col className="w-1/2" />
        </colgroup>
        <tbody>
          {splitPairs.map((pair, index) => (
            <SplitDiffLineRow
              key={`split-${index}`}
              oldLine={pair.oldLine}
              newLine={pair.isHeader ? null : pair.newLine}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
