/**
 * Agent Registry - Dapr-based Service Discovery
 *
 * Provides dynamic agent discovery using Dapr state store.
 * Agents register themselves on startup with their capabilities,
 * enabling intelligent routing and service discovery.
 *
 * Based on the Dapr Agents pattern for multi-agent orchestration.
 */

import { saveState, getState, getBulkState } from "./client";

// ============================================================================
// Types
// ============================================================================

/**
 * Agent metadata stored in the registry.
 */
export interface AgentMetadata {
  /** Dapr App ID for service invocation */
  appId: string;
  /** Team/namespace for grouping related agents */
  teamName: string;
  /** List of capabilities this agent provides */
  capabilities: string[];
  /** HTTP endpoints exposed by this agent */
  endpoints: string[];
  /** Agent status */
  status: "active" | "inactive" | "draining";
  /** ISO timestamp when agent registered */
  registeredAt: string;
  /** ISO timestamp of last heartbeat */
  lastHeartbeat?: string;
  /** Optional description of the agent */
  description?: string;
  /** Optional version information */
  version?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Agent registration request (used by agents to register themselves).
 */
export interface AgentRegistrationRequest {
  appId: string;
  teamName: string;
  capabilities: string[];
  endpoints: string[];
  description?: string;
  version?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Default state store component name for the agent registry.
 * Can be overridden via environment variable.
 */
const AGENT_REGISTRY_STORE =
  process.env.AGENT_REGISTRY_STORE || "agentregistrystore";

/**
 * Key prefix for agent entries in the state store.
 */
const AGENT_KEY_PREFIX = "agent";

// ============================================================================
// Agent Registry Implementation
// ============================================================================

/**
 * AgentRegistry provides methods for agent registration and discovery
 * using Dapr state store as the backing storage.
 */
export class AgentRegistry {
  private storeComponent: string;

  /**
   * Create a new AgentRegistry instance.
   *
   * @param storeComponent - Dapr state store component name (defaults to AGENT_REGISTRY_STORE)
   */
  constructor(storeComponent: string = AGENT_REGISTRY_STORE) {
    this.storeComponent = storeComponent;
  }

  /**
   * Generate the state key for an agent.
   */
  private getAgentKey(teamName: string, appId: string): string {
    return `${AGENT_KEY_PREFIX}:${teamName}:${appId}`;
  }

  /**
   * Register an agent in the registry.
   * Called by agents at startup to announce their availability.
   *
   * @param request - Agent registration details
   * @returns The full agent metadata that was stored
   */
  async register(request: AgentRegistrationRequest): Promise<AgentMetadata> {
    const metadata: AgentMetadata = {
      ...request,
      status: "active",
      registeredAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
    };

    const key = this.getAgentKey(request.teamName, request.appId);

    await saveState(this.storeComponent, [
      { key, value: metadata },
    ]);

    console.log(
      `[AgentRegistry] Registered agent: ${request.appId} (team: ${request.teamName})`
    );

    return metadata;
  }

  /**
   * Update an agent's heartbeat timestamp.
   * Should be called periodically by agents to indicate they're still alive.
   *
   * @param teamName - Team name
   * @param appId - Agent App ID
   */
  async heartbeat(teamName: string, appId: string): Promise<void> {
    const key = this.getAgentKey(teamName, appId);
    const { data: existing } = await getState<AgentMetadata>(
      this.storeComponent,
      key
    );

    if (existing) {
      existing.lastHeartbeat = new Date().toISOString();
      await saveState(this.storeComponent, [{ key, value: existing }]);
    }
  }

  /**
   * Update an agent's status.
   *
   * @param teamName - Team name
   * @param appId - Agent App ID
   * @param status - New status
   */
  async updateStatus(
    teamName: string,
    appId: string,
    status: AgentMetadata["status"]
  ): Promise<void> {
    const key = this.getAgentKey(teamName, appId);
    const { data: existing } = await getState<AgentMetadata>(
      this.storeComponent,
      key
    );

    if (existing) {
      existing.status = status;
      existing.lastHeartbeat = new Date().toISOString();
      await saveState(this.storeComponent, [{ key, value: existing }]);
      console.log(
        `[AgentRegistry] Updated status for ${appId}: ${status}`
      );
    }
  }

  /**
   * Deregister an agent from the registry.
   * Called when an agent shuts down gracefully.
   *
   * @param teamName - Team name
   * @param appId - Agent App ID
   */
  async deregister(teamName: string, appId: string): Promise<void> {
    // Mark as inactive rather than deleting (for audit trail)
    await this.updateStatus(teamName, appId, "inactive");
    console.log(`[AgentRegistry] Deregistered agent: ${appId}`);
  }

  /**
   * Get a specific agent's metadata.
   *
   * @param teamName - Team name
   * @param appId - Agent App ID
   * @returns Agent metadata or null if not found
   */
  async getAgent(
    teamName: string,
    appId: string
  ): Promise<AgentMetadata | null> {
    const key = this.getAgentKey(teamName, appId);
    const { data } = await getState<AgentMetadata>(this.storeComponent, key);
    return data;
  }

  /**
   * Get all agents registered under a team.
   *
   * Note: This requires knowing the agent IDs upfront or using a state store
   * that supports querying. For Redis, we'll use a separate index.
   *
   * @param teamName - Team name to filter by
   * @param activeOnly - If true, only return active agents
   * @returns Array of agent metadata
   */
  async getAgentsByTeam(
    teamName: string,
    activeOnly: boolean = true
  ): Promise<AgentMetadata[]> {
    // First, get the team index
    const indexKey = `team-index:${teamName}`;
    const { data: agentIds } = await getState<string[]>(
      this.storeComponent,
      indexKey
    );

    if (!agentIds || agentIds.length === 0) {
      return [];
    }

    // Fetch all agents in bulk
    const keys = agentIds.map((id) => this.getAgentKey(teamName, id));
    const results = await getBulkState<AgentMetadata>(this.storeComponent, keys);

    const agents = results
      .filter((r) => r.data)
      .map((r) => r.data);

    if (activeOnly) {
      return agents.filter((a) => a.status === "active");
    }

    return agents;
  }

  /**
   * Register an agent and update the team index.
   * This is the preferred method for registration as it maintains the index.
   *
   * @param request - Agent registration details
   * @returns The full agent metadata that was stored
   */
  async registerWithIndex(
    request: AgentRegistrationRequest
  ): Promise<AgentMetadata> {
    // Register the agent
    const metadata = await this.register(request);

    // Update team index
    const indexKey = `team-index:${request.teamName}`;
    const { data: existingIndex } = await getState<string[]>(
      this.storeComponent,
      indexKey
    );

    const index = existingIndex || [];
    if (!index.includes(request.appId)) {
      index.push(request.appId);
      await saveState(this.storeComponent, [{ key: indexKey, value: index }]);
    }

    return metadata;
  }

  /**
   * Find an agent by capability within a team.
   *
   * @param teamName - Team name
   * @param capability - Required capability
   * @returns First matching active agent or null
   */
  async getAgentByCapability(
    teamName: string,
    capability: string
  ): Promise<AgentMetadata | null> {
    const agents = await this.getAgentsByTeam(teamName, true);
    return (
      agents.find(
        (a) => a.capabilities.includes(capability) && a.status === "active"
      ) || null
    );
  }

  /**
   * Find all agents that have a specific capability.
   *
   * @param teamName - Team name
   * @param capability - Required capability
   * @returns Array of matching active agents
   */
  async getAgentsByCapability(
    teamName: string,
    capability: string
  ): Promise<AgentMetadata[]> {
    const agents = await this.getAgentsByTeam(teamName, true);
    return agents.filter(
      (a) => a.capabilities.includes(capability) && a.status === "active"
    );
  }

  /**
   * Get the best agent for a task based on capabilities.
   * Returns the agent with the most matching capabilities.
   *
   * @param teamName - Team name
   * @param requiredCapabilities - List of required capabilities
   * @returns Best matching agent or null
   */
  async getBestAgentForTask(
    teamName: string,
    requiredCapabilities: string[]
  ): Promise<AgentMetadata | null> {
    const agents = await this.getAgentsByTeam(teamName, true);

    // Score each agent by number of matching capabilities
    const scored = agents.map((agent) => ({
      agent,
      score: requiredCapabilities.filter((cap) =>
        agent.capabilities.includes(cap)
      ).length,
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Return best match if it has at least one capability
    return scored.length > 0 && scored[0].score > 0 ? scored[0].agent : null;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Default agent registry instance using the configured state store.
 */
let defaultRegistry: AgentRegistry | null = null;

/**
 * Get the default agent registry instance.
 */
export function getAgentRegistry(): AgentRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new AgentRegistry();
  }
  return defaultRegistry;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Register an agent in the default registry.
 */
export async function registerAgent(
  request: AgentRegistrationRequest
): Promise<AgentMetadata> {
  return getAgentRegistry().registerWithIndex(request);
}

/**
 * Get agents by team from the default registry.
 */
export async function getAgentsByTeam(
  teamName: string,
  activeOnly: boolean = true
): Promise<AgentMetadata[]> {
  return getAgentRegistry().getAgentsByTeam(teamName, activeOnly);
}

/**
 * Find an agent by capability from the default registry.
 */
export async function findAgentByCapability(
  teamName: string,
  capability: string
): Promise<AgentMetadata | null> {
  return getAgentRegistry().getAgentByCapability(teamName, capability);
}
