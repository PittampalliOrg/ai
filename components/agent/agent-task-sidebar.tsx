"use client";

import { useState, useMemo, memo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  FileIcon,
  LoaderIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
  InfoIcon,
  MicrophoneIcon,
} from "@/components/icons";
import type { FileChange } from "@/hooks/use-agent-execution";
import { cn } from "@/lib/utils";

interface AgentTaskSidebarProps {
  taskPrompt: string | null;
  executionTime: string;
  status: "idle" | "running" | "completed" | "error";
  summary: string[];
  fileChanges: Map<string, FileChange>;
  fileChangeArray: FileChange[]; // Stable array from hook
  selectedFile: string | null;
  onFileSelect: (path: string) => void;
  onFollowUp: (message: string) => void;
  isLoading: boolean;
}

export const AgentTaskSidebar = memo(function AgentTaskSidebar({
  taskPrompt,
  executionTime,
  status,
  summary,
  fileChanges,
  fileChangeArray,
  selectedFile,
  onFileSelect,
  onFollowUp,
  isLoading,
}: AgentTaskSidebarProps) {
  const [followUpInput, setFollowUpInput] = useState("");
  const [filesOpen, setFilesOpen] = useState(true);
  const [timeOpen, setTimeOpen] = useState(false);
  const [testingOpen, setTestingOpen] = useState(false);

  const handleFollowUp = () => {
    if (!followUpInput.trim() || isLoading) return;
    onFollowUp(followUpInput);
    setFollowUpInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleFollowUp();
    }
  };

  // Use memoized stats to avoid recalculation
  const { totalAdditions, totalDeletions } = useMemo(() => ({
    totalAdditions: fileChangeArray.reduce((sum, f) => sum + f.additions, 0),
    totalDeletions: fileChangeArray.reduce((sum, f) => sum + f.deletions, 0),
  }), [fileChangeArray]);

  return (
    <div className="flex h-full w-[400px] min-w-[400px] flex-shrink-0 flex-col border-r bg-background">
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Task Prompt */}
          {taskPrompt && (
            <div className="rounded-lg bg-muted p-3">
              <p className="text-sm">{taskPrompt}</p>
            </div>
          )}

          {/* Execution Time - Expandable */}
          {(executionTime || status === "running") && (
            <Collapsible open={timeOpen} onOpenChange={setTimeOpen}>
              <CollapsibleTrigger asChild>
                <button className="flex w-full items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <ClockIcon size={14} />
                  <span>
                    Worked for {executionTime || "0s"}
                    {status === "running" && "..."}
                  </span>
                  {status === "running" && (
                    <span className="animate-spin ml-1">
                      <LoaderIcon size={12} />
                    </span>
                  )}
                  {timeOpen ? (
                    <ChevronUpIcon size={12} />
                  ) : (
                    <ChevronDownIcon size={12} />
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 ml-5 text-xs text-muted-foreground space-y-1">
                  <p>• Time includes model reasoning and tool execution</p>
                  <p>• Actual wall clock time may vary from perceived time</p>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Summary Section with Info Icons */}
          {summary.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold">Summary</h3>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-muted-foreground cursor-help">
                        <InfoIcon size={12} />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p className="text-xs max-w-[200px]">
                        Auto-generated summary of changes made by the agent
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <ul className="space-y-1.5">
                {summary.map((item, index) => (
                  <li key={index} className="text-sm text-muted-foreground flex items-start gap-2 group">
                    <span className="text-green-500 flex-shrink-0 mt-0.5">✓</span>
                    <span className="flex-1">{item}</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex-shrink-0 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-help mt-0.5">
                            <InfoIcon size={12} />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p className="text-xs max-w-[200px]">
                            Click to see related changes in the diff view
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Testing Section */}
          {status !== "idle" && (
            <Collapsible open={testingOpen} onOpenChange={setTestingOpen}>
              <CollapsibleTrigger asChild>
                <button className="flex w-full items-center justify-between py-1 text-sm font-semibold hover:text-foreground">
                  <span className="flex items-center gap-2">
                    Testing
                    {status === "completed" && (
                      <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                        Not run
                      </Badge>
                    )}
                  </span>
                  {testingOpen ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 space-y-3">
                  {/* Warning message */}
                  <div className="flex items-start gap-2 text-xs">
                    <span className="text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5">⚠</span>
                    <div className="text-muted-foreground">
                      <span className="font-mono text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-900/30 px-1 py-0.5 rounded">npm test</span>
                      {" "}was not run
                    </div>
                  </div>

                  {/* Suggested action */}
                  <div className="bg-muted/50 rounded-md p-2.5 text-xs space-y-2">
                    <p className="text-muted-foreground">
                      Run tests manually to verify changes:
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-zinc-900 text-zinc-300 px-2 py-1.5 rounded font-mono text-xs">
                        npm test
                      </code>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-muted-foreground hover:text-foreground"
                              onClick={async () => {
                                await navigator.clipboard.writeText("npm test");
                              }}
                            >
                              Copy
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p className="text-xs">Copy command</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>

                  {/* CI integration note */}
                  <p className="text-xs text-muted-foreground/70 italic">
                    Future: CI test results will appear here after PR creation
                  </p>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          <Separator />

          {/* Files Section */}
          <Collapsible open={filesOpen} onOpenChange={setFilesOpen}>
            <CollapsibleTrigger asChild>
              <button className="flex w-full items-center justify-between py-1 text-sm font-semibold hover:text-foreground">
                <span className="flex items-center gap-2">
                  Files ({fileChanges.size})
                  {fileChangeArray.length > 0 && (
                    <span className="text-xs font-normal font-mono">
                      <span className="text-green-500">+{totalAdditions}</span>
                      {" "}
                      <span className="text-red-500">-{totalDeletions}</span>
                    </span>
                  )}
                </span>
                {filesOpen ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 space-y-1">
                {fileChangeArray.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No files modified</p>
                ) : (
                  fileChangeArray.map((file) => (
                    <FileListItem
                      key={file.path}
                      file={file}
                      isSelected={selectedFile === file.path}
                      onSelect={() => onFileSelect(file.path)}
                    />
                  ))
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          {/* Feedback */}
          {status === "completed" && (
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground mr-2">Rate this task:</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20">
                      <ThumbsUpIcon size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">Good result</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                      <ThumbsDownIcon size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">Needs improvement</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Follow-up Input */}
      <div className="border-t p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Textarea
              value={followUpInput}
              onChange={(e) => setFollowUpInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Request changes or ask a question..."
              className="min-h-[60px] resize-none text-sm pr-10"
              disabled={isLoading}
            />
            {/* Microphone button (voice input placeholder) */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute bottom-2 right-2 h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      // Voice input is a future feature
                      // For now, show a toast indicating it's coming soon
                    }}
                    disabled={isLoading}
                  >
                    <MicrophoneIcon size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">Voice input (coming soon)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Button
            onClick={handleFollowUp}
            disabled={!followUpInput.trim() || isLoading}
            size="sm"
            className="h-auto"
          >
            {isLoading ? <LoaderIcon size={16} /> : <ArrowUpIcon size={16} />}
          </Button>
        </div>
      </div>
    </div>
  );
});

interface FileListItemProps {
  file: FileChange;
  isSelected: boolean;
  onSelect: () => void;
}

const FileListItem = memo(function FileListItem({ file, isSelected, onSelect }: FileListItemProps) {
  const fileName = file.path.split("/").pop() || file.path;
  const dirPath = file.path.includes("/")
    ? file.path.substring(0, file.path.lastIndexOf("/"))
    : "";

  // Get file extension for potential icon differentiation
  const extension = fileName.includes(".") ? fileName.split(".").pop() : "";

  // Determine file type color based on extension
  const getExtensionColor = () => {
    switch (extension) {
      case "ts":
      case "tsx":
        return "text-blue-500";
      case "js":
      case "jsx":
        return "text-yellow-500";
      case "css":
      case "scss":
        return "text-purple-500";
      case "json":
        return "text-orange-500";
      case "md":
        return "text-gray-400";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onSelect}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors group",
              isSelected
                ? "bg-accent text-accent-foreground"
                : "hover:bg-muted"
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className={cn("flex-shrink-0", getExtensionColor())}>
                <FileIcon size={14} />
              </span>
              <div className="min-w-0 flex flex-col">
                <span className="font-medium truncate">{fileName}</span>
                {dirPath && (
                  <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                    {dirPath}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
              {file.isNew ? (
                <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  New
                </Badge>
              ) : (
                <span className="text-xs font-mono">
                  {file.additions > 0 && (
                    <span className="text-green-500">+{file.additions}</span>
                  )}
                  {file.additions > 0 && file.deletions > 0 && " "}
                  {file.deletions > 0 && (
                    <span className="text-red-500">-{file.deletions}</span>
                  )}
                </span>
              )}
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[400px]">
          <p className="font-mono text-xs break-all">{file.path}</p>
          {!file.isNew && (
            <p className="text-xs text-muted-foreground mt-1">
              {file.additions} additions, {file.deletions} deletions
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
