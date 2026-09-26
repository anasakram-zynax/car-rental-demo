import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ─── Route Config ─────────────────────────────────────────
const PUBLIC_ROUTES = ['/signin', '/signup', '/agent-register', '/api/auth', '/'];
const AGENT_ROUTES = ['/agent'];
const AUTH_ROUTES = ['/signin', '/signup', '/agent-register'];

// ─── Middleware ────────────────────────────────────────────
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static assets, API routes, and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/images/') ||
    pathname.startsWith('/icons/') ||
    pathname.startsWith('/favicon') ||
    pathname === '/manifest.json'
  ) {
    return NextResponse.next();
  }

  // NOTE: Cookie-based auth checks removed from middleware.
  // Auth cookies are httpOnly, set by the backend on a different domain
  // (backend-travelsota.onrender.com). Vercel middleware cannot read them.
  // Protection is handled by:
  //   1. AdminLayout / AgentLayout client-side auth checks (AuthProvider)
  //   2. Backend admin/staff RBAC guards
  //   3. require-auth.tsx for client-guarded pages

  return NextResponse.next();
}

// ─── Matcher ──────────────────────────────────────────────
export const config = {
  matcher: [
    // Match all routes except static files and API
    '/((?!_next/static|_next/image|favicon.ico|manifest.json).*)',
  ],
};
