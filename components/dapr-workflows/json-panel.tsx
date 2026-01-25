"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface JsonPanelProps {
  title: string;
  data: unknown;
  className?: string;
  maxHeight?: string;
  showExpand?: boolean;
}

export function JsonPanel({
  title,
  data,
  className,
  maxHeight = "300px",
  showExpand = true,
}: JsonPanelProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const jsonString = JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <>
      <div
        className={cn(
          "rounded-lg border bg-[#1e2433] overflow-hidden",
          className
        )}
      >
        {/* Header - Diagrid style */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
          <span className="text-sm font-medium text-gray-300">
            {title}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto py-0 px-0 text-teal-400 hover:text-teal-300 hover:bg-transparent"
            onClick={handleCopy}
          >
            {copied ? (
              <span className="flex items-center gap-1">
                <Check className="h-3.5 w-3.5" />
                Copied
              </span>
            ) : (
              "Copy"
            )}
          </Button>
        </div>

        {/* Content */}
        <div
          className="overflow-auto p-4 font-mono text-xs relative"
          style={{ maxHeight }}
        >
          <pre className="whitespace-pre-wrap break-all text-gray-300">
            {jsonString}
          </pre>

          {/* Expand button - bottom right */}
          {showExpand && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute bottom-2 right-2 h-auto py-1 px-2 text-teal-400 hover:text-teal-300 hover:bg-transparent gap-1"
              onClick={() => setExpanded(true)}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
              Expand
            </Button>
          )}
        </div>
      </div>

      {/* Expanded Modal */}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col bg-[#1a1f2e] border-gray-700">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle className="text-gray-200">{title}</DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto py-0 px-0 text-teal-400 hover:text-teal-300 hover:bg-transparent"
              onClick={handleCopy}
            >
              {copied ? (
                <span className="flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" />
                  Copied
                </span>
              ) : (
                "Copy"
              )}
            </Button>
          </DialogHeader>
          <div className="flex-1 overflow-auto rounded-lg border border-gray-700 bg-[#1e2433] p-4 font-mono text-sm">
            <pre className="whitespace-pre-wrap break-all text-gray-300">
              {jsonString}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
