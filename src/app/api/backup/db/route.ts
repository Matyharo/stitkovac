import { NextResponse } from 'next/server';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabaseSnapshot } from '@/lib/backup';
import { assertAuthenticated } from '@/lib/auth';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { await assertAuthenticated(true); } catch { return NextResponse.json({ error: 'Záloha je dostupná pouze správci.' }, { status: 403 }); }
  const directory = await mkdtemp(join(tmpdir(), 'stitkovac-backup-'));
  try {
    const filename = join(directory, 'snapshot.db');
    // SQLite builds a consistent snapshot of the database actually opened by Prisma, including WAL.
    await createDatabaseSnapshot(filename);
    return new NextResponse(new Uint8Array(await readFile(filename)), { headers: {
      'Content-Type': 'application/x-sqlite3', 'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="stitkovac_backup_${new Date().toISOString().slice(0, 10)}.db"`,
    } });
  } catch { return NextResponse.json({ error: 'Zálohu se nepodařilo bezpečně vytvořit.' }, { status: 500 }); }
  finally { await rm(directory, { recursive: true, force: true }); }
}
