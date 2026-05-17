/**
 * Next.js Edge Middleware — protect /dashboard/* routes.
 *
 * Reads the Supabase session cookie that @supabase/supabase-js writes.
 * If no session cookie exists, redirect to /login.
 *
 * This is a lightweight first line of defence; the backend enforces
 * per-route auth independently via JWT + X-Company-ID.
 */
import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/register", "/", "/api"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths through
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith("/_next")
  );
  if (isPublic) return NextResponse.next();

  // Only gate /dashboard and any other private paths
  if (!pathname.startsWith("/dashboard")) return NextResponse.next();

  // Supabase stores the session in a cookie named sb-<project-ref>-auth-token
  // We look for any cookie that starts with "sb-" and contains "-auth-token"
  const cookies = request.cookies.getAll();
  const hasSession = cookies.some(
    (c) =>
      (c.name.startsWith("sb-") && c.name.endsWith("-auth-token")) ||
      c.name === "supabase-auth-token"
  );

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match everything EXCEPT:
     * - _next/static (static files)
     * - _next/image (Next.js image optimisation)
     * - favicon.ico
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
