import { NextResponse } from 'next/server';
import { assertAuthenticated } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { loadApplicationSafetyCatalog } from '@/lib/customSafetyCatalog';
import { exportSafetyWorkbook, planSafetyWorkbookImport, serializeSafetyCatalog } from '@/lib/safetyWorkbook';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try { await assertAuthenticated(true); } catch { return NextResponse.json({ error: 'Export vyžaduje přihlášení správce.' }, { status: 403 }); }
  try {
    const bytes = exportSafetyWorkbook(await loadApplicationSafetyCatalog());
    return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="stitkovac_kategorie_${new Date().toISOString().slice(0, 10)}.xlsx"`, 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Export kategorií se nezdařil.' }, { status: 500 }); }
}
export async function POST(request: Request) {
  let user;
  try { user = await assertAuthenticated(true); } catch { return NextResponse.json({ error: 'Import vyžaduje přihlášení správce.' }, { status: 403 }); }
  try {
    if (Number(request.headers.get('content-length') || 0) > 3 * 1024 * 1024) throw new Error('Soubor je příliš velký.');
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.xlsx') || file.size > 2 * 1024 * 1024) throw new Error('Vyberte soubor .xlsx do velikosti 2 MB.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (form.get('mode') !== 'apply') {
      const { catalog: _catalog, ...preview } = planSafetyWorkbookImport(bytes, await loadApplicationSafetyCatalog());
      return NextResponse.json(preview, { headers: { 'Cache-Control': 'no-store' } });
    }
    const result = await prisma.$transaction(async tx => {
      const current = await loadApplicationSafetyCatalog(tx);
      const plan = planSafetyWorkbookImport(bytes, current);
      if (form.get('token') !== plan.token) throw new Error('Kategorie nebo soubor se od náhledu změnily. Načtěte nový náhled.');
      const backup = await tx.safetyCatalogImport.create({ data: { previous: serializeSafetyCatalog(current), createdBy: user.username } });
      const content = serializeSafetyCatalog(plan.catalog);
      await tx.safetyCatalogState.upsert({ where: { id: 'main' }, create: { id: 'main', content }, update: { content } });
      return { added: plan.added, updated: plan.updated, backup: backup.id };
    }, { timeout: 30000 });
    return NextResponse.json({ ...result, message: 'Kategorie byly importovány. Produkty a jejich texty zůstaly beze změny.' });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Import se nezdařil.' }, { status: 400 }); }
}
