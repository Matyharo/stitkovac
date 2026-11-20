import { NextResponse } from 'next/server';
import { assertAuthenticated } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { validateCustomCategory, loadApplicationSafetyCatalog } from '@/lib/customSafetyCatalog';
import { exportSafetyWorkbook, planSafetyWorkbookImport, serializeSafetyCatalog } from '@/lib/safetyWorkbook';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request?: Request) {
  try { await assertAuthenticated(true); } catch { return NextResponse.json({ error: 'Export vyžaduje přihlášení správce.' }, { status: 403 }); }
  try {
    const params = request ? new URL(request.url).searchParams : new URLSearchParams();
    if (params.get('format') === 'json') return NextResponse.json({ templates: (await loadApplicationSafetyCatalog()).templates }, { headers: { 'Cache-Control': 'no-store' } });
    if (params.get('history') === '1') return NextResponse.json(await prisma.safetyCatalogImport.findMany({ select: { id: true, createdAt: true, createdBy: true }, orderBy: { createdAt: 'desc' }, take: 20 }), { headers: { 'Cache-Control': 'no-store' } });
    let catalog = await loadApplicationSafetyCatalog();
    if (params.has('version')) {
      const version = await prisma.safetyCatalogImport.findUnique({ where: { id: params.get('version')! } });
      if (!version) return NextResponse.json({ error: 'Verze nebyla nalezena.' }, { status: 404 });
      const saved = JSON.parse(version.previous) as typeof catalog;
      catalog = { ...saved, byCode: new Map(saved.templates.map(t => [t.code, t])) };
    }
    const bytes = exportSafetyWorkbook(catalog);
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
    const expired = await prisma.safetyCatalogImport.findMany({ orderBy: { createdAt: 'desc' }, skip: 20, select: { id: true } });
    if (expired.length) await prisma.safetyCatalogImport.deleteMany({ where: { id: { in: expired.map(v => v.id) } } });
    return NextResponse.json({ ...result, message: 'Kategorie byly importovány. Produkty a jejich texty zůstaly beze změny.' });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Import se nezdařil.' }, { status: 400 }); }
}

export async function PATCH(request: Request) {
  let user;
  try { user = await assertAuthenticated(true); } catch { return NextResponse.json({ error: 'Úpravy vyžadují správce.' }, { status: 403 }); }
  try {
    if (!(request.headers.get('content-type') || '').includes('application/json')) throw new Error('Neplatný požadavek.');
    const raw = await request.text();
    if (raw.length > 12000) throw new Error('Požadavek je příliš velký.');
    const input = JSON.parse(raw);
    const validated = validateCustomCategory({ name: input.name, area: input.area, safetyText: input.safetyText });
    if (!['Návrh ke schválení', 'Ověřit konkrétní výrobek', 'Ruční posouzení', 'Přeskočit'].includes(input.mode)) throw new Error('Neplatný režim.');
    await prisma.$transaction(async tx => {
      const current = await loadApplicationSafetyCatalog(tx);
      const old = current.byCode.get(input.code);
      if (!old || input.code === 'NEURCENO') throw new Error('Tuto kategorii nelze změnit.');
      if (JSON.stringify(old) !== input.version) throw new Error('Kategorie byla mezitím změněna. Načtěte seznam znovu.');
      const next = { ...old, productType: validated.name, area: validated.area, safetyText: validated.safetyText, mode: input.mode };
      const catalog = { ...current, templates: current.templates.map(entry => entry.code === old.code ? next : entry) };
      await tx.safetyCatalogImport.create({ data: { previous: serializeSafetyCatalog(current), createdBy: user.username } });
      const content = serializeSafetyCatalog(catalog);
      await tx.safetyCatalogState.upsert({ where: { id: 'main' }, create: { id: 'main', content }, update: { content } });
    });
    return NextResponse.json({ success: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Úprava se nezdařila.' }, { status: 400 }); }
}
