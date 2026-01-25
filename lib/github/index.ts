/**
 * GitHub API utilities for the coding agent
 */

// Re-export GitHub App authentication
export {
  getRepoAccessToken,
  getInstallationAccessToken,
  getInstallationForOwner,
  getAppInstallations,
} from "./app-auth";

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

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

export interface Installation {
  id: number;
  account: {
    login: string;
    id: number;
    avatar_url: string;
    type: "User" | "Organization";
  };
  app_id: number;
  repository_selection: "all" | "selected";
}

/**
 * Fetch repositories accessible to the authenticated user
 */
export async function getUserRepositories(
  accessToken: string,
  page = 1,
  perPage = 30
): Promise<{
  repositories: Repository[];
  hasMore: boolean;
  totalCount: number;
}> {
  const response = await fetch(
    `https://api.github.com/user/repos?page=${page}&per_page=${perPage}&sort=updated`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "AI-SDK-Agent",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch repositories: ${response.statusText}`);
  }

  const repositories: Repository[] = await response.json();
  const linkHeader = response.headers.get("Link");
  const hasMore = linkHeader?.includes('rel="next"') ?? false;

  return {
    repositories,
    hasMore,
    totalCount: repositories.length,
  };
}

/**
 * Fetch branches for a repository
 */
export async function getRepositoryBranches(
  accessToken: string,
  owner: string,
  repo: string
): Promise<Array<{ name: string; protected: boolean }>> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/branches`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "AI-SDK-Agent",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch branches: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Clone a repository to a local path
 */
export async function cloneRepository(
  accessToken: string,
  owner: string,
  repo: string,
  branch: string,
  targetPath: string
): Promise<void> {
  const { execSync } = await import("child_process");
  const cloneUrl = `https://x-access-token:${accessToken}@github.com/${owner}/${repo}.git`;

  // Clone with specific branch
  execSync(`git clone --branch ${branch} --single-branch ${cloneUrl} ${targetPath}`, {
    stdio: "inherit",
  });
}

/**
 * Get the authenticated user's information
 */
export async function getAuthenticatedUser(
  accessToken: string
): Promise<GitHubUser> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "AI-SDK-Agent",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Check if user has access to a specific repository
 */
export async function checkRepositoryAccess(
  accessToken: string,
  owner: string,
  repo: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "AI-SDK-Agent",
        },
      }
    );
    return response.ok;
  } catch {
    return false;
  }
}
