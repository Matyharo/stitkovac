import { createDatabaseSnapshot } from '../src/lib/backup';
import { prisma } from '../src/lib/db';
import { resolve } from 'node:path';
import { readdir, unlink, copyFile, mkdir, chmod } from 'node:fs/promises';

async function main() {
  const directory = resolve(process.env.BACKUP_DIRECTORY || 'prisma/database-backups');
  const filename = `stitkovac-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
  try {
    await createDatabaseSnapshot(resolve(directory, filename));
    if (process.env.OFFSITE_BACKUP_DIRECTORY) {
      const offsite = resolve(process.env.OFFSITE_BACKUP_DIRECTORY);
      await mkdir(offsite, { recursive: true, mode: 0o700 });
      await copyFile(resolve(directory, filename), resolve(offsite, filename));
      await chmod(resolve(offsite, filename), 0o600);
      const copies = (await readdir(offsite)).filter(f => /^stitkovac-[\dTZ.-]+\.db$/.test(f)).sort().reverse();
      for (const old of copies.slice(30)) await unlink(resolve(offsite, old));
    }
    const backups = (await readdir(directory)).filter(f => /^stitkovac-[\dTZ.-]+\.db$/.test(f)).sort().reverse();
    for (const old of backups.slice(30)) await unlink(resolve(directory, old));
    console.log('Konzistentní záloha dokončena. Uchovává se posledních 30 záloh.');
  } finally { await prisma.$disconnect(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Operace selhala."); process.exitCode = 1; });
