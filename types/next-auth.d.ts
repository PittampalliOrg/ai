import { DefaultSession } from "next-auth";

/**
 * Module augmentation for NextAuth types.
 *
 * This extends the Session type to include GitHub OAuth tokens and error states.
 * The augmentation must be in a .d.ts file to be available project-wide.
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      type: "regular";
    } & DefaultSession["user"];
    accessToken?: string;
    error?: "RefreshTokenError";
  }

  interface User {
    id?: string;
    email?: string | null;
    type: "regular";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    type: "regular";
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    error?: "RefreshTokenError";
  }
}
