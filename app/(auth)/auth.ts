import NextAuth, { type DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";
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
  }

  // biome-ignore lint/nursery/useConsistentTypeDefinitions: "Required"
  interface User {
    id?: string;
    email?: string | null;
    type: UserType;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    type: UserType;
    accessToken?: string;
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
      // Handle GitHub OAuth - create/find database user
      if (account?.provider === "github" && profile) {
        console.log(`[JWT] GitHub login - saving accessToken, length: ${account.access_token?.length || 0}`);
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
        token.accessToken = account.access_token;
        token.id = dbUser.id; // Use database user ID
        token.type = "regular";
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

      return session;
    },
  },
});
