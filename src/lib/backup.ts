import { prisma } from './db';
import { mkdir, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';
export async function createDatabaseSnapshot(filename: string) {
  await mkdir(dirname(filename), { recursive: true, mode: 0o700 });
  await prisma.$executeRawUnsafe('VACUUM INTO ?', filename);
  await chmod(filename, 0o600);
}
