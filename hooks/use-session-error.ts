"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Hook that monitors session for errors and handles re-authentication.
 *
 * When a token refresh error is detected, it:
 * 1. Signs the user out
 * 2. Redirects to login with a session_expired message
 *
 * This provides client-side error handling that complements the middleware.
 */
export function useSessionError() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const hasHandledError = useRef(false);

  useEffect(() => {
    // Only handle the error once to prevent redirect loops
    if (hasHandledError.current) return;

    if (status === "authenticated" && session?.error === "RefreshTokenError") {
      hasHandledError.current = true;
      console.log("[useSessionError] Token refresh error detected, signing out");

      // Sign out and redirect to login
      signOut({
        redirect: false,
      }).then(() => {
        router.push("/login?callbackUrl=/agent&error=session_expired");
      });
    }
  }, [session, status, router]);

  return {
    session,
    status,
    hasError: session?.error === "RefreshTokenError",
  };
}
