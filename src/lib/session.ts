import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32 || value.includes('change-in-production')) {
    throw new Error('Nastavte SESSION_SECRET na nahodny tajny klic alespon 32 znaku.');
  }
  return value;
}

export function createSession(username: string, now = Date.now(), sessionId?: string): string {
  const payload = Buffer.from(JSON.stringify({ username, expires: now + SESSION_MAX_AGE * 1000, ...(sessionId ? { sessionId } : {}) })).toString('base64url');
  const signature = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifySession(token: string | undefined, now = Date.now()): { username: string; sessionId?: string } | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payload, signature] = parts;
    const expected = createHmac('sha256', secret()).update(payload).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.username !== 'string' || !data.username.trim() || typeof data.expires !== 'number' || data.expires <= now) return null;
    return { username: data.username, ...(typeof data.sessionId === 'string' ? { sessionId: data.sessionId } : {}) };
  } catch {
    return null;
  }
}

export function secureSessionCookie(): boolean {
  // Explicit opt-out only for a trusted local HTTP network.
  return process.env.SESSION_COOKIE_SECURE !== 'false';
}

export function sessionCookieName(): string {
  const name = process.env.SESSION_COOKIE_NAME || 'auth_session';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) throw new Error('Neplatný název přihlašovací cookie.');
  return name;
}
