"use client";

import type { DiffLine, DiffHunk } from "@/lib/diff/types";
import { DiffLineRow } from "./diff-line";

interface UnifiedDiffViewProps {
  hunks: DiffHunk[];
  isLoading?: boolean;
}

export function UnifiedDiffView({ hunks, isLoading }: UnifiedDiffViewProps) {
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

  // Flatten hunks into lines for unified display
  const allLines: DiffLine[] = hunks.flatMap((hunk) => hunk.lines);

  return (
    <div className="bg-zinc-950/90 overflow-x-auto">
      <table className="w-full text-[13px] leading-relaxed font-mono border-collapse">
        <tbody>
          {allLines.map((line, index) => (
            <DiffLineRow
              key={`${line.type}-${line.oldLineNum ?? "n"}-${line.newLineNum ?? "n"}-${index}`}
              line={line}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
