"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { useEffect, useState, Suspense } from "react";

import { Button } from "@/components/ui/button";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [isLoading, setIsLoading] = useState(false);

  const error = searchParams.get("error");
  const callbackUrl = searchParams.get("callbackUrl") || "/agent";

  // Redirect if already authenticated (and no error state)
  useEffect(() => {
    if (status === "authenticated" && session && !session.error) {
      router.push(callbackUrl);
    }
  }, [status, session, router, callbackUrl]);

  const handleGitHubSignIn = async () => {
    setIsLoading(true);
    try {
      await signIn("github", { callbackUrl });
    } catch (err) {
      console.error("Sign in error:", err);
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-dvh w-screen items-start justify-center bg-background pt-12 md:items-center md:pt-0">
      <div className="flex w-full max-w-md flex-col gap-8 overflow-hidden rounded-2xl p-8">
        <div className="flex flex-col items-center justify-center gap-2 text-center">
          <h3 className="font-semibold text-2xl dark:text-zinc-50">
            Welcome to AI Chatbot
          </h3>
          <p className="text-gray-500 text-sm dark:text-zinc-400">
            Sign in with your GitHub account to continue
          </p>
        </div>

        {error === "session_expired" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
            <p className="font-medium text-sm">Your session has expired</p>
            <p className="mt-1 text-xs">Please sign in again to continue.</p>
          </div>
        )}

        <Button
          onClick={handleGitHubSignIn}
          disabled={isLoading || status === "loading"}
          className="flex w-full items-center justify-center gap-2 py-6"
          size="lg"
        >
          <svg
            className="h-5 w-5"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
              clipRule="evenodd"
            />
          </svg>
          {isLoading ? "Signing in..." : "Sign in with GitHub"}
        </Button>

        <p className="text-center text-gray-500 text-xs dark:text-zinc-500">
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh w-screen items-center justify-center bg-background">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
