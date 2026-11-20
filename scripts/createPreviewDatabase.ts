import { PrismaClient } from '@prisma/client';
import { resolve, dirname } from 'node:path';
import { stat, mkdir, access, chmod } from 'node:fs/promises';

async function main() {
  const [sourceArgument, targetArgument] = process.argv.slice(2);
  if (!sourceArgument || !targetArgument) throw new Error('Zadejte zdrojovou a cilovou cestu databaze.');
  const source = resolve(sourceArgument), target = resolve(targetArgument);
  if (source === target || !(await stat(source)).isFile() || !(await stat(source)).size) throw new Error('Zdrojova databaze neexistuje nebo je prazdna.');
  try { await access(target); throw new Error('Cilova databaze uz existuje. Nebude prepsana.'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  await mkdir(dirname(target), { recursive: true });
  const database = new PrismaClient({ datasourceUrl: `file:${source.replaceAll('\\', '/')}` });
  try {
    const check = await database.$queryRawUnsafe<{ integrity_check: string }[]>('PRAGMA integrity_check');
    if (check.some(row => row.integrity_check !== 'ok')) throw new Error('Zdrojova databaze neprosla kontrolou integrity.');
    await database.$executeRawUnsafe('VACUUM INTO ?', target);
    await chmod(target, 0o600);
    const count = await database.product.count();
    console.log(`Testovaci databaze vytvorena. Pocet produktu ve zdroji: ${count}. Zdrojova data zustala zachovana.`);
  } finally { await database.$disconnect(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Operace selhala."); process.exitCode = 1; });
