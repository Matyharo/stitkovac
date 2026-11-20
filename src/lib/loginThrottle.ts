// Persistent account-level throttling works across application workers and restarts.
import { prisma } from './db';
import { createHash } from 'node:crypto';
export async function consumeLoginAttempt(username: string) {
  const key = createHash('sha256').update(username).digest('hex');
  const now = new Date();
  return prisma.$transaction(async tx => {
    const record = await tx.loginThrottle.findUnique({ where: { id: key } });
    if (record && record.until > now && record.attempts >= 10) return false;
    await tx.loginThrottle.upsert({ where: { id: key }, create: { id: key, attempts: 1, until: new Date(now.getTime() + 15 * 60000) }, update: !record || record.until <= now ? { attempts: 1, until: new Date(now.getTime() + 15 * 60000) } : { attempts: { increment: 1 } } });
    return true;
  });
}
export async function clearLoginAttempts(username: string) {
  await prisma.loginThrottle.deleteMany({ where: { id: createHash('sha256').update(username).digest('hex') } });
}
