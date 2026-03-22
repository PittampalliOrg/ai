"use client";

import { useMemo } from "react";
import useSWR from "swr";
import type { FileChange } from "@/contexts/workflow-execution-context";

type ExecutionChangeFileStatus = "A" | "M" | "D" | "R";

type ExecutionChangeFileEntry = {
  path: string;
  status: ExecutionChangeFileStatus;
  oldPath?: string;
};

type ExecutionChangeArtifactMetadata = {
  changeSetId: string;
  files: ExecutionChangeFileEntry[];
};

type ExecutionChangesResponse = {
  success: boolean;
  executionId: string;
  count: number;
  changes: ExecutionChangeArtifactMetadata[];
  pending?: boolean;
};

type ExecutionPatchResponse = {
  success: boolean;
  executionId: string;
  patch: string;
};

type ExecutionFileSnapshot = {
  executionId: string;
  path: string;
  oldPath?: string;
  status: ExecutionChangeFileStatus;
  oldContent: string | null;
  newContent: string | null;
};

type ExecutionSnapshotResponse = {
  success: boolean;
  executionId: string;
  path: string;
  snapshot: ExecutionFileSnapshot | null;
};

type UseExecutionChangesOptions = {
  executionId: string | null | undefined;
  refreshInterval?: number;
};

type UseExecutionChangesReturn = {
  fileChanges: Map<string, FileChange>;
  fileChangeArray: FileChange[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  mutate: () => void;
  hasLoaded: boolean;
};

const fetcher = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Failed to fetch: ${response.statusText}`);
  }
  return response.json();
};

function countMatchingLines(lines: string[], prefix: string): number {
  return lines.filter((line) => line.startsWith(prefix) && !line.startsWith(prefix.repeat(3))).length;
}

function splitPatchByFile(patch: string): Map<string, string> {
  const patchBlocks = new Map<string, string>();
  const lines = patch.split("\n");

  let currentBlock: string[] = [];
  let currentPath: string | null = null;

  const flush = () => {
    if (currentPath && currentBlock.length > 0) {
      patchBlocks.set(currentPath, currentBlock.join("\n").trim());
    }
    currentBlock = [];
    currentPath = null;
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      flush();
    }

    currentBlock.push(line);

    if (line.startsWith("+++ ")) {
      const value = line.slice(4).trim();
      if (value !== "/dev/null") {
        currentPath = value.replace(/^b\//, "");
      }
    } else if (!currentPath && line.startsWith("--- ")) {
      const value = line.slice(4).trim();
      if (value !== "/dev/null") {
        currentPath = value.replace(/^a\//, "");
      }
    }
  }

  flush();
  return patchBlocks;
}

function buildDurableFileChanges(args: {
  changes: ExecutionChangesResponse | undefined;
  patch: string;
  snapshots: Map<string, ExecutionFileSnapshot | null>;
}): Map<string, FileChange> {
  const fileEntries = new Map<string, ExecutionChangeFileEntry>();
  const patchBlocks = splitPatchByFile(args.patch);

  for (const changeSet of args.changes?.changes ?? []) {
    for (const file of changeSet.files) {
      fileEntries.set(file.path, file);
    }
  }

  const files = new Map<string, FileChange>();

  for (const [path, entry] of fileEntries.entries()) {
    const snapshot = args.snapshots.get(path) ?? null;
    const rawPatch = patchBlocks.get(path) ?? null;
    const patchLines = rawPatch ? rawPatch.split("\n") : [];

    const additions = countMatchingLines(patchLines, "+");
    const deletions = countMatchingLines(patchLines, "-");
    const oldContent = snapshot?.oldContent ?? null;
    const newContent = snapshot?.newContent ?? null;

    files.set(path, {
      path,
      oldPath: snapshot?.oldPath || entry.oldPath,
      status: snapshot?.status || entry.status,
      oldContent,
      newContent,
      additions,
      deletions,
      isNew: (snapshot?.status || entry.status) === "A" || (!oldContent && !!newContent),
      rawPatch,
    });
  }

  return files;
}

export function useExecutionChanges({
  executionId,
  refreshInterval = 3000,
}: UseExecutionChangesOptions): UseExecutionChangesReturn {
  const {
    data: changesData,
    error: changesError,
    isLoading: isChangesLoading,
    mutate: mutateChanges,
  } = useSWR<ExecutionChangesResponse>(
    executionId ? `/api/workflows/${encodeURIComponent(executionId)}/changes` : null,
    fetcher,
    {
      refreshInterval,
      revalidateOnFocus: true,
      dedupingInterval: 1000,
    },
  );

  const {
    data: patchData,
    error: patchError,
    isLoading: isPatchLoading,
    mutate: mutatePatch,
  } = useSWR<ExecutionPatchResponse>(
    executionId && changesData && changesData.count > 0
      ? `/api/workflows/${encodeURIComponent(executionId)}/patch`
      : null,
    fetcher,
    {
      refreshInterval,
      revalidateOnFocus: true,
      dedupingInterval: 1000,
    },
  );

  const snapshotPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const changeSet of changesData?.changes ?? []) {
      for (const file of changeSet.files) {
        paths.add(file.path);
      }
    }
    return Array.from(paths).sort((a, b) => a.localeCompare(b));
  }, [changesData]);

  const snapshotKey =
    executionId && snapshotPaths.length > 0
      ? JSON.stringify({
          executionId,
          paths: snapshotPaths,
        })
      : null;

  const {
    data: snapshotsData,
    error: snapshotsError,
    isLoading: isSnapshotsLoading,
    mutate: mutateSnapshots,
  } = useSWR<Map<string, ExecutionFileSnapshot | null>>(
    snapshotKey,
    async () => {
      const snapshots = await Promise.all(
        snapshotPaths.map(async (path) => {
          const encodedPath = path
            .split("/")
            .map((segment) => encodeURIComponent(segment))
            .join("/");
          const response = await fetch(
            `/api/workflows/${encodeURIComponent(executionId!)}/files/snapshot/${encodedPath}`,
          );
          if (!response.ok) {
            throw new Error(`Failed to fetch file snapshot: ${path}`);
          }
          const data = (await response.json()) as ExecutionSnapshotResponse;
          return [path, data.snapshot] as const;
        }),
      );

      return new Map(snapshots);
    },
    {
      refreshInterval,
      revalidateOnFocus: true,
      dedupingInterval: 1000,
    },
  );

  const fileChanges = useMemo(() => {
    if (!changesData) {
      return new Map<string, FileChange>();
    }

    return buildDurableFileChanges({
      changes: changesData,
      patch: patchData?.patch ?? "",
      snapshots: snapshotsData ?? new Map<string, ExecutionFileSnapshot | null>(),
    });
  }, [changesData, patchData?.patch, snapshotsData]);

  return {
    fileChanges,
    fileChangeArray: Array.from(fileChanges.values()),
    isLoading: isChangesLoading || isPatchLoading || isSnapshotsLoading,
    isError: !!changesError || !!patchError || !!snapshotsError,
    error: changesError || patchError || snapshotsError || null,
    mutate: () => {
      void mutateChanges();
      void mutatePatch();
      void mutateSnapshots();
    },
    hasLoaded: !!changesData,
  };
}
