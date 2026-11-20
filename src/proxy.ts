import { sessionCookieName } from '@/lib/session';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession } from './lib/session';

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  const isAuthenticated = Boolean(verifySession(req.cookies.get(sessionCookieName())?.value)?.sessionId);
  if (path === '/api/cron/sync-feed' || path === '/api/health') return NextResponse.next();

  // Login remains reachable for expired or revoked database sessions.
  if (path === '/login') return NextResponse.next();

  // Pokud není přihlášený, přesměrujeme na /login
  if (!isAuthenticated) {
    const loginUrl = new URL('/login', req.url);
    // Uložíme si původní cestu, kam uživatel mířil
    if (path !== '/' && path !== '') {
      loginUrl.searchParams.set('returnUrl', path);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Matcher filtruje statické soubory, roboty a faviconu, aby na ně proxy nereagoval
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
