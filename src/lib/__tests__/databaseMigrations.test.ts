import { describe, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

describe('versioned database migrations', () => {
  it.each(['fresh', 'existing', 'legacy'])('migrates %s databases without losing products', async mode => {
    const directory = mkdtempSync(join(tmpdir(), 'stitkovac-migrations-'));
    const filename = join(directory, 'migration.db');
    writeFileSync(filename, '');
    const url = `file:${filename}`;
    const database = new PrismaClient({ datasourceUrl: url });
    const environment: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: url, NODE_ENV: 'production', BACKUP_DIRECTORY: join(directory, 'backups') };
    const deploy = () => execFileSync(process.execPath, ['--import', 'tsx', 'scripts/deployDatabase.ts'], { env: environment, stdio: 'pipe' });
    try {
      if (mode !== 'fresh') {
        const baseline = readFileSync('prisma/migrations/20261119000000_baseline/migration.sql', 'utf8');
        for (const statement of baseline.split(';').filter(sql => sql.trim())) await database.$executeRawUnsafe(statement);
        await database.product.create({ data: { sku: 'migration-fixture', name: 'Výrobek před migrací', safetyText: 'Původní text.' } });
        if (mode === 'legacy') {
          for (const table of ['CustomSafetyCategory', 'SafetyCatalogState', 'SafetyCatalogImport', 'ProductSafetySelection']) await database.$executeRawUnsafe(`DROP TABLE "${table}"`);
          await database.$executeRawUnsafe('ALTER TABLE Product DROP COLUMN shortName');
        }
        await database.$disconnect();

      }
      deploy();
      expect(await database.$queryRawUnsafe('PRAGMA integrity_check')).toEqual([{ integrity_check: 'ok' }]);
      expect(await database.userSession.count()).toBe(0);
      const columns = await database.$queryRawUnsafe<{ name: string }[]>('PRAGMA table_info(PrintJob)');
      expect(columns.some(column => column.name === 'snapshot')).toBe(true);
      if (mode !== 'fresh') expect(await database.product.findUnique({ where: { sku: 'migration-fixture' } })).toMatchObject({ name: 'Výrobek před migrací', safetyText: 'Původní text.' });
      // Repeating deploy must not replay schema changes or destroy data.
      deploy();
      expect(await database.product.count()).toBe(mode !== 'fresh' ? 1 : 0);
      const previewFilename = join(directory, 'preview.db');
      execFileSync(process.execPath, ['--import', 'tsx', 'scripts/createPreviewDatabase.ts', filename, previewFilename], { env: environment, stdio: 'pipe' });
      const preview = new PrismaClient({ datasourceUrl: `file:${previewFilename}` });
      try {
        expect(await preview.product.count()).toBe(mode !== 'fresh' ? 1 : 0);
        await preview.product.create({ data: { sku: 'preview-only', name: 'Jen v testovaci kopii' } });
        expect(await database.product.findUnique({ where: { sku: 'preview-only' } })).toBeNull();
        expect(() => execFileSync(process.execPath, ['--import', 'tsx', 'scripts/createPreviewDatabase.ts', filename, previewFilename], { env: environment, stdio: 'pipe' })).toThrow();
      } finally { await preview.$disconnect(); }
    } finally { await database.$disconnect(); rmSync(directory, { recursive: true, force: true }); }
  }, 30000);
});

it('stops an incompatible legacy schema before applying additive changes and keeps a backup', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'stitkovac-incompatible-'));
  const filename = join(directory, 'legacy.db'); writeFileSync(filename, '');
  const database = new PrismaClient({ datasourceUrl: `file:${filename}` });
  try {
    const baseline = readFileSync('prisma/migrations/20261119000000_baseline/migration.sql', 'utf8');
    for (const statement of baseline.split(';').filter(sql => sql.trim())) await database.$executeRawUnsafe(statement);
    await database.product.create({ data: { sku: 'keep-me', name: 'Zachovat i při chybě' } });
    await database.$executeRawUnsafe('DROP TABLE CustomSafetyCategory');
    await database.$executeRawUnsafe('ALTER TABLE User RENAME COLUMN username TO incompatibleUsername');
    await database.$disconnect();
    const environment: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'production', DATABASE_URL: `file:${filename}`, BACKUP_DIRECTORY: join(directory, 'backups') };
    expect(() => execFileSync(process.execPath, ['--import', 'tsx', 'scripts/deployDatabase.ts'], { env: environment, stdio: 'pipe' })).toThrow();
    expect(await database.product.count()).toBe(1);
    const tables = await database.$queryRawUnsafe<{ name: string }[]>("SELECT name FROM sqlite_master WHERE type='table'");
    expect(tables.some(table => table.name === 'CustomSafetyCategory')).toBe(false);
    expect(tables.some(table => table.name === '_prisma_migrations')).toBe(false);
    const { readdirSync } = await import('node:fs');
    expect(readdirSync(join(directory, 'backups')).some(name => name.endsWith('.db'))).toBe(true);
  } finally { await database.$disconnect(); rmSync(directory, { recursive: true, force: true }); }
}, 15000);
