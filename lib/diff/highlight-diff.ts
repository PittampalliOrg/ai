import { codeToHtml, type BundledLanguage } from "shiki";
import type { DiffLine, DiffHunk } from "./types";

/**
 * Map file extensions to shiki language identifiers
 */
const EXTENSION_TO_LANGUAGE: Record<string, BundledLanguage> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  py: "python",
  nix: "nix",
  json: "json",
  md: "markdown",
  css: "css",
  scss: "scss",
  html: "html",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  rb: "ruby",
  php: "php",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  sql: "sql",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  swift: "swift",
  vue: "vue",
  svelte: "svelte",
  xml: "xml",
  dockerfile: "dockerfile",
  graphql: "graphql",
  prisma: "prisma",
};

/**
 * Get the language for a file path
 */
export function getLanguageFromPath(filePath: string): BundledLanguage | null {
  const fileName = filePath.split("/").pop() ?? "";

  // Handle files without extensions but with known names
  const lowerFileName = fileName.toLowerCase();
  if (lowerFileName === "dockerfile") return "dockerfile";
  if (lowerFileName === "makefile") return "makefile";

  const ext = fileName.split(".").pop()?.toLowerCase();
  if (!ext) return null;

  return EXTENSION_TO_LANGUAGE[ext] ?? null;
}

/**
 * Highlight a single line of code
 */
export async function highlightLine(
  content: string,
  language: BundledLanguage
): Promise<string> {
  try {
    // Use shiki to highlight the line
    const html = await codeToHtml(content, {
      lang: language,
      theme: "one-dark-pro",
    });

    // Extract just the code content from the pre/code wrapper
    // The output is like: <pre class="..."><code>...content...</code></pre>
    const match = html.match(/<code[^>]*>([\s\S]*)<\/code>/);
    if (match?.[1]) {
      // Remove the outer span line wrapper if present
      const inner = match[1].replace(/<span class="line">([\s\S]*)<\/span>/, "$1");
      return inner;
    }

    return content;
  } catch {
    // Return plain content if highlighting fails
    return content;
  }
}

/**
 * Highlight all lines in a diff
 */
export async function highlightDiffLines(
  lines: DiffLine[],
  language: BundledLanguage | null
): Promise<DiffLine[]> {
  if (!language) {
    return lines;
  }

  // Process lines in parallel for better performance
  const highlightedLines = await Promise.all(
    lines.map(async (line) => {
      // Don't highlight header lines
      if (line.type === "header") {
        return line;
      }

      const highlightedHtml = await highlightLine(line.content, language);
      return {
        ...line,
        highlightedHtml,
      };
    })
  );

  return highlightedLines;
}

/**
 * Highlight all lines in hunks
 */
export async function highlightHunks(
  hunks: DiffHunk[],
  filePath: string
): Promise<DiffHunk[]> {
  const language = getLanguageFromPath(filePath);

  if (!language) {
    return hunks;
  }

  return Promise.all(
    hunks.map(async (hunk) => ({
      ...hunk,
      lines: await highlightDiffLines(hunk.lines, language),
    }))
  );
}
