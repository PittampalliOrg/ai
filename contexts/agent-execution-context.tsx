"use client";

/**
 * @deprecated This context is deprecated. Use WorkflowExecutionProvider instead.
 * This file is kept for backward compatibility with legacy AgentChat components.
 * See: contexts/workflow-execution-context.tsx
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface AgentExecutionStats {
  additions: number;
  deletions: number;
  status: "idle" | "running" | "completed" | "error";
}

interface AgentExecutionContextValue {
  stats: AgentExecutionStats;
  updateStats: (stats: Partial<AgentExecutionStats>) => void;
}

const AgentExecutionContext = createContext<AgentExecutionContextValue | null>(null);

export function AgentExecutionProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<AgentExecutionStats>({
    additions: 0,
    deletions: 0,
    status: "idle",
  });

  const updateStats = useCallback((newStats: Partial<AgentExecutionStats>) => {
    setStats((prev) => ({ ...prev, ...newStats }));
  }, []);

  return (
    <AgentExecutionContext.Provider value={{ stats, updateStats }}>
      {children}
    </AgentExecutionContext.Provider>
  );
}

export function useAgentExecutionContext() {
  const context = useContext(AgentExecutionContext);
  if (!context) {
    throw new Error("useAgentExecutionContext must be used within AgentExecutionProvider");
  }
  return context;
}

/**
 * Optional hook that returns null if not within provider
 */
export function useAgentExecutionContextOptional() {
  return useContext(AgentExecutionContext);
}
