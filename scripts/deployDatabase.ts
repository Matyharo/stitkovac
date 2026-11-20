import { prisma } from '../src/lib/db';
import { createDatabaseSnapshot } from '../src/lib/backup';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

async function main() {
  try {
    const tables = await prisma.$queryRawUnsafe<{ name: string }[]>("SELECT name FROM sqlite_master WHERE type = 'table'");
    const existing = new Set(tables.map(t => t.name));
    if (existing.has('Product')) {
      const path = resolve(process.env.BACKUP_DIRECTORY || 'prisma/database-backups', `before-migration-${Date.now()}.db`);
      await createDatabaseSnapshot(path);
      console.log(`Záloha před migrací: ${path}`);
      if (!existing.has('_prisma_migrations')) {
        if (!['CustomSafetyCategory', 'SafetyCatalogState', 'SafetyCatalogImport'].every(t => existing.has(t))) throw new Error('Databáze neodpovídá poslední verzi aplikace. Migrace byla zastavena, záloha je zachovaná.');
        execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'resolve', '--applied', '20261119000000_baseline'], { stdio: 'inherit' });
      }
    }
    await prisma.$disconnect();
    execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { stdio: 'inherit' });
    await prisma.feedConfig.updateMany({ where: { cronSecret: { in: ['', 'shoptet-feed-sync-secret'] } }, data: { cronSecret: randomBytes(32).toString('hex') } });
    console.log('Databázové migrace dokončeny. Při novém nasazení se uživatelé přihlásí znovu.');
  } finally { await prisma.$disconnect(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Operace selhala."); process.exitCode = 1; });
