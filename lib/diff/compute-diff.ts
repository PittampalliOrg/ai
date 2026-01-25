import { diff_match_patch, DIFF_DELETE, DIFF_INSERT, DIFF_EQUAL } from "diff-match-patch";
import type { DiffHunk, DiffLine, DiffResult, DiffContentMode } from "./types";

const CONTEXT_LINES = 3;

/**
 * Convert lines to unique characters for line-mode diffing.
 * This technique is from the diff-match-patch library.
 */
function linesToChars(
  oldLines: string[],
  newLines: string[]
): { chars1: string; chars2: string; lineArray: string[] } {
  const lineArray: string[] = [];
  const lineHash: Record<string, number> = {};

  function linesToCharsMunge(lines: string[]): string {
    let chars = "";
    for (const line of lines) {
      if (line in lineHash) {
        chars += String.fromCharCode(lineHash[line]);
      } else {
        lineHash[line] = lineArray.length;
        lineArray.push(line);
        chars += String.fromCharCode(lineArray.length - 1);
      }
    }
    return chars;
  }

  const chars1 = linesToCharsMunge(oldLines);
  const chars2 = linesToCharsMunge(newLines);

  return { chars1, chars2, lineArray };
}

/**
 * Convert character-level diff back to line-level diff
 */
function charsToLines(
  diffs: [number, string][],
  lineArray: string[]
): [number, string[]][] {
  return diffs.map(([op, chars]) => {
    const lines: string[] = [];
    for (let i = 0; i < chars.length; i++) {
      lines.push(lineArray[chars.charCodeAt(i)]);
    }
    return [op, lines];
  });
}

/**
 * Generate hunks from line-level diffs
 */
function generateHunks(
  lineDiffs: [number, string[]][],
  contentMode: DiffContentMode
): DiffHunk[] {
  // Build a flat array of all line changes
  const allLines: { op: number; content: string }[] = [];

  for (const [op, lines] of lineDiffs) {
    for (const line of lines) {
      allLines.push({ op, content: line });
    }
  }

  if (allLines.length === 0) {
    return [];
  }

  // Group into hunks
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let oldLineNum = 1;
  let newLineNum = 1;

  // Track which indices have changes (for incremental mode)
  const changeIndices: Set<number> = new Set();
  allLines.forEach((item, idx) => {
    if (item.op !== DIFF_EQUAL) {
      changeIndices.add(idx);
    }
  });

  // For incremental mode, also mark context lines around changes
  const visibleIndices: Set<number> = new Set();
  if (contentMode === "incremental") {
    changeIndices.forEach((idx) => {
      for (let i = Math.max(0, idx - CONTEXT_LINES); i <= Math.min(allLines.length - 1, idx + CONTEXT_LINES); i++) {
        visibleIndices.add(i);
      }
    });
  } else {
    // Full mode - show all lines
    allLines.forEach((_, idx) => visibleIndices.add(idx));
  }

  // Generate hunks
  let hunkOldStart = 0;
  let hunkNewStart = 0;
  let hunkOldLines = 0;
  let hunkNewLines = 0;
  let hunkDiffLines: DiffLine[] = [];
  let lastVisibleIdx = -Infinity;

  allLines.forEach((item, idx) => {
    const isVisible = visibleIndices.has(idx);

    if (!isVisible) {
      // Not visible - finalize current hunk if exists
      if (hunkDiffLines.length > 0) {
        hunks.push({
          oldStart: hunkOldStart,
          oldLines: hunkOldLines,
          newStart: hunkNewStart,
          newLines: hunkNewLines,
          lines: [
            {
              type: "header",
              content: `@@ -${hunkOldStart},${hunkOldLines} +${hunkNewStart},${hunkNewLines} @@`,
              oldLineNum: null,
              newLineNum: null,
            },
            ...hunkDiffLines,
          ],
        });
        hunkDiffLines = [];
        hunkOldLines = 0;
        hunkNewLines = 0;
      }

      // Update line numbers for invisible lines
      if (item.op === DIFF_EQUAL || item.op === DIFF_DELETE) {
        oldLineNum++;
      }
      if (item.op === DIFF_EQUAL || item.op === DIFF_INSERT) {
        newLineNum++;
      }
      return;
    }

    // Start new hunk if needed
    if (hunkDiffLines.length === 0) {
      hunkOldStart = oldLineNum;
      hunkNewStart = newLineNum;
    }

    // Add line to current hunk
    let line: DiffLine;
    if (item.op === DIFF_EQUAL) {
      line = {
        type: "context",
        content: item.content,
        oldLineNum: oldLineNum,
        newLineNum: newLineNum,
      };
      hunkOldLines++;
      hunkNewLines++;
      oldLineNum++;
      newLineNum++;
    } else if (item.op === DIFF_DELETE) {
      line = {
        type: "deletion",
        content: item.content,
        oldLineNum: oldLineNum,
        newLineNum: null,
      };
      hunkOldLines++;
      oldLineNum++;
    } else {
      line = {
        type: "addition",
        content: item.content,
        oldLineNum: null,
        newLineNum: newLineNum,
      };
      hunkNewLines++;
      newLineNum++;
    }

    hunkDiffLines.push(line);
    lastVisibleIdx = idx;
  });

  // Finalize last hunk
  if (hunkDiffLines.length > 0) {
    hunks.push({
      oldStart: hunkOldStart,
      oldLines: hunkOldLines,
      newStart: hunkNewStart,
      newLines: hunkNewLines,
      lines: [
        {
          type: "header",
          content: `@@ -${hunkOldStart},${hunkOldLines} +${hunkNewStart},${hunkNewLines} @@`,
          oldLineNum: null,
          newLineNum: null,
        },
        ...hunkDiffLines,
      ],
    });
  }

  return hunks;
}

/**
 * Compute diff between old and new content
 */
export function computeDiff(
  oldContent: string | null,
  newContent: string | null,
  contentMode: DiffContentMode = "incremental"
): DiffResult {
  const oldLines = oldContent?.split("\n") ?? [];
  const newLines = newContent?.split("\n") ?? [];

  // Handle special cases
  if (oldContent === null && newContent !== null) {
    // New file - all additions
    const lines: DiffLine[] = [
      {
        type: "header",
        content: `@@ -0,0 +1,${newLines.length} @@`,
        oldLineNum: null,
        newLineNum: null,
      },
      ...newLines.map((line, idx) => ({
        type: "addition" as const,
        content: line,
        oldLineNum: null,
        newLineNum: idx + 1,
      })),
    ];

    return {
      hunks: [{
        oldStart: 0,
        oldLines: 0,
        newStart: 1,
        newLines: newLines.length,
        lines,
      }],
      additions: newLines.length,
      deletions: 0,
    };
  }

  if (oldContent !== null && newContent === null) {
    // Deleted file - all deletions
    const lines: DiffLine[] = [
      {
        type: "header",
        content: `@@ -1,${oldLines.length} +0,0 @@`,
        oldLineNum: null,
        newLineNum: null,
      },
      ...oldLines.map((line, idx) => ({
        type: "deletion" as const,
        content: line,
        oldLineNum: idx + 1,
        newLineNum: null,
      })),
    ];

    return {
      hunks: [{
        oldStart: 1,
        oldLines: oldLines.length,
        newStart: 0,
        newLines: 0,
        lines,
      }],
      additions: 0,
      deletions: oldLines.length,
    };
  }

  if (oldContent === null && newContent === null) {
    return { hunks: [], additions: 0, deletions: 0 };
  }

  // Modified file - compute diff
  const dmp = new diff_match_patch();

  // Convert to line-mode
  const { chars1, chars2, lineArray } = linesToChars(oldLines, newLines);

  // Compute diff on characters (which represent lines)
  const charDiffs = dmp.diff_main(chars1, chars2, false);

  // Optionally clean up for readability
  dmp.diff_cleanupSemantic(charDiffs);

  // Convert back to lines
  const lineDiffs = charsToLines(charDiffs, lineArray);

  // Count additions and deletions
  let additions = 0;
  let deletions = 0;

  for (const [op, lines] of lineDiffs) {
    if (op === DIFF_INSERT) {
      additions += lines.length;
    } else if (op === DIFF_DELETE) {
      deletions += lines.length;
    }
  }

  // Generate hunks
  const hunks = generateHunks(lineDiffs, contentMode);

  return { hunks, additions, deletions };
}

/**
 * Flatten hunks into a single array of DiffLines
 */
export function flattenHunks(hunks: DiffHunk[]): DiffLine[] {
  return hunks.flatMap((hunk) => hunk.lines);
}
