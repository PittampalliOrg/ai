"use server";

// Authentication actions for GitHub-only auth
// Email/password login and registration are no longer supported.
// All authentication is handled through GitHub OAuth via NextAuth.

// These types and functions are kept for backward compatibility
// but will redirect/fail gracefully if called.

export type LoginActionState = {
  status: "idle" | "in_progress" | "success" | "failed" | "invalid_data";
};

export const login = async (
  _: LoginActionState,
  _formData: FormData
): Promise<LoginActionState> => {
  // Email/password login is no longer supported
  // Users should use GitHub OAuth instead
  return { status: "failed" };
};

export type RegisterActionState = {
  status:
    | "idle"
    | "in_progress"
    | "success"
    | "failed"
    | "user_exists"
    | "invalid_data";
};

export const register = async (
  _: RegisterActionState,
  _formData: FormData
): Promise<RegisterActionState> => {
  // Registration is no longer supported
  // Users should sign in with GitHub instead
  return { status: "failed" };
};
