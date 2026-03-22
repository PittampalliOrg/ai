"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
	AgentStreamEvent,
} from "@/lib/types/agent-stream-events";

const MAX_BUFFERED_EVENTS = 200;

export type UseAgentStreamOptions = {
	executionId: string | null;
	enabled?: boolean;
};

export type UseAgentStreamReturn = {
	events: AgentStreamEvent[];
	isConnected: boolean;
	activeToolName: string | null;
	currentPhase: string | null;
	recentToolCalls: AgentStreamEvent[];
	llmTokenBuffer: string;
	isLlmStreaming: boolean;
	sandboxOutputs: AgentStreamEvent[];
	activeSandboxLines: string[];
	activeSandboxCommand: string | null;
};

export function useAgentStream({
	executionId,
	enabled = true,
}: UseAgentStreamOptions): UseAgentStreamReturn {
	const [events, setEvents] = useState<AgentStreamEvent[]>([]);
	const [isConnected, setIsConnected] = useState(false);
	const [activeToolName, setActiveToolName] = useState<string | null>(null);
	const [currentPhase, setCurrentPhase] = useState<string | null>(null);
	const [llmTokenBuffer, setLlmTokenBuffer] = useState("");
	const [isLlmStreaming, setIsLlmStreaming] = useState(false);
	const [activeSandboxLines, setActiveSandboxLines] = useState<string[]>([]);
	const [activeSandboxCommand, setActiveSandboxCommand] = useState<string | null>(null);

	const lastEventIdRef = useRef<string | null>(null);

	useEffect(() => {
		setEvents([]);
		setIsConnected(false);
		setActiveToolName(null);
		setCurrentPhase(null);
		setLlmTokenBuffer("");
		setIsLlmStreaming(false);
		setActiveSandboxLines([]);
		setActiveSandboxCommand(null);
		lastEventIdRef.current = null;
	}, [executionId]);

	const processEvent = useCallback((event: AgentStreamEvent) => {
		setEvents((prev) => {
			const next = [...prev, event];
			return next.length > MAX_BUFFERED_EVENTS
				? next.slice(-MAX_BUFFERED_EVENTS)
				: next;
		});

		switch (event.type) {
			case "tool_call_start":
			case "tool_start":
				setActiveToolName(event.toolName ?? null);
				break;
			case "tool_call_end":
			case "tool_complete":
			case "tool_call_error":
			case "tool_error":
				setActiveToolName(null);
				setActiveSandboxLines([]);
				setActiveSandboxCommand(null);
				break;
			case "sandbox_output_partial":
				if (typeof event.output === "string") {
					setActiveSandboxLines((prev) => [...prev, event.output]);
				}
				if (event.command) {
					setActiveSandboxCommand(event.command);
				}
				break;
			case "sandbox_output":
				setActiveSandboxLines([]);
				setActiveSandboxCommand(null);
				break;
			case "sandbox_heartbeat":
				break;
			case "llm_start":
			case "model_start":
				setIsLlmStreaming(true);
				setLlmTokenBuffer("");
				break;
			case "llm_token":
				if (event.token) {
					setLlmTokenBuffer((prev) => prev + event.token);
				}
				break;
			case "llm_complete":
			case "model_complete":
				setIsLlmStreaming(false);
				break;
			case "run_complete":
			case "run_error":
				setActiveToolName(null);
				setIsLlmStreaming(false);
				setActiveSandboxLines([]);
				setActiveSandboxCommand(null);
				break;
		}

		if (event.phase) {
			setCurrentPhase(event.phase);
		}
	}, []);

	useEffect(() => {
		if (!executionId || !enabled || typeof window === "undefined") {
			return;
		}

		// Route through the ai-chatbot BFF proxy
		let url = `/api/workflows/${encodeURIComponent(executionId)}/agent-stream`;
		if (lastEventIdRef.current) {
			url += `?lastEventId=${lastEventIdRef.current}`;
		}

		const source = new EventSource(url);

		source.addEventListener("agent_event", (e) => {
			const messageEvent = e as MessageEvent;
			try {
				const event = JSON.parse(messageEvent.data) as AgentStreamEvent;
				if (messageEvent.lastEventId) {
					lastEventIdRef.current = messageEvent.lastEventId;
				}
				processEvent(event);
			} catch {
				// Ignore malformed events
			}
		});

		source.onopen = () => {
			setIsConnected(true);
		};

		source.onerror = () => {
			setIsConnected(false);
		};

		return () => {
			source.close();
			setIsConnected(false);
		};
	}, [executionId, enabled, processEvent]);

	const recentToolCalls = events.filter(
		(e) =>
			e.type === "tool_call_start" ||
			e.type === "tool_start" ||
			e.type === "tool_call_end" ||
			e.type === "tool_complete" ||
			e.type === "tool_call_error" ||
			e.type === "tool_error",
	);

	const sandboxOutputs = events.filter((e) => e.type === "sandbox_output");

	return {
		events,
		isConnected,
		activeToolName,
		currentPhase,
		recentToolCalls,
		llmTokenBuffer,
		isLlmStreaming,
		sandboxOutputs,
		activeSandboxLines,
		activeSandboxCommand,
	};
}
