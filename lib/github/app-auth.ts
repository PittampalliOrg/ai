/**
 * GitHub App Authentication
 * Generates installation access tokens for repository operations
 */

import { createSign } from "crypto";

interface InstallationToken {
  token: string;
  expires_at: string;
  permissions: Record<string, string>;
  repository_selection: "all" | "selected";
}

/**
 * Generate a JWT for GitHub App authentication using Node.js crypto
 */
function generateAppJWT(): string {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!appId || !privateKey) {
    throw new Error("GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY are required");
  }

  // Parse the private key (handle escaped newlines from env var)
  const pemKey = privateKey.replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60, // 60 seconds in the past to account for clock drift
    exp: now + 600, // 10 minutes max
    iss: appId,
  };

  // Create JWT header
  const header = { alg: "RS256", typ: "JWT" };

  // Base64url encode
  const base64url = (obj: object | string) => {
    const str = typeof obj === "string" ? obj : JSON.stringify(obj);
    return Buffer.from(str)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  };

  const headerB64 = base64url(header);
  const payloadB64 = base64url(payload);
  const message = `${headerB64}.${payloadB64}`;

  // Sign with RSA-SHA256
  const sign = createSign("RSA-SHA256");
  sign.update(message);
  const signature = sign
    .sign(pemKey, "base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return `${message}.${signature}`;
}

/**
 * Get all installations for the GitHub App
 */
export async function getAppInstallations(): Promise<
  Array<{
    id: number;
    account: { login: string; type: string };
  }>
> {
  const jwt = generateAppJWT();

  const response = await fetch("https://api.github.com/app/installations", {
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "AI-SDK-Agent",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get installations: ${response.status} ${error}`);
  }

  return response.json();
}

/**
 * Get installation ID for a specific owner (user or org)
 */
export async function getInstallationForOwner(
  owner: string
): Promise<number | null> {
  try {
    const installations = await getAppInstallations();
    console.log(`[GitHub App] Found ${installations.length} installations:`,
      installations.map(i => `${i.account.login} (${i.id})`).join(', '));
    const installation = installations.find(
      (i) => i.account.login.toLowerCase() === owner.toLowerCase()
    );
    if (installation) {
      console.log(`[GitHub App] Using installation ${installation.id} for ${owner}`);
    }
    return installation?.id ?? null;
  } catch (error) {
    console.error("[GitHub App] Failed to get installation for owner:", error);
    return null;
  }
}

/**
 * Generate an installation access token for a specific installation
 */
export async function getInstallationAccessToken(
  installationId: number
): Promise<InstallationToken> {
  const jwt = generateAppJWT();

  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "AI-SDK-Agent",
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Failed to get installation token: ${response.status} ${error}`
    );
  }

  const tokenData: InstallationToken = await response.json();
  console.log(`[GitHub App] Token permissions:`, JSON.stringify(tokenData.permissions));
  console.log(`[GitHub App] Repository selection: ${tokenData.repository_selection}`);
  return tokenData;
}

/**
 * Get an access token for a repository
 * Tries GitHub App installation token first, falls back to user OAuth token
 */
export async function getRepoAccessToken(
  owner: string,
  userOAuthToken?: string
): Promise<{ token: string; source: "app" | "oauth" }> {
  // Try GitHub App installation token first
  if (process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY) {
    try {
      const installationId = await getInstallationForOwner(owner);
      if (installationId) {
        const { token } = await getInstallationAccessToken(installationId);
        console.log(`[GitHub App] Using installation token for ${owner}`);
        return { token, source: "app" };
      } else {
        console.log(`[GitHub App] No installation found for ${owner}`);
      }
    } catch (error) {
      console.warn(`[GitHub App] Token generation failed for ${owner}:`, error);
    }
  }

  // Fall back to user OAuth token
  if (userOAuthToken) {
    console.log(`[GitHub] Using OAuth token for ${owner}`);
    return { token: userOAuthToken, source: "oauth" };
  }

  throw new Error(`No GitHub access token available for ${owner}`);
}
