import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { isDevelopmentEnvironment } from "./lib/constants";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /*
   * Playwright starts the dev server and requires a 200 status to
   * begin the tests, so this ensures that the tests can start
   */
  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Allow health endpoint through without authentication for K8s probes
  if (pathname.startsWith("/api/health")) {
    return NextResponse.next();
  }

  // Allow Dapr endpoints through without authentication for service mesh communication
  // This includes /dapr/* (subscription discovery), /api/dapr/*, and /api/webhooks/dapr/*
  if (pathname.startsWith("/dapr") || pathname.startsWith("/api/dapr") || pathname.startsWith("/api/webhooks/dapr")) {
    return NextResponse.next();
  }

  // Allow cron endpoints through without authentication for scheduled jobs
  if (pathname.startsWith("/api/cron")) {
    return NextResponse.next();
  }

  // Public routes that don't require authentication
  const isPublicRoute = ["/login", "/register"].includes(pathname);

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: !isDevelopmentEnvironment,
  });

  // Handle token refresh errors - redirect to login with error indicator
  // Skip if already on login page to prevent redirect loop
  if (token?.error === "RefreshTokenError" && !isPublicRoute) {
    console.log("[Proxy] Token refresh error detected, redirecting to login");
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    loginUrl.searchParams.set("error", "session_expired");
    return NextResponse.redirect(loginUrl);
  }

  // Redirect to login if not authenticated
  if (!token) {
    // Allow public routes
    if (isPublicRoute) {
      return NextResponse.next();
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from auth pages (only if no token error)
  if (token && !token.error && isPublicRoute) {
    return NextResponse.redirect(new URL("/agent", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/chat/:id",
    "/agent",
    "/agent/:id",
    "/api/:path*",
    "/login",
    "/register",

    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
