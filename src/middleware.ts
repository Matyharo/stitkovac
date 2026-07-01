import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Kontrola přítomnosti relační cookie
  const isAuthenticated = req.cookies.get('auth_session')?.value === 'authenticated_true';

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
     * Matcher filtruje statické soubory, roboty a faviconu, aby na ně middleware nereagoval
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)',
  ],
};
