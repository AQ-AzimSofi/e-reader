import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { findPublicBook } from '@/lib/publicBooks';

// What a signed-out guest may reach: the home redirect ('/') and public library,
// and the reader ('/read') for an allowlisted book (checked against the query params).
// A preview book's illustrations and metadata come through /api/book-assets, which
// applies the same allowlist itself.
function isGuestAllowed(request: NextRequest): boolean {
  const path = request.nextUrl.pathname;

  if (path === '/' || path === '/library') {
    return true;
  }

  if (path === '/read') {
    const directory = request.nextUrl.searchParams.get('directory');
    const fileName = request.nextUrl.searchParams.get('fileName');
    return findPublicBook(directory, fileName) !== null;
  }

  return false;
}

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/login')) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get('session');
  if (sessionCookie && (await verifySession(sessionCookie.value))) {
    return NextResponse.next();
  }

  if (isGuestAllowed(request)) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL('/login', request.url));
}

// Protect all routes except public ones
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api (ALL API routes - they handle their own auth)
     * - public files (images, etc)
     */
    '/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
