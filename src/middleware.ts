import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Security middleware:
 * 1. Protects (app) routes — requires auth session
 * 2. Allows (preview) routes without auth (demo mode)
 * 3. Adds security headers to all responses
 * 4. Blocks internal routes and source maps
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // Security headers for all responses
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=(self)");
  // CSP en modo Report-Only: primero observar violaciones en producción antes
  // de enforcedarla (Next.js usa scripts inline, así que exigir script-src
  // requeriría nonces). frame-ancestors 'none' sí refuerza el anti-clickjacking.
  response.headers.set(
    "Content-Security-Policy-Report-Only",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https:; frame-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
  );

  // --- Auth protection for (app) routes ---
  // Skip auth for: preview, login, register, api/auth, static files
  const isPublicRoute = 
    pathname.startsWith("/preview") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/webhooks") ||
    pathname === "/" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icon") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/apple-touch-icon") ||
    pathname === "/manifest.webmanifest";

  if (!isPublicRoute && !pathname.startsWith("/api/")) {
    // Check for Better Auth session cookie
    const sessionCookie = request.cookies.get("better-auth.session_token") || 
                          request.cookies.get("__Secure-better-auth.session_token");
    
    if (!sessionCookie?.value) {
      // No session — redirect to login (or preview for now)
      const loginUrl = new URL("/preview/dashboard", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Block access to internal env/config endpoints
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/")) {
    response.headers.set("X-API-Protected", "true");

    if (
      pathname.includes("/.env") ||
      pathname.includes("/config") ||
      pathname.includes("/_internal")
    ) {
      return new NextResponse(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Prevent source map access in production
  if (pathname.endsWith(".map") && process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.svg|icon.svg|robots.txt).*)",
  ],
};
