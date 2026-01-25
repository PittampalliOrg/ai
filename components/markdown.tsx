"use client";

/**
 * Simple text renderer for agent messages.
 * For a full markdown implementation, install react-markdown.
 */
export function Markdown({ children }: { children: string }) {
  // Split into paragraphs and render each
  const paragraphs = children.split("\n\n");

  return (
    <div className="space-y-2">
      {paragraphs.map((paragraph, index) => {
        // Handle code blocks
        if (paragraph.startsWith("```")) {
          const lines = paragraph.split("\n");
          const language = lines[0].replace("```", "").trim();
          const code = lines.slice(1, -1).join("\n");
          return (
            <pre
              key={index}
              className="rounded bg-muted p-2 overflow-x-auto text-sm"
            >
              <code>{code}</code>
            </pre>
          );
        }

        // Handle inline code and regular text
        const parts = paragraph.split(/(`[^`]+`)/g);
        return (
          <p key={index} className="whitespace-pre-wrap">
            {parts.map((part, partIndex) => {
              if (part.startsWith("`") && part.endsWith("`")) {
                return (
                  <code
                    key={partIndex}
                    className="rounded bg-muted px-1 py-0.5 text-sm"
                  >
                    {part.slice(1, -1)}
                  </code>
                );
              }
              return part;
            })}
          </p>
        );
      })}
    </div>
  );
}
