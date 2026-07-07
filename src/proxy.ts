import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Kontrola přítomnosti relační cookie
  const authSession = req.cookies.get('auth_session')?.value;
  let isAuthenticated = false;
  if (authSession) {
    try {
      const decoded = JSON.parse(authSession);
      if (decoded && decoded.username) {
        isAuthenticated = true;
      }
    } catch {
      if (authSession === 'authenticated_true') {
        isAuthenticated = true;
      }
    }
  }

  // Pokud jde o přihlašovací stránku
  if (path === '/login') {
    if (isAuthenticated) {
      // Pokud je již přihlášený, přesměrujeme ho na nástěnku
      return NextResponse.redirect(new URL('/', req.url));
    }
    return NextResponse.next();
  }

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
