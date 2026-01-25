"use client";

import { cn } from "@/lib/utils";
import type { DiffLine } from "@/lib/diff/types";

interface DiffLineRowProps {
  line: DiffLine;
  showOldLineNum?: boolean;
  showNewLineNum?: boolean;
}

export function DiffLineRow({
  line,
  showOldLineNum = true,
  showNewLineNum = true,
}: DiffLineRowProps) {
  // Header rows (hunk markers) get special full-width treatment - Codex style cyan
  if (line.type === "header") {
    return (
      <tr className="bg-cyan-950/30 border-y border-cyan-800/40">
        <td
          colSpan={3}
          className="px-4 py-1.5 text-xs font-mono text-cyan-400/90 font-medium"
        >
          {line.content}
        </td>
      </tr>
    );
  }

  // Codex-style backgrounds with better contrast
  const bgClass = {
    context: "",
    addition: "bg-emerald-950/40",
    deletion: "bg-red-950/40",
  }[line.type];

  // Codex-style text colors with better contrast
  const textClass = {
    context: "text-zinc-200",
    addition: "text-emerald-200",
    deletion: "text-red-200",
  }[line.type];

  // Line number background for additions/deletions
  const lineNumBgClass = {
    context: "",
    addition: "bg-emerald-950/25",
    deletion: "bg-red-950/25",
  }[line.type];

  const prefix = {
    context: " ",
    addition: "+",
    deletion: "-",
  }[line.type];

  const prefixClass = {
    context: "text-zinc-600",
    addition: "text-emerald-400",
    deletion: "text-red-400",
  }[line.type];

  return (
    <tr className={cn(bgClass, "hover:bg-zinc-700/20 transition-colors")}>
      {/* Old line number */}
      {showOldLineNum && (
        <td className={cn(
          "w-14 px-3 py-0.5 text-right text-zinc-500 select-none border-r border-zinc-700/40",
          lineNumBgClass
        )}>
          {line.oldLineNum ?? ""}
        </td>
      )}
      {/* New line number */}
      {showNewLineNum && (
        <td className={cn(
          "w-14 px-3 py-0.5 text-right text-zinc-500 select-none border-r border-zinc-700/40",
          lineNumBgClass
        )}>
          {line.newLineNum ?? ""}
        </td>
      )}
      {/* Content */}
      <td className={cn("px-4 py-0.5 whitespace-pre", textClass)}>
        <span className={cn("select-none mr-3 font-semibold", prefixClass)}>{prefix}</span>
        {line.highlightedHtml ? (
          <span
            // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for syntax highlighting
            dangerouslySetInnerHTML={{ __html: line.highlightedHtml }}
          />
        ) : (
          line.content
        )}
      </td>
    </tr>
  );
}

interface SplitDiffLineRowProps {
  oldLine: DiffLine | null;
  newLine: DiffLine | null;
}

export function SplitDiffLineRow({ oldLine, newLine }: SplitDiffLineRowProps) {
  // Handle header lines - Codex style cyan
  if (oldLine?.type === "header" || newLine?.type === "header") {
    const headerLine = oldLine || newLine;
    return (
      <tr className="bg-cyan-950/30 border-y border-cyan-800/40">
        <td
          colSpan={4}
          className="px-4 py-1.5 text-xs font-mono text-cyan-400/90 font-medium"
        >
          {headerLine?.content ?? ""}
        </td>
      </tr>
    );
  }

  // Codex-style backgrounds with better contrast
  const getBgClass = (line: DiffLine | null) => {
    if (!line) return "bg-zinc-900/30";
    return {
      context: "",
      addition: "bg-emerald-950/40",
      deletion: "bg-red-950/40",
      header: "bg-cyan-950/30",
    }[line.type];
  };

  // Codex-style text colors with better contrast
  const getTextClass = (line: DiffLine | null) => {
    if (!line) return "text-zinc-600";
    return {
      context: "text-zinc-200",
      addition: "text-emerald-200",
      deletion: "text-red-200",
      header: "text-cyan-400",
    }[line.type];
  };

  // Line number background
  const getLineNumBgClass = (line: DiffLine | null) => {
    if (!line) return "bg-zinc-900/20";
    return {
      context: "",
      addition: "bg-emerald-950/25",
      deletion: "bg-red-950/25",
      header: "",
    }[line.type];
  };

  const getPrefix = (line: DiffLine | null) => {
    if (!line) return " ";
    return {
      context: " ",
      addition: "+",
      deletion: "-",
      header: "@@",
    }[line.type];
  };

  const getPrefixClass = (line: DiffLine | null) => {
    if (!line) return "text-zinc-600";
    return {
      context: "text-zinc-600",
      addition: "text-emerald-400",
      deletion: "text-red-400",
      header: "text-cyan-400",
    }[line.type];
  };

  const renderContent = (line: DiffLine | null) => {
    if (!line) return null;
    if (line.highlightedHtml) {
      return (
        <span
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for syntax highlighting
          dangerouslySetInnerHTML={{ __html: line.highlightedHtml }}
        />
      );
    }
    return line.content;
  };

  return (
    <tr className="hover:bg-zinc-700/20 transition-colors">
      {/* Old side */}
      <td className={cn(
        "w-14 px-3 py-0.5 text-right text-zinc-500 select-none border-r border-zinc-700/40",
        getLineNumBgClass(oldLine),
        getBgClass(oldLine)
      )}>
        {oldLine?.oldLineNum ?? ""}
      </td>
      <td className={cn(
        "px-4 py-0.5 whitespace-pre border-r border-zinc-600/30",
        getBgClass(oldLine),
        getTextClass(oldLine)
      )}>
        {oldLine && (
          <>
            <span className={cn("select-none mr-3 font-semibold", getPrefixClass(oldLine))}>{getPrefix(oldLine)}</span>
            {renderContent(oldLine)}
          </>
        )}
      </td>

      {/* New side */}
      <td className={cn(
        "w-14 px-3 py-0.5 text-right text-zinc-500 select-none border-r border-zinc-700/40",
        getLineNumBgClass(newLine),
        getBgClass(newLine)
      )}>
        {newLine?.newLineNum ?? ""}
      </td>
      <td className={cn(
        "px-4 py-0.5 whitespace-pre",
        getBgClass(newLine),
        getTextClass(newLine)
      )}>
        {newLine && (
          <>
            <span className={cn("select-none mr-3 font-semibold", getPrefixClass(newLine))}>{getPrefix(newLine)}</span>
            {renderContent(newLine)}
          </>
        )}
      </td>
    </tr>
  );
}
