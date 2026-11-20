import { PrismaClient } from '@prisma/client';

if (process.env.NODE_ENV === 'test' && (!process.env.STITKOVAC_TEST_DATABASE_URL || process.env.DATABASE_URL !== process.env.STITKOVAC_TEST_DATABASE_URL)) throw new Error('Testy vyžadují izolovanou dočasnou databázi.');

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
export default prisma;
