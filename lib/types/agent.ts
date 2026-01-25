/**
 * Types for the async coding agent
 */

/**
 * Represents a target repository for agent operations
 */
export interface TargetRepository {
  owner: string;
  repo: string;
  branch?: string;
}

/**
 * Status types for agent sessions
 */
export type AgentSessionStatus = "idle" | "running" | "completed" | "error";

/**
 * GitHub repository type for the selector
 */
export interface Repository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  default_branch: string;
  permissions?: {
    admin: boolean;
    push: boolean;
    pull: boolean;
  };
  fork: boolean;
  has_issues: boolean;
}

/**
 * GitHub branch type for the selector
 */
export interface Branch {
  name: string;
  protected: boolean;
  commit?: {
    sha: string;
    url: string;
  };
}
