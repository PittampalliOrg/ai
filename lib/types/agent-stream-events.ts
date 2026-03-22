/**
 * Agent Stream Events — Shared event types for real-time agent streaming.
 *
 * Normalized schema inspired by AG-UI protocol. Used by the BFF proxy
 * and the useAgentStream hook.
 */

export type AgentStreamEventType =
	| "run_started"
	| "turn_started"
	| "llm_start"
	| "llm_token"
	| "llm_complete"
	| "tool_call_start"
	| "tool_call_end"
	| "tool_call_error"
	| "sandbox_output"
	| "sandbox_output_partial"
	| "sandbox_heartbeat"
	| "state_snapshot"
	| "run_complete"
	| "run_error"
	// Raw event types from Python agent runtime (pre-normalization)
	| "tool_start"
	| "tool_complete"
	| "tool_error"
	| "model_start"
	| "model_complete";

export type AgentStreamEvent = {
	id: string;
	ts: string;
	type: AgentStreamEventType;
	turn?: number;
	toolName?: string;
	toolArgs?: unknown;
	toolResult?: unknown;
	exitCode?: number;
	durationMs?: number;
	status?: string;
	token?: string;
	text?: string;
	command?: string;
	output?: string;
	phase?: string;
	error?: string;
	finishReason?: string;
	elapsedSeconds?: number;
	sandboxStatus?: string;
	sandboxPhase?: string;
	runId?: string;
	stream?: "stdout" | "stderr";
	meta?: Record<string, unknown>;
};
