import { sessionCookieName } from '@/lib/session';
import { cookies } from 'next/headers';
import { prisma } from './db';
import { verifySession } from './session';

export async function getAuthenticatedUser() {
  const token = (await cookies()).get(sessionCookieName())?.value;
  const session = verifySession(token);
  if (!session?.sessionId) return null;
  const record = await prisma.userSession.findUnique({ where: { id: session.sessionId }, include: { user: true } });
  if (!record || record.expiresAt <= new Date() || record.user.username !== session.username) return null;
  return { id: record.user.id, username: record.user.username, name: record.user.name, role: record.user.role };

}

export async function assertAuthenticated(admin = false) {
  const user = await getAuthenticatedUser();
  if (!user || (admin && user.role !== 'admin')) {
    throw new Error('Neopravneny pristup. Prihlaste se znovu.');
  }
  return user;
}
