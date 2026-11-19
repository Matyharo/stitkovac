import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSession, verifySession, secureSessionCookie, SESSION_MAX_AGE } from '../session';

afterEach(() => vi.unstubAllEnvs());
describe('signed login session', () => {
  it('accepts a valid token and rejects legacy, modified and expired cookies', () => {
    vi.stubEnv('SESSION_SECRET', 'a'.repeat(64));
    const token = createSession('maty', 1000);
    expect(verifySession(token, 2000)).toEqual({ username: 'maty' });
    expect(verifySession('authenticated_true')).toBeNull();
    expect(verifySession('{"username":"admin"}')).toBeNull();
    const [, signature] = token.split('.');
    const changed = Buffer.from(JSON.stringify({ username: 'admin', expires: 9999999999999 })).toString('base64url');
    expect(verifySession(`${changed}.${signature}`, 2000)).toBeNull();
    expect(verifySession(token, 1000 + SESSION_MAX_AGE * 1000)).toBeNull();
    vi.stubEnv('SESSION_SECRET', 'b'.repeat(64));
    expect(verifySession(token, 2000)).toBeNull();
  });
  it('requires a strong configured secret and explicit LAN cookie opt-out', () => {
    vi.stubEnv('SESSION_SECRET', 'short');
    expect(() => createSession('maty')).toThrow();
    vi.stubEnv('SESSION_COOKIE_SECURE', 'true');
    expect(secureSessionCookie()).toBe(true);
    vi.stubEnv('SESSION_COOKIE_SECURE', 'false');
    expect(secureSessionCookie()).toBe(false);
  });
});
