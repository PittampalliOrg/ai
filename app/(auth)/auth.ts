import NextAuth, { type DefaultSession } from "next-auth";
import type { JWT } from "next-auth/jwt";
import GitHub from "next-auth/providers/github";
import { isDevelopmentEnvironment } from "@/lib/constants";
import { findOrCreateGitHubUser } from "@/lib/db/queries";
import { authConfig } from "./auth.config";

// Simplified: All users are "regular" GitHub users
export type UserType = "regular";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      type: UserType;
    } & DefaultSession["user"];
    accessToken?: string; // GitHub access token for repo access
    error?: "RefreshTokenError"; // Token refresh error indicator
  }

  // biome-ignore lint/nursery/useConsistentTypeDefinitions: "Required"
  interface User {
    id?: string;
    email?: string | null;
    type: UserType;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    type: UserType;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    error?: "RefreshTokenError";
  }
}

/**
 * Refresh GitHub OAuth token if expired
 * Note: Standard GitHub OAuth tokens don't expire, but if "token expiration"
 * is enabled in the GitHub App settings, tokens expire after 8 hours.
 */
async function refreshGitHubToken(token: JWT): Promise<JWT> {
  if (!token.refreshToken) {
    console.log("[Auth] No refresh token available - GitHub OAuth tokens are long-lived by default");
    return token;
  }

  try {
    console.log("[Auth] Attempting to refresh GitHub access token");
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID!,
        client_secret: process.env.GITHUB_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      console.error("[Auth] Token refresh failed:", data.error_description || data.error);
      throw new Error(data.error_description || "Token refresh failed");
    }

    console.log("[Auth] Token refreshed successfully");
    return {
      ...token,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? token.refreshToken,
      accessTokenExpires: data.expires_in
        ? Date.now() + data.expires_in * 1000
        : undefined,
    };
  } catch (error) {
    console.error("[Auth] Error refreshing token:", error);
    return {
      ...token,
      error: "RefreshTokenError" as const,
    };
  }
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  trustHost: true, // Required when running behind a proxy/ingress
  useSecureCookies: !isDevelopmentEnvironment, // Match proxy.ts secureCookie setting
  providers: [
    // GitHub OAuth with repo access for coding agent (GitHub-only auth)
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "read:user user:email repo", // repo scope for code access
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      console.log(`[JWT] callback - account present: ${!!account}, token.accessToken present: ${!!token.accessToken}`);

      // Initial sign in - save tokens from GitHub OAuth
      if (account?.provider === "github" && profile) {
        console.log(`[JWT] GitHub login - saving tokens`);
        console.log(`[JWT] Access token length: ${account.access_token?.length || 0}`);
        console.log(`[JWT] Refresh token present: ${!!account.refresh_token}`);
        console.log(`[JWT] Token expires_at: ${account.expires_at || "never (standard OAuth)"}`);

        const githubProfile = profile as {
          id?: number;
          email?: string | null;
          name?: string | null;
        };
        const dbUser = await findOrCreateGitHubUser(
          String(githubProfile.id || account.providerAccountId),
          githubProfile.email || null,
          githubProfile.name || null
        );

        return {
          ...token,
          id: dbUser.id,
          type: "regular" as const,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          // GitHub OAuth tokens don't expire by default, but if "token expiration"
          // is enabled, expires_at will be set (in seconds since epoch)
          accessTokenExpires: account.expires_at
            ? account.expires_at * 1000
            : undefined,
        };
      }

      // Check if token needs refresh (if expiration is set)
      if (token.accessTokenExpires) {
        const shouldRefresh = Date.now() > (token.accessTokenExpires as number) - 5 * 60 * 1000; // 5 min buffer
        if (shouldRefresh) {
          console.log("[JWT] Token expired or expiring soon, attempting refresh");
          return refreshGitHubToken(token);
        }
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.type = token.type;
      }
      // Pass GitHub access token to session for API calls
      if (token.accessToken) {
        session.accessToken = token.accessToken;
      }
      // Pass error state to session so client can handle re-auth
      if (token.error) {
        session.error = token.error;
      }

      return session;
    },
  },
});
