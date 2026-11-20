'use server';
import { sessionCookieName } from '@/lib/session';

import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { hashPassword, verifyPassword, validatePassword } from '@/lib/passwords';
import { logActivity } from '@/lib/activity';
import { consumeLoginAttempt, clearLoginAttempts } from '@/lib/loginThrottle';
import { verifySession } from '@/lib/session';
import { createSession, SESSION_MAX_AGE, secureSessionCookie } from '@/lib/session';
import { getAuthenticatedUser, assertAuthenticated } from '@/lib/auth';


// --- AUTH UTILS ---
export async function requireAuthenticatedSession(): Promise<{ authenticated: boolean; username?: string }> {
  const user = await getAuthenticatedUser();
  return user ? { authenticated: true, username: user.username } : { authenticated: false };
}

// --- AUTH ACTIONS ---

export async function login(username: string, password: string) {
  try {
    if (typeof username !== 'string' || typeof password !== 'string' || username.length > 100 || password.length > 256) return { success: false, error: 'Nesprávné přihlašovací údaje.' };
    const normalizedUsername = username.toLowerCase().trim();
    if (!await consumeLoginAttempt(normalizedUsername)) return { success: false, error: 'Příliš mnoho pokusů. Zkuste to za 15 minut.' };
    const user = await prisma.user.findUnique({
      where: { username: normalizedUsername },
    });

    if (user && await verifyPassword(password, user.passwordHash)) {
      if (!user.passwordHash.startsWith('scrypt$')) {
        const upgraded = await hashPassword(password);
        if (upgraded) await prisma.user.update({ where: { id: user.id }, data: { passwordHash: upgraded } });
      }
      await clearLoginAttempts(normalizedUsername);
      const sessionId = crypto.randomUUID();
      await prisma.userSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      const signedSession = createSession(user.username, Date.now(), sessionId);
      await prisma.userSession.create({ data: { id: sessionId, userId: user.id, expiresAt: new Date(Date.now() + SESSION_MAX_AGE * 1000) } });
      const cookieStore = await cookies();
      cookieStore.set(sessionCookieName(), signedSession, {
        httpOnly: true,
        secure: secureSessionCookie(),
        sameSite: 'lax',
        maxAge: SESSION_MAX_AGE,
        path: '/',
      });

      await logActivity('LOGIN', `Uživatel se úspěšně přihlásil: ${user.username} (${user.name})`);
      return { success: true };
    }

    return { success: false, error: 'Nesprávné přihlašovací údaje.' };
  } catch (error: any) {
    console.error('Error in login action:', error);
    return { success: false, error: 'Chyba při přihlašování.' };
  }
}

export async function logout() {
  try {
    await logActivity('LOGOUT', 'Uživatel se odhlásil');
    const cookieStore = await cookies();
    const sessionId = verifySession(cookieStore.get(sessionCookieName())?.value)?.sessionId;
    if (sessionId) await prisma.userSession.deleteMany({ where: { id: sessionId } });
    cookieStore.delete(sessionCookieName());
    return { success: true };
  } catch (error: any) {
    console.error('Error in logout action:', error);
    return { success: false, error: 'Chyba při odhlašování.' };
  }
}

export async function getUsers() {
  await assertAuthenticated(true);
  try {
    const users = await prisma.user.findMany({
      orderBy: { username: 'asc' },
    });
    return users.map(u => ({ id: u.id, username: u.username, name: u.name, role: u.role, createdAt: u.createdAt }));
  } catch (error) {
    console.error('Error fetching users:', error);
    return [];
  }
}

export async function createUser(data: { username: string; password: string; name: string; role?: string }) {
  await assertAuthenticated(true);
  try {
    data = { ...data, username: data.username.trim().toLowerCase() };
    validatePassword(data.password);
    if (!/^[a-z0-9._-]{2,100}$/.test(data.username) || !data.name.trim() || !['admin', 'user'].includes(data.role || 'user')) throw new Error('Neplatné údaje uživatele.');
    const existing = await prisma.user.findUnique({
      where: { username: data.username },
    });
    if (existing) {
      return { success: false, error: 'Uživatelské jméno již existuje.' };
    }

    const passwordHash = await hashPassword(data.password);
    await prisma.user.create({
      data: {
        username: data.username,
        passwordHash,
        name: data.name,
        role: data.role || 'user',
      },
    });

    await logActivity('USER_CREATE', `Vytvořen nový uživatel: ${data.username} (${data.name})`);
    return { success: true };
  } catch (error: any) {
    console.error('Error creating user:', error);
    return { success: false, error: error.message || 'Nepodařilo se vytvořit uživatele.' };
  }
}

export async function deleteUser(id: string) {
  await assertAuthenticated(true);
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return { success: false, error: 'Uživatel nenalezen.' };

    if (user.role === 'admin' && await prisma.user.count({ where: { role: 'admin' } }) <= 1) {
      return { success: false, error: 'Hlavního administrátora "admin" nelze smazat.' };
    }

    await prisma.user.delete({ where: { id } });
    await logActivity('USER_DELETE', `Smazán uživatel: ${user.username}`);
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting user:', error);
    return { success: false, error: error.message || 'Nepodařilo se smazat uživatele.' };
  }
}

export async function changeUserPassword(id: string, newPassword: string) {
  await assertAuthenticated(true);
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return { success: false, error: 'Uživatel nenalezen.' };

    validatePassword(newPassword);
    const passwordHash = await hashPassword(newPassword);
    await prisma.$transaction([
      prisma.user.update({ where: { id }, data: { passwordHash } }),
      prisma.userSession.deleteMany({ where: { userId: id } }),
    ]);

    await logActivity('USER_PASSWORD_CHANGE', `Změněno heslo pro uživatele: ${user.username}`);
    return { success: true };
  } catch (error: any) {
    console.error('Error changing password:', error);
    return { success: false, error: error.message || 'Nepodařilo se změnit heslo.' };
  }
}
