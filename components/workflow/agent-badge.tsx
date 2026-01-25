"use client";

/**
 * Agent Badge Component
 *
 * Visual identification for different agents in the workflow.
 * - claude-planner: Blue
 * - claude-code-agent: Purple
 */

import { memo } from "react";
import type { AgentId } from "@/hooks/use-workflow-stream";
import { cn } from "@/lib/utils";

interface AgentBadgeProps {
  agentId: AgentId | null | undefined;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

const AGENT_CONFIG: Record<
  AgentId,
  { label: string; color: string; bgColor: string; dotColor: string }
> = {
  "claude-planner": {
    label: "Planner",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    dotColor: "bg-blue-500",
  },
  "claude-code-agent": {
    label: "Code Agent",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    dotColor: "bg-purple-500",
  },
};

const SIZE_CONFIG = {
  sm: {
    dot: "w-1.5 h-1.5",
    text: "text-xs",
    padding: "px-1.5 py-0.5",
    gap: "gap-1",
  },
  md: {
    dot: "w-2 h-2",
    text: "text-sm",
    padding: "px-2 py-1",
    gap: "gap-1.5",
  },
  lg: {
    dot: "w-2.5 h-2.5",
    text: "text-base",
    padding: "px-3 py-1.5",
    gap: "gap-2",
  },
};

export const AgentBadge = memo(function AgentBadge({
  agentId,
  size = "sm",
  showLabel = true,
  className,
}: AgentBadgeProps) {
  if (!agentId) return null;

  const config = AGENT_CONFIG[agentId];
  const sizeConfig = SIZE_CONFIG[size];

  if (!config) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        sizeConfig.gap,
        sizeConfig.padding,
        config.bgColor,
        config.color,
        className
      )}
    >
      <span className={cn("rounded-full", sizeConfig.dot, config.dotColor)} />
      {showLabel && <span className={sizeConfig.text}>{config.label}</span>}
    </span>
  );
});

/**
 * Inline dot indicator for agent (no label)
 */
export const AgentDot = memo(function AgentDot({
  agentId,
  size = "md",
  className,
}: Omit<AgentBadgeProps, "showLabel">) {
  if (!agentId) return null;

  const config = AGENT_CONFIG[agentId];
  const sizeConfig = SIZE_CONFIG[size];

  if (!config) return null;

  return (
    <span
      className={cn("rounded-full", sizeConfig.dot, config.dotColor, className)}
      title={config.label}
    />
  );
});

/**
 * Get agent color for custom styling
 */
export function getAgentColor(agentId: AgentId | null | undefined): string {
  if (!agentId) return "text-zinc-400";
  return AGENT_CONFIG[agentId]?.color || "text-zinc-400";
}

/**
 * Get agent background color for custom styling
 */
export function getAgentBgColor(agentId: AgentId | null | undefined): string {
  if (!agentId) return "bg-zinc-500/10";
  return AGENT_CONFIG[agentId]?.bgColor || "bg-zinc-500/10";
}

/**
 * Get agent label
 */
export function getAgentLabel(agentId: AgentId | null | undefined): string {
  if (!agentId) return "Unknown";
  return AGENT_CONFIG[agentId]?.label || "Unknown";
}
