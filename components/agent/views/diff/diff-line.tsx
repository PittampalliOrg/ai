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
  // Header rows (hunk markers) - Codex style blue tint
  if (line.type === "header") {
    return (
      <tr className="bg-blue-950/40">
        <td
          colSpan={3}
          className="px-4 py-2 text-xs font-mono text-blue-300"
        >
          {line.content}
        </td>
      </tr>
    );
  }

  // Codex-style dark backgrounds (always dark like Codex)
  const bgClass = {
    context: "bg-[#0d1117]",
    addition: "bg-green-950/60",
    deletion: "bg-red-950/50",
  }[line.type];

  // Codex-style text colors - light on dark
  const textClass = {
    context: "text-zinc-300",
    addition: "text-green-200",
    deletion: "text-red-200",
  }[line.type];

  // Line number styling - muted
  const lineNumClass = {
    context: "text-zinc-600",
    addition: "text-green-700",
    deletion: "text-red-700",
  }[line.type];

  const prefix = {
    context: " ",
    addition: "+",
    deletion: "-",
  }[line.type];

  const prefixClass = {
    context: "text-zinc-600",
    addition: "text-green-500",
    deletion: "text-red-500",
  }[line.type];

  return (
    <tr className={cn(bgClass, "hover:brightness-110 transition-all")}>
      {/* Old line number */}
      {showOldLineNum && (
        <td className={cn(
          "w-12 px-2 py-0 text-right text-[13px] select-none border-r border-zinc-800 tabular-nums",
          lineNumClass
        )}>
          {line.oldLineNum ?? ""}
        </td>
      )}
      {/* New line number */}
      {showNewLineNum && (
        <td className={cn(
          "w-12 px-2 py-0 text-right text-[13px] select-none border-r border-zinc-800 tabular-nums",
          lineNumClass
        )}>
          {line.newLineNum ?? ""}
        </td>
      )}
      {/* Content - sharp code rendering */}
      <td className={cn(
        "px-3 py-0 whitespace-pre",
        "antialiased",
        "[font-feature-settings:'liga'_0,'calt'_1]",
        textClass
      )}>
        <span className={cn("select-none mr-2 font-medium", prefixClass)}>{prefix}</span>
        {line.highlightedHtml ? (
          <span
            className="[&_span]:tracking-tight"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for syntax highlighting
            dangerouslySetInnerHTML={{ __html: line.highlightedHtml }}
          />
        ) : (
          <span className="tracking-tight">{line.content}</span>
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
  // Handle header lines - Codex style blue tint
  if (oldLine?.type === "header" || newLine?.type === "header") {
    const headerLine = oldLine || newLine;
    return (
      <tr className="bg-blue-950/40">
        <td
          colSpan={4}
          className="px-4 py-2 text-xs font-mono text-blue-300"
        >
          {headerLine?.content ?? ""}
        </td>
      </tr>
    );
  }

  // Codex-style dark backgrounds (always dark)
  const getBgClass = (line: DiffLine | null) => {
    if (!line) return "bg-[#0d1117]/50";
    return {
      context: "bg-[#0d1117]",
      addition: "bg-green-950/60",
      deletion: "bg-red-950/50",
      header: "bg-blue-950/40",
    }[line.type];
  };

  // Codex-style text colors - light on dark
  const getTextClass = (line: DiffLine | null) => {
    if (!line) return "text-zinc-700";
    return {
      context: "text-zinc-300",
      addition: "text-green-200",
      deletion: "text-red-200",
      header: "text-blue-300",
    }[line.type];
  };

  // Line number colors - muted
  const getLineNumClass = (line: DiffLine | null) => {
    if (!line) return "text-zinc-700";
    return {
      context: "text-zinc-600",
      addition: "text-green-700",
      deletion: "text-red-700",
      header: "text-blue-500",
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
    if (!line) return "text-zinc-700";
    return {
      context: "text-zinc-600",
      addition: "text-green-500",
      deletion: "text-red-500",
      header: "text-blue-300",
    }[line.type];
  };

  const renderContent = (line: DiffLine | null) => {
    if (!line) return null;
    if (line.highlightedHtml) {
      return (
        <span
          className="[&_span]:tracking-tight"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Required for syntax highlighting
          dangerouslySetInnerHTML={{ __html: line.highlightedHtml }}
        />
      );
    }
    return <span className="tracking-tight">{line.content}</span>;
  };

  return (
    <tr className="hover:brightness-110 transition-all">
      {/* Old side */}
      <td className={cn(
        "w-12 px-2 py-0 text-right text-[13px] select-none border-r border-zinc-800 tabular-nums",
        getBgClass(oldLine),
        getLineNumClass(oldLine)
      )}>
        {oldLine?.oldLineNum ?? ""}
      </td>
      <td className={cn(
        "px-3 py-0 whitespace-pre border-r border-zinc-700/50 antialiased",
        "[font-feature-settings:'liga'_0,'calt'_1]",
        getBgClass(oldLine),
        getTextClass(oldLine)
      )}>
        {oldLine && (
          <>
            <span className={cn("select-none mr-2 font-medium", getPrefixClass(oldLine))}>{getPrefix(oldLine)}</span>
            {renderContent(oldLine)}
          </>
        )}
      </td>

      {/* New side */}
      <td className={cn(
        "w-12 px-2 py-0 text-right text-[13px] select-none border-r border-zinc-800 tabular-nums",
        getBgClass(newLine),
        getLineNumClass(newLine)
      )}>
        {newLine?.newLineNum ?? ""}
      </td>
      <td className={cn(
        "px-3 py-0 whitespace-pre antialiased",
        "[font-feature-settings:'liga'_0,'calt'_1]",
        getBgClass(newLine),
        getTextClass(newLine)
      )}>
        {newLine && (
          <>
            <span className={cn("select-none mr-2 font-medium", getPrefixClass(newLine))}>{getPrefix(newLine)}</span>
            {renderContent(newLine)}
          </>
        )}
      </td>
    </tr>
  );
}
