import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession } from '../session';
const mocks = vi.hoisted(() => ({ token: '', findUnique: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: mocks.token }) }) }));
vi.mock('../db', () => ({ prisma: { userSession: { findUnique: mocks.findUnique } } }));
import { assertAuthenticated } from '../auth';
beforeEach(() => {
  process.env.SESSION_SECRET = 'test-secret-'.repeat(6);
  mocks.token = '';
  mocks.findUnique.mockReset();
});
describe('server authorization', () => {
  it('rejects unsigned cookies without looking up a user', async () => {
    mocks.token = '{"username":"admin"}';
    await expect(assertAuthenticated()).rejects.toThrow();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
  it('rejects removed users and non-admin access to user administration', async () => {
    mocks.token = createSession('maty', Date.now(), 'session-id');
    mocks.findUnique.mockResolvedValue(null);
    await expect(assertAuthenticated()).rejects.toThrow();
    mocks.findUnique.mockResolvedValue({ expiresAt: new Date(Date.now() + 60000), user: { id: 'maty-id', username: 'maty', name: 'Maty', role: 'user' } });
    await expect(assertAuthenticated()).resolves.toMatchObject({ username: 'maty', role: 'user' });
    await expect(assertAuthenticated(true)).rejects.toThrow();
    mocks.findUnique.mockResolvedValue({ expiresAt: new Date(Date.now() + 60000), user: { id: 'maty-id', username: 'maty', name: 'Maty', role: 'admin' } });
    await expect(assertAuthenticated(true)).resolves.toMatchObject({ username: 'maty', role: 'admin' });
  });
});
