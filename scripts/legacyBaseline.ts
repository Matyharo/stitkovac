import type { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Additive bridge for releases deployed with db push before migration history existed. */
export async function prepareLegacyBaseline(database: PrismaClient) {
  const sql = await readFile(resolve('prisma/migrations/20261119000000_baseline/migration.sql'), 'utf8');
  const statements = sql.split(';').map(part => part.replace(/^\s*--[^\n]*\n/gm, '').trim()).filter(Boolean);
  await database.$transaction(async tx => {
    const tables = new Set((await tx.$queryRawUnsafe<{ name: string }[]>("SELECT name FROM sqlite_master WHERE type = 'table'")).map(table => table.name));
    const changes: string[] = [];
    for (const statement of statements) {
      const table = statement.match(/^CREATE TABLE "([A-Za-z0-9_]+)"/);
      if (!table) continue;
      const name = table[1];
      if (!tables.has(name)) { changes.push(statement); continue; }
      const columns = await tx.$queryRawUnsafe<{ name: string; type: string; notnull: number; pk: number }[]>(`PRAGMA table_info("${name}")`);
      for (const line of statement.split('\n')) {
        const definition = line.trim().replace(/,$/, '').match(/^"([A-Za-z0-9_]+)"\s+(.+)$/);
        if (!definition) continue;
        const [, column, attributes] = definition;
        const existing = columns.find(entry => entry.name === column);
        if (existing) {
          const expectedType = attributes.split(/\s+/)[0].toUpperCase();
          if (existing.type.toUpperCase() !== expectedType || (/PRIMARY KEY/.test(attributes) && !existing.pk) || (/NOT NULL/.test(attributes) && !existing.notnull)) throw new Error(`Nekompatibilní sloupec ${name}.${column}. Automatický převod byl zastaven.`);
        } else {
          if (/PRIMARY KEY|UNIQUE/.test(attributes) || (/NOT NULL/.test(attributes) && !/DEFAULT/.test(attributes))) throw new Error(`Chybí povinný sloupec ${name}.${column}. Je potřeba individuální převod.`);
          changes.push(`ALTER TABLE "${name}" ADD COLUMN "${column}" ${attributes}`);
        }
      }
    }
    for (const statement of statements) {
      const index = statement.match(/^CREATE (UNIQUE )?INDEX "([A-Za-z0-9_]+)" ON "([A-Za-z0-9_]+)"\((.+)\)$/);
      if (!index) continue;
      const [, unique, name, table, columnSql] = index;
      const indexes = await tx.$queryRawUnsafe<{ name: string; unique: number }[]>(`PRAGMA index_list("${table}")`);
      const existing = indexes.find(entry => entry.name === name);
      if (!existing) changes.push(statement);
      else {
        const columns = await tx.$queryRawUnsafe<{ name: string }[]>(`PRAGMA index_info("${name}")`);
        const expected = [...columnSql.matchAll(/"([A-Za-z0-9_]+)"/g)].map(match => match[1]);
        if (Boolean(existing.unique) !== Boolean(unique) || JSON.stringify(columns.map(column => column.name)) !== JSON.stringify(expected)) throw new Error(`Nekompatibilní index ${name}. Převod byl zastaven.`);
      }
    }
    for (const statement of changes) await tx.$executeRawUnsafe(statement);
    if (changes.length) console.log(`Starší schéma doplněno bez mazání dat (${changes.length} změn).`);
  }, { timeout: 60000 });
}
