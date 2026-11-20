import { cookies } from 'next/headers';
import { prisma } from './db';
import { verifySession } from './session';

export async function getAuthenticatedUser() {
  const token = (await cookies()).get('auth_session')?.value;
  const session = verifySession(token);
  if (!session) return null;
  return prisma.user.findUnique({
    where: { username: session.username },
    select: { username: true, name: true, role: true },
  });
}

export async function assertAuthenticated(admin = false) {
  const user = await getAuthenticatedUser();
  if (!user || (admin && user.role !== 'admin')) {
    throw new Error('Neopravneny pristup. Prihlaste se znovu.');
  }
  return user;
}
