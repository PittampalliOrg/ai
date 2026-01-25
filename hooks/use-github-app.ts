"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { TargetRepository, Repository, Branch } from "@/lib/types/agent";

const GITHUB_SELECTED_REPO_KEY = "selected-repository";

const saveRepositoryToLocalStorage = (repo: TargetRepository | null) => {
  try {
    if (repo) {
      localStorage.setItem(GITHUB_SELECTED_REPO_KEY, JSON.stringify(repo));
    } else {
      localStorage.removeItem(GITHUB_SELECTED_REPO_KEY);
    }
  } catch (error) {
    console.warn("Failed to save repository to localStorage:", error);
  }
};

const getRepositoryFromLocalStorage = (): TargetRepository | null => {
  try {
    const stored = localStorage.getItem(GITHUB_SELECTED_REPO_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (
        parsed &&
        typeof parsed.owner === "string" &&
        typeof parsed.repo === "string"
      ) {
        return {
          owner: parsed.owner,
          repo: parsed.repo,
        };
      }
    }
    return null;
  } catch (error) {
    console.warn("Failed to retrieve repository from localStorage:", error);
    return null;
  }
};

export interface UseGitHubAppReturn {
  // General state
  isLoading: boolean;
  error: string | null;
  needsGitHubAuth: boolean;

  // Repository state and pagination
  repositories: Repository[];
  repositoriesPage: number;
  repositoriesHasMore: boolean;
  repositoriesLoadingMore: boolean;
  refreshRepositories: () => Promise<void>;
  loadMoreRepositories: () => Promise<void>;

  // Repository selection
  selectedRepository: TargetRepository | null;
  setSelectedRepository: (repo: TargetRepository | null) => void;

  // Branch state and pagination
  branches: Branch[];
  branchesPage: number;
  branchesHasMore: boolean;
  branchesLoading: boolean;
  branchesLoadingMore: boolean;
  branchesError: string | null;
  loadMoreBranches: () => Promise<void>;

  // Branch selection
  selectedBranch: string | null;
  setSelectedBranch: (branch: string | null) => void;
  refreshBranches: () => Promise<void>;
  searchForBranch: (branchName: string) => Promise<Branch | null>;

  // Repository metadata
  defaultBranch: string | null;
}

export function useGitHubApp(): UseGitHubAppReturn {
  // General state
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsGitHubAuth, setNeedsGitHubAuth] = useState(false);

  // Repository state and pagination
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [repositoriesPage, setRepositoriesPage] = useState(1);
  const [repositoriesHasMore, setRepositoriesHasMore] = useState(false);
  const [repositoriesLoadingMore, setRepositoriesLoadingMore] = useState(false);

  // Branch state and pagination
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesPage, setBranchesPage] = useState(1);
  const [branchesHasMore, setBranchesHasMore] = useState(false);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchesLoadingMore, setBranchesLoadingMore] = useState(false);
  const [branchesError, setBranchesError] = useState<string | null>(null);

  // Selection state (using React state instead of nuqs)
  const [selectedRepository, setSelectedRepositoryState] = useState<TargetRepository | null>(null);
  const [selectedBranch, setSelectedBranchState] = useState<string | null>(null);

  // Track if auto-selection has been attempted
  const hasAutoSelectedRef = useRef(false);
  const hasCheckedLocalStorageRef = useRef(false);

  const setSelectedRepository = useCallback((repo: TargetRepository | null) => {
    setSelectedRepositoryState(repo);
    saveRepositoryToLocalStorage(repo);
    setSelectedBranchState(null);
    setBranches([]);
    setBranchesPage(1);
    setBranchesHasMore(false);
  }, []);

  const setSelectedBranch = useCallback((branch: string | null) => {
    setSelectedBranchState(branch);
  }, []);

  const fetchRepositories = useCallback(
    async (page: number = 1, append: boolean = false) => {
      if (!append) setIsLoading(true);
      if (append) setRepositoriesLoadingMore(true);
      setError(null);
      setNeedsGitHubAuth(false);

      try {
        const response = await fetch(`/api/github/repositories?page=${page}`);

        if (response.ok) {
          const data = await response.json();
          const newRepositories = data.repositories || [];

          if (append) {
            setRepositories((prev) => [...prev, ...newRepositories]);
          } else {
            setRepositories(newRepositories);
          }

          setRepositoriesPage(data.pagination?.page || page);
          setRepositoriesHasMore(data.pagination?.hasMore || false);
        } else if (response.status === 401) {
          setNeedsGitHubAuth(true);
          setError(null); // Clear error since this is an expected auth state
        } else {
          const errorData = await response.json();
          setError(errorData.error || "Failed to load repositories");
        }
      } catch {
        setError("Failed to fetch repositories");
      } finally {
        setIsLoading(false);
        setRepositoriesLoadingMore(false);
      }
    },
    []
  );

  const fetchBranches = useCallback(
    async (page: number = 1, append: boolean = false) => {
      if (!selectedRepository) {
        setBranches([]);
        setBranchesPage(1);
        setBranchesHasMore(false);
        return;
      }

      if (!append) setBranchesLoading(true);
      if (append) setBranchesLoadingMore(true);
      setBranchesError(null);

      try {
        const response = await fetch(
          `/api/github/repositories?owner=${selectedRepository.owner}&repo=${selectedRepository.repo}&page=${page}`
        );

        if (response.ok) {
          const data = await response.json();
          const branchData = data.branches || [];

          if (append) {
            setBranches((prev) => {
              const newBranches = branchData.filter(
                (branch: Branch) => !prev.some((b) => b.name === branch.name)
              );
              return [...prev, ...newBranches];
            });
          } else {
            setBranches(branchData);
          }

          setBranchesPage(page);
          // Assume hasMore if we got a full page
          setBranchesHasMore(branchData.length >= 30);
        } else {
          const errorData = await response.json();
          setBranchesError(errorData.error || "Failed to load branches");
        }
      } catch (err) {
        console.error("Error fetching branches:", err);
        setBranchesError("Failed to fetch branches");
      } finally {
        if (!append) setBranchesLoading(false);
        if (append) setBranchesLoadingMore(false);
      }
    },
    [selectedRepository?.owner, selectedRepository?.repo]
  );

  // Fetch branches when repository changes
  useEffect(() => {
    if (selectedRepository) {
      setBranches([]);
      setBranchesPage(1);
      fetchBranches();
    } else {
      setBranches([]);
      setSelectedBranchState(null);
    }
  }, [selectedRepository?.owner, selectedRepository?.repo, fetchBranches]);

  // Auto-select default branch when branches load
  useEffect(() => {
    if (
      selectedRepository &&
      !branchesLoading &&
      !branchesError &&
      branches.length > 0 &&
      !selectedBranch
    ) {
      // Find the default branch
      const repo = repositories.find(
        (r) =>
          r.full_name === `${selectedRepository.owner}/${selectedRepository.repo}`
      );
      const defaultBranchName = repo?.default_branch;
      const defaultBranch = branches.find((b) => b.name === defaultBranchName);
      setSelectedBranchState(defaultBranch?.name || branches[0]?.name || null);
    }
  }, [
    branches,
    branchesLoading,
    branchesError,
    selectedRepository,
    selectedBranch,
    repositories,
  ]);

  // Load more functions
  const loadMoreRepositories = useCallback(async () => {
    if (repositoriesHasMore && !repositoriesLoadingMore) {
      await fetchRepositories(repositoriesPage + 1, true);
    }
  }, [repositoriesHasMore, repositoriesLoadingMore, repositoriesPage, fetchRepositories]);

  const loadMoreBranches = useCallback(async () => {
    if (branchesHasMore && !branchesLoadingMore) {
      await fetchBranches(branchesPage + 1, true);
    }
  }, [branchesHasMore, branchesLoadingMore, branchesPage, fetchBranches]);

  const searchForBranch = useCallback(
    async (branchName: string): Promise<Branch | null> => {
      if (!selectedRepository) {
        return null;
      }

      try {
        // For now, just check if the branch exists in our loaded list
        const existingBranch = branches.find((b) => b.name === branchName);
        if (existingBranch) {
          return existingBranch;
        }

        // TODO: Add API endpoint for searching specific branch
        return null;
      } catch (error) {
        console.error(`Error searching for branch ${branchName}:`, error);
        return null;
      }
    },
    [selectedRepository?.owner, selectedRepository?.repo, branches]
  );

  // Initial load
  useEffect(() => {
    fetchRepositories();
  }, [fetchRepositories]);

  // Load from localStorage on initial load
  useEffect(() => {
    if (
      !hasCheckedLocalStorageRef.current &&
      !selectedRepository &&
      !isLoading &&
      !error &&
      repositories.length > 0
    ) {
      hasCheckedLocalStorageRef.current = true;

      const storedRepo = getRepositoryFromLocalStorage();
      if (storedRepo) {
        const existsInResponse = repositories.some(
          (repo) => repo.full_name === `${storedRepo.owner}/${storedRepo.repo}`
        );

        if (existsInResponse) {
          setSelectedRepositoryState(storedRepo);
          hasAutoSelectedRef.current = true;
        }
      }
    }
  }, [repositories, selectedRepository, isLoading, error]);

  // Auto-select first repository if none selected
  useEffect(() => {
    if (
      !hasAutoSelectedRef.current &&
      !selectedRepository &&
      !isLoading &&
      !error &&
      repositories.length > 0 &&
      hasCheckedLocalStorageRef.current
    ) {
      const firstRepo = repositories[0];
      const targetRepo = {
        owner: firstRepo.full_name.split("/")[0],
        repo: firstRepo.full_name.split("/")[1],
      };
      setSelectedRepository(targetRepo);
      hasAutoSelectedRef.current = true;
    }
  }, [
    repositories,
    selectedRepository,
    isLoading,
    error,
    setSelectedRepository,
  ]);

  const refreshRepositories = useCallback(async () => {
    setRepositoriesPage(1);
    setRepositoriesHasMore(false);
    await fetchRepositories();
  }, [fetchRepositories]);

  const refreshBranches = useCallback(async () => {
    setBranchesPage(1);
    setBranchesHasMore(false);
    await fetchBranches();
  }, [fetchBranches]);

  // Get the default branch for the currently selected repository
  const defaultBranch = useMemo(() => {
    if (!selectedRepository) return null;
    const repo = repositories.find(
      (r) =>
        r.full_name === `${selectedRepository.owner}/${selectedRepository.repo}`
    );
    return repo?.default_branch || null;
  }, [selectedRepository, repositories]);

  return {
    // General state
    isLoading,
    error,
    needsGitHubAuth,

    // Repository state and pagination
    repositories,
    repositoriesPage,
    repositoriesHasMore,
    repositoriesLoadingMore,
    refreshRepositories,
    loadMoreRepositories,

    // Repository selection
    selectedRepository,
    setSelectedRepository,

    // Branch state and pagination
    branches,
    branchesPage,
    branchesHasMore,
    branchesLoading,
    branchesLoadingMore,
    branchesError,
    loadMoreBranches,

    // Branch selection
    selectedBranch,
    setSelectedBranch,
    refreshBranches,
    searchForBranch,

    // Repository metadata
    defaultBranch,
  };
}
