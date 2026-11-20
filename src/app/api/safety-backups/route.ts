import { NextResponse } from 'next/server';
import { assertAuthenticated } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createDatabaseSnapshot } from '@/lib/backup';
import { logActivity } from '@/lib/activity';
const directory = () => join(process.cwd(), 'prisma', 'safety-backups');
const filenamePattern = /^safety-\d+-[a-f0-9-]+\.json$/;
export async function GET() {
  try { await assertAuthenticated(true); } catch { return NextResponse.json({ error: 'Přístup vyžaduje správce.' }, { status: 403 }); }
  try {
    const files = (await readdir(directory())).filter(name => filenamePattern.test(name)).sort().reverse().slice(0, 100);
    return NextResponse.json(files, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return NextResponse.json([]); return NextResponse.json({ error: 'Zálohy nelze načíst.' }, { status: 500 }); }
}
export async function POST(request: Request) {
  try { await assertAuthenticated(true); } catch { return NextResponse.json({ error: 'Přístup vyžaduje správce.' }, { status: 403 }); }
  try {
    const raw = await request.text(); if (raw.length > 1000) throw new Error('Neplatný požadavek.');
    const input = JSON.parse(raw);
    if (typeof input.filename !== 'string' || !filenamePattern.test(input.filename)) throw new Error('Neplatná záloha.');
    const path = join(directory(), input.filename);
    if ((await stat(path)).size > 60 * 1024 * 1024) throw new Error('Záloha je příliš velká.');
    const bytes = await readFile(path, 'utf8');
    const backup = JSON.parse(bytes) as { changes: { id: string; before: string | null; after: string }[] };
    if (!Array.isArray(backup.changes) || backup.changes.length > 10000 || backup.changes.some(c => typeof c.id !== 'string' || (c.before !== null && typeof c.before !== 'string') || typeof c.after !== 'string')) throw new Error('Poškozená záloha.');
    async function plan(db: Pick<typeof prisma, 'product'>) {
      const products = await db.product.findMany({ where: { id: { in: backup.changes.map(c => c.id) } }, select: { id: true, safetyText: true, updatedAt: true } });
      const byId = new Map(products.map(p => [p.id, p]));
      const changes = backup.changes.filter(c => byId.get(c.id)?.safetyText === c.after);
      const token = createHash('sha256').update(bytes).update(JSON.stringify(products)).digest('hex');
      return { changes, token, skipped: backup.changes.length - changes.length };
    }
    if (input.mode !== 'apply') { const result = await plan(prisma); return NextResponse.json({ token: result.token, count: result.changes.length, skipped: result.skipped }); }
    // Keep a full recovery point including category selections before modifying anything.
    await createDatabaseSnapshot(join(process.cwd(), 'prisma', 'database-backups', `before-safety-restore-${Date.now()}.db`));
    const result = await prisma.$transaction(async tx => {
      const current = await plan(tx as unknown as Pick<typeof prisma, 'product'>);
      if (current.token !== input.token) throw new Error('Produkty se mezitím změnily. Zobrazte nový náhled.');
      for (const change of current.changes) {
        const updated = await tx.product.updateMany({ where: { id: change.id, safetyText: change.after }, data: { safetyText: change.before } });
        if (updated.count !== 1) throw new Error('Současná změna produktu. Obnova byla zrušena.');
        await tx.productSafetySelection.deleteMany({ where: { productId: change.id } });
      }
      return { count: current.changes.length, skipped: current.skipped };
    }, { timeout: 60000 });
    await logActivity('BULK_SAFETY_RESTORE', `Obnoveno ${result.count} textů ze zálohy ${input.filename}; přeskočeno ${result.skipped}.`);
    return NextResponse.json(result);
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Obnova se nezdařila.' }, { status: 400 }); }
}
