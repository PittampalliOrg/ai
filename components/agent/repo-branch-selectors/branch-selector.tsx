"use client";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown, GitBranch, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useGitHubAppProvider } from "@/providers/github-app";
import type { TargetRepository } from "@/lib/types/agent";
import { toast } from "sonner";

interface BranchSelectorProps {
  disabled?: boolean;
  placeholder?: string;
  buttonClassName?: string;
  chatStarted?: boolean;
  streamTargetRepository?: TargetRepository;
}

export function BranchSelector({
  disabled = false,
  placeholder = "Select a branch...",
  buttonClassName,
  chatStarted = false,
  streamTargetRepository,
}: BranchSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const {
    branches,
    branchesLoading,
    branchesError,
    selectedBranch,
    setSelectedBranch,
    selectedRepository,
    branchesHasMore,
    branchesLoadingMore,
    loadMoreBranches,
    searchForBranch,
    defaultBranch,
    needsGitHubAuth,
  } = useGitHubAppProvider();

  const handleSelect = (branchName: string) => {
    setSelectedBranch(branchName);
    setOpen(false);
  };

  const handleSearchForBranch = async () => {
    if (!searchQuery.trim() || !selectedRepository) return;

    setIsSearching(true);
    try {
      const foundBranch = await searchForBranch(searchQuery.trim());
      if (!foundBranch) {
        toast.warning(`Branch "${searchQuery.trim()}" not found`);
      }
    } finally {
      setIsSearching(false);
    }
  };

  if (needsGitHubAuth || !selectedRepository) {
    return (
      <Button
        variant="outline"
        disabled
        className={cn(buttonClassName)}
        size="sm"
      >
        <GitBranch className="h-4 w-4" />
        <span>Select a branch</span>
      </Button>
    );
  }

  if (branchesLoading && !branches.length) {
    return (
      <Button
        variant="outline"
        disabled
        className={cn(buttonClassName)}
        size="sm"
      >
        <GitBranch className="h-4 w-4" />
        <span>Loading branches...</span>
      </Button>
    );
  }

  if (branchesError) {
    return (
      <Button
        variant="outline"
        disabled
        className={cn(buttonClassName)}
        size="sm"
      >
        <GitBranch className="h-4 w-4" />
        <span>Error loading branches</span>
      </Button>
    );
  }

  if (branches.length === 0) {
    return (
      <Button
        variant="outline"
        disabled
        className={cn(buttonClassName)}
        size="sm"
      >
        <GitBranch className="h-4 w-4" />
        <span>No branches available</span>
      </Button>
    );
  }

  // Determine the display value - prioritize stream data when chatStarted and available
  const displayValue =
    chatStarted && streamTargetRepository?.branch
      ? streamTargetRepository.branch
      : selectedBranch;

  if (chatStarted) {
    return (
      <Button variant="outline" className={cn(buttonClassName)} size="sm">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <GitBranch className="h-4 w-4" />
          <span className="truncate text-left">
            {displayValue || placeholder}
          </span>
        </div>
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(buttonClassName)}
          size="sm"
          disabled={disabled}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <GitBranch className="h-4 w-4" />
            <span className="truncate text-left">
              {selectedBranch || placeholder}
            </span>
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0">
        <Command>
          <CommandInput
            placeholder="Search branches..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            <CommandEmpty>
              <div className="flex flex-col items-center gap-2 py-4">
                <span className="text-muted-foreground text-sm">
                  No branches found.
                </span>
                {searchQuery.trim() && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSearchForBranch}
                    disabled={isSearching}
                    className="text-xs"
                  >
                    {isSearching
                      ? "Searching..."
                      : `Search for "${searchQuery.trim()}"`}
                  </Button>
                )}
              </div>
            </CommandEmpty>
            <CommandGroup>
              {branches
                .slice()
                .sort((a, b) => {
                  if (defaultBranch) {
                    if (a.name === defaultBranch) return -1;
                    if (b.name === defaultBranch) return 1;
                  }
                  return 0;
                })
                .map((branch) => {
                  const isSelected = selectedBranch === branch.name;
                  const isDefault = branch.name === defaultBranch;
                  return (
                    <CommandItem
                      key={branch.name}
                      value={branch.name}
                      onSelect={() => handleSelect(branch.name)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex items-center gap-2">
                        <GitBranch className="h-3 w-3" />
                        <span className="font-medium">{branch.name}</span>
                        {isDefault && (
                          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-100">
                            default
                          </span>
                        )}
                        {branch.protected && (
                          <div title="Protected branch">
                            <Shield className="h-3 w-3 text-amber-500 dark:text-amber-400" />
                          </div>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
            </CommandGroup>
            {branchesHasMore && (
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    loadMoreBranches();
                  }}
                  disabled={branchesLoadingMore}
                  className="justify-center"
                >
                  {branchesLoadingMore
                    ? "Loading more..."
                    : "Load more branches"}
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
