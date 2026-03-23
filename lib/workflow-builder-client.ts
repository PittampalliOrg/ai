import "server-only";

import type { ExecutionLog, Plan, PlanTask, WorkflowEntry, WorkflowStatus } from "@/lib/types/workflow";
import { getConfig, getSecretValue } from "@/lib/dapr/config-provider";

type WorkflowBuilderExecutionStartResponse = {
	success: boolean;
	executionId: string;
	instanceId: string;
	workflowId: string;
	workflowName: string;
	status: string;
};

type WorkflowBuilderTimelineEvent = {
	id: string;
	ts: string;
	kind: string;
	label: string;
	nodeId?: string | null;
	nodeName?: string | null;
	activityName?: string | null;
	status?: string | null;
	error?: string | null;
	output?: unknown;
};

type WorkflowBuilderPlanArtifact = {
	id: string;
	goal: string;
	status: string;
	artifactType: string;
	nodeId: string;
	planMarkdown: string | null;
	planJson: unknown;
	metadata: Record<string, unknown> | null;
	createdAt: string;
	updatedAt: string;
};

type WorkflowBuilderExecutionDetail = {
	success: boolean;
	execution: {
		id: string;
		workflowId: string;
		status: string;
		phase: string | null;
		progress: number | null;
		error: string | null;
		input: Record<string, unknown> | null;
		output: Record<string, unknown> | null;
		daprInstanceId: string | null;
		startedAt: string;
		completedAt: string | null;
		workflow: {
			id: string;
			name: string;
			description: string | null;
		};
	};
	runtime: {
		runtimeStatus: string;
		phase: string | null;
		progress: number | null;
		message: string | null;
		currentNodeId: string | null;
		currentNodeName: string | null;
		approvalEventName: string | null;
		traceId: string | null;
		startedAt: string | null;
		completedAt: string | null;
		outputs?: Record<string, unknown>;
		error?: string | null;
	} | null;
	timeline: WorkflowBuilderTimelineEvent[];
	planArtifact: WorkflowBuilderPlanArtifact | null;
	agentProgressByNode: Record<
		string,
		{
			status: string;
			phase: string | null;
			summary: string | null;
			currentStepName: string | null;
			activeToolName: string | null;
			recentTurns: Array<{ label: string; summary?: string | null; status?: string | null }>;
		}
	>;
};

type WorkflowBuilderExecutionSummary = {
	id: string;
	workflowId: string;
	status: string;
	phase: string | null;
	progress: number | null;
	error: string | null;
	startedAt: string;
	completedAt: string | null;
	workflow: {
		id: string;
		name: string;
		description: string | null;
	};
};

type WorkflowBuilderExecutionStatus = {
	success: boolean;
	execution: WorkflowBuilderExecutionSummary;
	runtime: {
		runtimeStatus: string;
		phase: string | null;
		progress: number | null;
		message: string | null;
		currentNodeId: string | null;
		currentNodeName: string | null;
		approvalEventName: string | null;
		traceId: string | null;
		startedAt: string | null;
		completedAt: string | null;
		error?: string | null;
	} | null;
};

type WorkflowBuilderExecutionListItem = Pick<
	WorkflowBuilderExecutionSummary,
	"id" | "workflowId" | "status" | "phase" | "progress" | "error" | "startedAt" | "completedAt"
> & { workflow: WorkflowBuilderExecutionSummary["workflow"] };

type WorkflowBuilderExecutionListResponse = {
	success: boolean;
	executions: WorkflowBuilderExecutionListItem[];
	total?: number;
	nextCursor?: string | null;
};

type ParsedPlanTask = {
	id: string;
	title: string;
	description: string;
	status: PlanTask["status"];
	subject?: string;
	blockedBy?: string[];
	blocks?: string[];
};

type WorkflowBuilderRetryConfig = {
	attempts: number;
	baseDelayMs: number;
	maxDelayMs: number;
	timeoutMs: number;
};

const WORKFLOW_BUILDER_RETRY_CONFIG: WorkflowBuilderRetryConfig = {
	attempts: 3,
	baseDelayMs: 250,
	maxDelayMs: 2000,
	timeoutMs: 8000,
};

const WORKFLOW_BUILDER_RETRYABLE_STATUSES = new Set([408, 425, 429, 502, 503, 504]);

function getWorkflowBuilderBaseUrl(): string {
	return getConfig(
		"WORKFLOW_BUILDER_BASE_URL",
		"http://workflow-builder.workflow-builder.svc.cluster.local:3000",
	).replace(/\/+$/, "");
}

function getWorkflowBuilderInternalToken(): string {
	return (
		getSecretValue("WORKFLOW_BUILDER_INTERNAL_API_TOKEN") ||
		getSecretValue("INTERNAL_API_TOKEN") ||
		getConfig("WORKFLOW_BUILDER_INTERNAL_API_TOKEN") ||
		getConfig("INTERNAL_API_TOKEN") ||
		process.env.WORKFLOW_BUILDER_INTERNAL_API_TOKEN ||
		process.env.INTERNAL_API_TOKEN ||
		""
	).trim();
}

function getConfiguredAgentWorkflowIdentity(): {
	workflowId?: string;
	workflowName?: string;
} {
	const workflowId = getConfig(
		"WORKFLOW_BUILDER_AGENT_WORKFLOW_ID",
		"2mjd2mrptkf8zaxembsbp",
	).trim();
	const workflowName = getConfig(
		"WORKFLOW_BUILDER_AGENT_WORKFLOW_NAME",
		"OpenShell LangGraph Feature Delivery",
	).trim();

	return {
		...(workflowId ? { workflowId } : {}),
		...(!workflowId && workflowName ? { workflowName } : {}),
	};
}

async function workflowBuilderRequest<T>(
	path: string,
	options?: RequestInit,
): Promise<T> {
	const token = getWorkflowBuilderInternalToken();
	if (!token) {
		throw new Error("WORKFLOW_BUILDER_INTERNAL_API_TOKEN is required");
	}

	const url = `${getWorkflowBuilderBaseUrl()}${path}`;
	const requestInit: RequestInit = {
		...options,
		headers: {
			"Content-Type": "application/json",
			"X-Internal-Token": token,
			...(options?.headers ?? {}),
		},
		cache: "no-store",
	};

	for (let attempt = 1; attempt <= WORKFLOW_BUILDER_RETRY_CONFIG.attempts; attempt += 1) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), WORKFLOW_BUILDER_RETRY_CONFIG.timeoutMs);

		try {
			const response = await fetch(url, {
				...requestInit,
				signal: controller.signal,
			});

			if (response.status === 404) {
				throw new Error("NOT_FOUND");
			}

			if (
				!response.ok &&
				WORKFLOW_BUILDER_RETRYABLE_STATUSES.has(response.status) &&
				attempt < WORKFLOW_BUILDER_RETRY_CONFIG.attempts
			) {
				await delay(getWorkflowBuilderRetryDelay(attempt));
				continue;
			}

			if (!response.ok) {
				const payload = await response
					.json()
					.catch(() => ({ error: `Request failed with ${response.status}` }));
				throw new Error(
					typeof payload?.error === "string" && payload.error
						? payload.error
						: `Request failed with ${response.status}`,
				);
			}

			return (await response.json()) as T;
		} catch (error) {
			if (error instanceof Error && error.message === "NOT_FOUND") {
				throw error;
			}

			if (attempt < WORKFLOW_BUILDER_RETRY_CONFIG.attempts && isRetryableWorkflowBuilderError(error)) {
				await delay(getWorkflowBuilderRetryDelay(attempt));
				continue;
			}

			throw error;
		} finally {
			clearTimeout(timeout);
		}
	}

	throw new Error("Workflow builder request failed");
}

function getWorkflowBuilderRetryDelay(attempt: number): number {
	const delayMs = WORKFLOW_BUILDER_RETRY_CONFIG.baseDelayMs * 2 ** (attempt - 1);
	return Math.min(delayMs, WORKFLOW_BUILDER_RETRY_CONFIG.maxDelayMs);
}

function isRetryableWorkflowBuilderError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	if (error.message === "NOT_FOUND") {
		return false;
	}

	const message = error.message.toLowerCase();
	return (
		error.name === "AbortError" ||
		error.name === "TimeoutError" ||
		error instanceof TypeError ||
		message.includes("fetch failed") ||
		message.includes("network") ||
		message.includes("timed out") ||
		message.includes("timeout") ||
		message.includes("econnreset") ||
		message.includes("etimedout") ||
		message.includes("eai_again") ||
		message.includes("socket hang up")
	);
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePlanTasks(planJson: unknown): PlanTask[] {
	if (!planJson || typeof planJson !== "object") {
		return [];
	}
	const tasks = (planJson as Record<string, unknown>).tasks;
	if (!Array.isArray(tasks)) {
		return [];
	}

	const parsedTasks: ParsedPlanTask[] = [];

	for (const task of tasks) {
		if (!task || typeof task !== "object") {
			continue;
		}

		const record = task as Record<string, unknown>;
		const id = String(record.id ?? "").trim();
		const title = String(
			record.title ?? record.subject ?? record.name ?? "",
		).trim();
		if (!id || !title) {
			continue;
		}

		const statusRaw = String(record.status ?? "pending").toLowerCase();
		const status: PlanTask["status"] =
			statusRaw === "completed"
				? "completed"
				: statusRaw === "in_progress"
					? "in_progress"
					: statusRaw === "failed"
						? "failed"
						: statusRaw === "skipped"
							? "skipped"
							: statusRaw === "planned"
								? "planned"
								: "pending";

		parsedTasks.push({
			id,
			title,
			subject: title,
			description: String(record.description ?? "").trim(),
			status,
			blockedBy: Array.isArray(record.blockedBy)
				? record.blockedBy.map((value) => String(value))
				: undefined,
			blocks: Array.isArray(record.blocks)
				? record.blocks.map((value) => String(value))
				: undefined,
		});
	}

	return parsedTasks;
}

function buildPlan(detail: WorkflowBuilderExecutionDetail): Plan | undefined {
	const artifact = detail.planArtifact;
	if (!artifact) {
		return undefined;
	}

	const prompt =
		typeof detail.execution.input?.task === "string"
			? detail.execution.input.task
			: typeof detail.execution.input?.prompt === "string"
				? detail.execution.input.prompt
				: "Implementation Plan";

	const planJson =
		artifact.planJson && typeof artifact.planJson === "object"
			? (artifact.planJson as Record<string, unknown>)
			: null;
	const tasks = parsePlanTasks(artifact.planJson);
	const summary =
		(planJson && typeof planJson.summary === "string" && planJson.summary) ||
		artifact.goal ||
		artifact.planMarkdown ||
		"";

	return {
		id: artifact.id,
		title: prompt,
		summary,
		tasks,
		markdown: artifact.planMarkdown ?? undefined,
		rawResponse: artifact.planMarkdown ?? undefined,
	};
}

function mapExecutionStatus(detail: WorkflowBuilderExecutionDetail): WorkflowStatus {
	const runtimeStatus = detail.runtime?.runtimeStatus?.toUpperCase();
	const phase = (detail.runtime?.phase || detail.execution.phase || "").toLowerCase();
	const dbStatus = detail.execution.status.toLowerCase();

	if (phase === "awaiting_approval") return "AWAITING_APPROVAL";
	if (phase === "planning" || phase === "planned") return "PLANNING";
	if (phase === "executing" || phase === "execution") return "EXECUTING";
	if (runtimeStatus === "COMPLETED" || dbStatus === "success" || dbStatus === "completed") {
		return "COMPLETED";
	}
	if (runtimeStatus === "FAILED" || dbStatus === "error" || dbStatus === "failed") {
		return "FAILED";
	}
	if (runtimeStatus === "TERMINATED" || dbStatus === "terminated") {
		return "FAILED";
	}
	return "EXECUTING";
}

function buildExecutionLogs(detail: WorkflowBuilderExecutionDetail): ExecutionLog[] {
	return detail.timeline
		.filter((event) =>
			[
				"node_started",
				"node_completed",
				"node_failed",
				"approval_requested",
				"approval_responded",
				"child_run_scheduled",
				"child_run_completed",
				"child_run_failed",
			].includes(event.kind),
		)
		.map((event) => ({
			timestamp: event.ts,
			taskId: event.nodeId || event.id,
			event:
				event.kind === "node_failed" || event.kind === "child_run_failed"
					? "failed"
					: event.kind === "node_completed" ||
						  event.kind === "child_run_completed" ||
						  event.kind === "approval_responded"
						? "completed"
						: "started",
			message: event.label,
			details: event.output,
		}));
}

export function toWorkflowEntry(
	detail: WorkflowBuilderExecutionDetail,
): WorkflowEntry & {
	customStatus?: { phase: string; progress: number; message: string };
	source?: string;
	appId?: string;
} {
	const plan = buildPlan(detail);
	const status = mapExecutionStatus(detail);
	const executionLogs = buildExecutionLogs(detail);
	const progress = detail.runtime?.progress ?? detail.execution.progress ?? 0;
	const phase = detail.runtime?.phase || detail.execution.phase || null;
	const message =
		detail.runtime?.message ||
		(detail.execution.error ? detail.execution.error : null) ||
		(detail.planArtifact ? "Plan available for review" : null);

	return {
		id: detail.execution.id,
		status,
		request:
			typeof detail.execution.input?.task === "string"
				? {
						prompt: detail.execution.input.task,
						submittedAt: detail.execution.startedAt,
					}
				: undefined,
		plan,
		execution: {
			currentTaskIndex: executionLogs.filter((log) => log.event === "completed")
				.length,
			completedTasks: executionLogs
				.filter((log) => log.event === "completed")
				.map((log) => log.taskId),
			failedTasks: executionLogs
				.filter((log) => log.event === "failed")
				.map((log) => log.taskId),
			skippedTasks: [],
			logs: executionLogs,
		},
		error: detail.execution.error ?? detail.runtime?.error ?? undefined,
		createdAt: detail.execution.startedAt,
		updatedAt: detail.execution.completedAt || detail.runtime?.completedAt || detail.execution.startedAt,
		customStatus: phase
			? {
					phase,
					progress,
					message: message || "",
				}
			: undefined,
		source: "workflow-builder",
		appId: "workflow-builder",
	};
}

export function toWorkflowStatus(detail: WorkflowBuilderExecutionDetail): {
	phase: string | null;
	progress: number | null;
	message: string | null;
	runtimeStatus: string | null;
} {
	return {
		phase: detail.runtime?.phase || detail.execution.phase || null,
		progress: detail.runtime?.progress ?? detail.execution.progress ?? null,
		message:
			detail.runtime?.message ||
			detail.execution.error ||
			(detail.planArtifact ? "Plan available for review" : null),
		runtimeStatus: detail.runtime?.runtimeStatus || detail.execution.status || null,
	};
}

export async function getWorkflowBuilderExecutionStatus(
	executionId: string,
): Promise<WorkflowBuilderExecutionStatus | null> {
	try {
		return await workflowBuilderRequest<WorkflowBuilderExecutionStatus>(
			`/api/internal/agent/workflows/executions/${encodeURIComponent(executionId)}/status`,
		);
	} catch (error) {
		if (error instanceof Error && error.message === "NOT_FOUND") {
			return null;
		}
		throw error;
	}
}

export async function listWorkflowBuilderExecutions(input?: {
	limit?: number;
	offset?: number;
	status?: string;
	workflowId?: string;
	workflowName?: string;
}): Promise<WorkflowBuilderExecutionListResponse> {
	const searchParams = new URLSearchParams();
	if (typeof input?.limit === "number") {
		searchParams.set("limit", String(input.limit));
	}
	if (typeof input?.offset === "number") {
		searchParams.set("offset", String(input.offset));
	}
	if (input?.status) {
		searchParams.set("status", input.status);
	}
	if (input?.workflowId) {
		searchParams.set("workflowId", input.workflowId);
	}
	if (input?.workflowName) {
		searchParams.set("workflowName", input.workflowName);
	}

	const query = searchParams.toString();
	return workflowBuilderRequest<WorkflowBuilderExecutionListResponse>(
		`/api/internal/agent/workflows/executions${query ? `?${query}` : ""}`,
	);
}

export async function startWorkflowBuilderCodingAgentExecution(input: {
	task: string;
	targetRepository: {
		owner: string;
		repo: string;
		branch: string;
		token?: string;
	};
	sessionId: string;
	userId: string;
}): Promise<WorkflowBuilderExecutionStartResponse> {
	const workflowIdentity = getConfiguredAgentWorkflowIdentity();
	return workflowBuilderRequest<WorkflowBuilderExecutionStartResponse>(
		"/api/internal/agent/workflows/execute",
		{
			method: "POST",
			body: JSON.stringify({
				...workflowIdentity,
				triggerData: {
					owner: input.targetRepository.owner,
					repo: input.targetRepository.repo,
					branch: input.targetRepository.branch,
					token: input.targetRepository.token || "",
					feature_request: input.task,
					sessionId: input.sessionId,
					requestedByUserId: input.userId,
				},
			}),
		},
	);
}

export async function getWorkflowBuilderExecutionDetail(
	executionId: string,
): Promise<WorkflowBuilderExecutionDetail | null> {
	try {
		return await workflowBuilderRequest<WorkflowBuilderExecutionDetail>(
			`/api/internal/agent/workflows/executions/${encodeURIComponent(executionId)}`,
		);
	} catch (error) {
		if (error instanceof Error && error.message === "NOT_FOUND") {
			return null;
		}
		throw error;
	}
}

export async function getWorkflowBuilderExecutionFileSnapshot(input: {
	executionId: string;
	filePath: string;
	durableInstanceId?: string;
}): Promise<{
	success: boolean;
	executionId: string;
	path: string;
	durableInstanceId?: string;
	snapshot: {
		executionId: string;
		path: string;
		oldPath?: string;
		status: "A" | "M" | "D" | "R";
		oldContent: string | null;
		newContent: string | null;
	} | null;
}> {
	const pathSegments = input.filePath
		.split("/")
		.map((segment) => segment.trim())
		.filter(Boolean)
		.map((segment) => encodeURIComponent(segment));
	if (pathSegments.length === 0) {
		throw new Error("filePath is required");
	}

	const query = new URLSearchParams();
	if (input.durableInstanceId) {
		query.set("durableInstanceId", input.durableInstanceId);
	}

	return workflowBuilderRequest(
		`/api/internal/agent/workflows/executions/${encodeURIComponent(input.executionId)}/files/snapshot/${pathSegments.join("/")}${query.size > 0 ? `?${query.toString()}` : ""}`,
	);
}

export async function approveWorkflowBuilderExecution(input: {
	executionId: string;
	approved: boolean;
	reason?: string;
	approvedBy?: string;
}) {
	return workflowBuilderRequest<{
		success: boolean;
		executionId: string;
		instanceId: string | null;
		eventName: string;
		approved: boolean;
	}>(
		`/api/internal/agent/workflows/executions/${encodeURIComponent(input.executionId)}/approve`,
		{
			method: "POST",
			body: JSON.stringify({
				approved: input.approved,
				reason: input.reason,
				approvedBy: input.approvedBy,
			}),
		},
	);
}
