export type ExecutionOutputFileChangeStatus = "A" | "M" | "D" | "R";

export type ExecutionOutputFileChangeEntry = {
  path: string;
  status: ExecutionOutputFileChangeStatus;
  oldPath?: string;
};

export type ExecutionOutputFileChangeSummary = {
  files?: number;
  additions?: number;
  deletions?: number;
};

export type ExecutionOutputFileChangeData = {
  files: ExecutionOutputFileChangeEntry[];
  patch?: string;
  patchRef?: string;
  snapshotRefs: string[];
  stats?: ExecutionOutputFileChangeSummary;
  sourceNodeKey?: string;
  durableInstanceId?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toOptionalInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function toOptionalQueryStringParam(
  urlLike: string | undefined,
  paramName: string,
): string | undefined {
  if (!urlLike) {
    return undefined;
  }

  try {
    const url = new URL(urlLike, "http://localhost");
    return toOptionalString(url.searchParams.get(paramName));
  } catch {
    return undefined;
  }
}

function normalizeStatus(value: unknown): ExecutionOutputFileChangeStatus {
  const normalized = String(value ?? "M").toUpperCase();
  if (normalized === "A" || normalized === "D" || normalized === "R") {
    return normalized;
  }
  return "M";
}

function extractEntriesFromList(value: unknown): ExecutionOutputFileChangeEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const entries: ExecutionOutputFileChangeEntry[] = [];

  for (const item of value) {
    if (typeof item === "string" && item.trim()) {
      entries.push({
        path: item.trim(),
        status: "M",
      });
      continue;
    }

    const record = asRecord(item);
    if (!record) {
      continue;
    }

    const path = toOptionalString(record.path);
    if (!path) {
      continue;
    }

    entries.push({
      path,
      status: normalizeStatus(record.status),
      oldPath: toOptionalString(record.oldPath ?? record.old_path),
    });
  }

  return entries;
}

function mergeFileChangeEntries(
  target: Map<string, ExecutionOutputFileChangeEntry>,
  entries: ExecutionOutputFileChangeEntry[],
) {
  for (const entry of entries) {
    target.set(entry.path, {
      path: entry.path,
      status: entry.status,
      ...(entry.oldPath ? { oldPath: entry.oldPath } : {}),
    });
  }
}

function buildCandidateRecords(
  output: unknown,
): Array<{ nodeKey?: string; record: Record<string, unknown> }> {
  const root = asRecord(output);
  if (!root) {
    return [];
  }

  const candidates: Array<{ nodeKey?: string; record: Record<string, unknown> }> = [
    { record: root },
  ];
  const nestedResult = asRecord(root.result);
  if (nestedResult) {
    candidates.push({ record: nestedResult });
  }

  const outputs = asRecord(root.outputs);
  if (!outputs) {
    return candidates;
  }

  for (const [key, value] of Object.entries(outputs)) {
    const record = asRecord(value);
    if (!record) {
      continue;
    }

    candidates.push({ nodeKey: key, record });
    const result = asRecord(record.result);
    if (result) {
      candidates.push({ nodeKey: key, record: result });
    }
  }

  return candidates;
}

export function parseExecutionFileChangeData(
  output: unknown,
): ExecutionOutputFileChangeData | null {
  const candidates = buildCandidateRecords(output);
  if (candidates.length === 0) {
    return null;
  }

  const files = new Map<string, ExecutionOutputFileChangeEntry>();
  const snapshotRefs = new Set<string>();
  let patch: string | undefined;
  let patchRef: string | undefined;
  let stats: ExecutionOutputFileChangeSummary | undefined;
  let sourceNodeKey: string | undefined;
  let durableInstanceId: string | undefined;

  for (const candidate of candidates) {
    const { record } = candidate;

    const summary = asRecord(record.changeSummary);
    if (summary) {
      const summaryFiles = extractEntriesFromList(summary.files);
      if (summaryFiles.length > 0) {
        mergeFileChangeEntries(files, summaryFiles);
        sourceNodeKey ??= candidate.nodeKey;
      }

      const summaryStats = asRecord(summary.stats);
      if (summaryStats && !stats) {
        stats = {
          files: toOptionalInt(summaryStats.files),
          additions: toOptionalInt(summaryStats.additions),
          deletions: toOptionalInt(summaryStats.deletions),
        };
      }
    }

    const fileChanges = extractEntriesFromList(record.fileChanges);
    if (fileChanges.length > 0) {
      mergeFileChangeEntries(files, fileChanges);
      sourceNodeKey ??= candidate.nodeKey;
    }

    for (const entry of extractEntriesFromList(record.snapshotRefs)) {
      snapshotRefs.add(entry.path);
      mergeFileChangeEntries(files, [entry]);
      sourceNodeKey ??= candidate.nodeKey;
    }

    const nextPatch = toOptionalString(record.patch);
    if (!patch && nextPatch) {
      patch = nextPatch;
      sourceNodeKey ??= candidate.nodeKey;
    }

    const nextPatchRef = toOptionalString(record.patchRef ?? record.patch_ref);
    if (!patchRef && nextPatchRef) {
      patchRef = nextPatchRef;
      sourceNodeKey ??= candidate.nodeKey;
    }

    const nextDurableInstanceId =
      toOptionalString(
        record.durableInstanceId ??
          record.durable_instance_id ??
          record.daprInstanceId ??
          record.dapr_instance_id,
      ) ?? toOptionalQueryStringParam(nextPatchRef, "durableInstanceId");

    if (!durableInstanceId && nextDurableInstanceId) {
      durableInstanceId = nextDurableInstanceId;
      sourceNodeKey ??= candidate.nodeKey;
    }
  }

  if (
    files.size === 0 &&
    snapshotRefs.size === 0 &&
    !patch &&
    !patchRef &&
    !stats
  ) {
    return null;
  }

  return {
    files: Array.from(files.values()).sort((a, b) => a.path.localeCompare(b.path)),
    patch,
    patchRef,
    snapshotRefs: Array.from(snapshotRefs).sort((a, b) => a.localeCompare(b)),
    stats,
    sourceNodeKey,
    durableInstanceId,
  };
}
