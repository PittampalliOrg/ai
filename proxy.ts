import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { isDevelopmentEnvironment } from "./lib/constants";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get the proper external URL for redirects (respects X-Forwarded-* headers from ingress)
  const getExternalUrl = (path: string = pathname) => {
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (appUrl) {
      return new URL(path, appUrl).toString();
    }
    if (forwardedHost) {
      return `${forwardedProto}://${forwardedHost}${path}`;
    }
    return new URL(path, request.url).toString();
  };

  /*
   * Playwright starts the dev server and requires a 200 status to
   * begin the tests, so this ensures that the tests can start
   */
  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  // Allow health endpoint through without authentication for K8s probes
  if (pathname.startsWith("/api/health")) {
    return NextResponse.next();
  }

  // Allow NextAuth API routes through
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Allow workflow-patterns API through for development testing
  if (pathname.startsWith("/api/workflow-patterns")) {
    return NextResponse.next();
  }

  // Allow Dapr webhooks through (service-to-service, no user auth)
  if (pathname.startsWith("/api/webhooks/dapr")) {
    return NextResponse.next();
  }

  // Allow Dapr subscribe endpoint through (sidecar discovery)
  if (pathname.startsWith("/api/dapr")) {
    return NextResponse.next();
  }

  // Allow login page without authentication
  if (pathname === "/login") {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: !isDevelopmentEnvironment,
  });

  // Redirect unauthenticated users to login page (GitHub OAuth)
  if (!token) {
    const loginUrl = getExternalUrl("/login");
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from login/register pages
  if (["/login", "/register"].includes(pathname)) {
    const homeUrl = getExternalUrl("/");
    return NextResponse.redirect(homeUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/chat/:id",
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
