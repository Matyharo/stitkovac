import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession } from '../session';
const mocks = vi.hoisted(() => ({ token: '', findUnique: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: mocks.token }) }) }));
vi.mock('../db', () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));
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
    mocks.token = createSession('maty');
    mocks.findUnique.mockResolvedValue(null);
    await expect(assertAuthenticated()).rejects.toThrow();
    mocks.findUnique.mockResolvedValue({ username: 'maty', role: 'user' });
    await expect(assertAuthenticated()).resolves.toEqual({ username: 'maty', role: 'user' });
    await expect(assertAuthenticated(true)).rejects.toThrow();
    mocks.findUnique.mockResolvedValue({ username: 'maty', role: 'admin' });
    await expect(assertAuthenticated(true)).resolves.toEqual({ username: 'maty', role: 'admin' });
  });
});
