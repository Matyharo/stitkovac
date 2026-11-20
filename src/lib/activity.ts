import { prisma } from './db';
import { getAuthenticatedUser } from './auth';
export async function logActivity(action: string, details: string) {
  try {
    const user = await getAuthenticatedUser();
    await prisma.activityLog.create({ data: { username: user?.username || 'system', action: action.slice(0, 80), details: details.slice(0, 8000) } });
  } catch { console.error('Audit log write failed'); }
}
