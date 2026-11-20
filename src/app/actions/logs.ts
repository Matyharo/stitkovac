'use server';

import { prisma } from '@/lib/db';
import { assertAuthenticated } from '@/lib/auth';


export async function getActivityLogs(page: number = 1, limit: number = 50, search?: string) {
  await assertAuthenticated(true);
  try {
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search && search.trim() !== '') {
      const term = search.trim();
      where.OR = [
        { username: { contains: term } },
        { action: { contains: term } },
        { details: { contains: term } },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.activityLog.count({ where }),
    ]);

    return {
      success: true,
      logs,
      total,
      totalPages: Math.ceil(total / limit),
    };
  } catch (error: any) {
    console.error('Error fetching activity logs:', error);
    return { success: false, logs: [], total: 0, totalPages: 0, error: error.message };
  }
}
