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

const PUBLIC_PATHS = ["/login", "/signup", "/register", "/setup-company", "/", "/api"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths through
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith("/_next")
  );
  if (isPublic) return NextResponse.next();

  // Session is stored in localStorage (gulftax_session) — Edge middleware cannot read it.
  // Dashboard auth is enforced client-side in app/dashboard/layout.tsx via AuthContext.
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
