import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { prisma } from '../db';
import { assertAuthenticated } from '../auth';
import { writeFile } from 'node:fs/promises';
import { previewBulkSafetyAction, applyBulkSafetyAction, createSafetyCategoryAction, suggestProductSafetyTextAction } from '@/app/actions';

const fixture = await vi.hoisted(async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stitkovac-bulk-'));
  return { directory, database: path.join(directory, 'test.db') };
});

vi.mock('../db', async () => {
  const { PrismaClient } = await import('@prisma/client');
  return { prisma: new PrismaClient({ datasourceUrl: `file:${fixture.database}` }) };
});
vi.mock('../auth', () => ({ getAuthenticatedUser: vi.fn(async () => ({ username: 'test', role: 'admin' })), assertAuthenticated: vi.fn(async () => ({ username: 'test', role: 'admin' })) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: vi.fn() })) }));
vi.mock('node:fs/promises', async importOriginal => ({ ...await importOriginal<typeof import('node:fs/promises')>(), mkdir: vi.fn(), writeFile: vi.fn(async () => {}) }));

// This client has an isolated temporary SQLite database; never touches the application DB.
const directory = fixture.directory;
beforeAll(async () => {
  const database = join(directory, 'test.db');
  writeFileSync(database, '');
  const schema = readFileSync('prisma/schema.prisma', 'utf8').replace(/url\s*=\s*[^\n]+/, `url = "file:${database}"`);
  const schemaPath = join(directory, 'schema.prisma');
  writeFileSync(schemaPath, schema);
  execFileSync('node_modules/.bin/prisma', ['db', 'push', '--schema', schemaPath, '--skip-generate'], { stdio: 'ignore' });
});
afterAll(async () => { await prisma.$disconnect(); rmSync(directory, { recursive: true, force: true }); });
beforeEach(async () => {
  vi.mocked(assertAuthenticated).mockResolvedValue({ username: 'test', role: 'admin', name: 'Test' });
  vi.mocked(writeFile).mockReset().mockResolvedValue();
  await prisma.product.deleteMany();
  await prisma.customSafetyCategory.deleteMany();
  await prisma.safetyCatalogState.deleteMany();
  await prisma.safetyCatalogImport.deleteMany();
  await prisma.product.createMany({ data: [{ id: 'known', sku: 'known', name: 'Natáčky na řasy', safetyText: 'Původní' }, { id: 'unknown', sku: 'unknown', name: 'Neznámý výrobek', safetyText: 'Výchozí' }] });
});
describe('bulk safety server actions', () => {
  it('previews without writes, then atomically applies and backs up previous text', async () => {
    const preview = await previewBulkSafetyAction();
    expect(preview.changed).toBe(1);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: 'known' } })).safetyText).toBe('Původní');
    const result = await applyBulkSafetyAction(preview.token);
    expect(result.changed).toBe(1);
    expect(writeFile).toHaveBeenCalledOnce();
    const backup = JSON.parse(vi.mocked(writeFile).mock.calls[0][1] as string);
    expect(backup.changes[0]).toMatchObject({ id: 'known', before: 'Původní' });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: 'unknown' } })).safetyText).toBe('Výchozí');
    expect((await previewBulkSafetyAction()).changed).toBe(0);
  });
  it('rejects stale preview without overwriting concurrent user edits', async () => {
    const preview = await previewBulkSafetyAction();
    await prisma.product.update({ where: { id: 'known' }, data: { safetyText: 'Ruční úprava' } });
    await expect(applyBulkSafetyAction(preview.token)).rejects.toThrow('změnily');
    expect(writeFile).not.toHaveBeenCalled();
    expect((await prisma.product.findUniqueOrThrow({ where: { id: 'known' } })).safetyText).toBe('Ruční úprava');
  });
  it('does not update any text when backup creation fails', async () => {
    const preview = await previewBulkSafetyAction();
    vi.mocked(writeFile).mockRejectedValueOnce(new Error('Disk full'));
    await expect(applyBulkSafetyAction(preview.token)).rejects.toThrow('Disk full');
    expect((await prisma.product.findUniqueOrThrow({ where: { id: 'known' } })).safetyText).toBe('Původní');
  });
  it('rolls back the entire batch if a later database write fails', async () => {
    await prisma.product.create({ data: { id: 'z-failing', sku: 'z-failing', name: 'Natáčky na řasy', safetyText: 'Další původní' } });
    const preview = await previewBulkSafetyAction();
    await prisma.$executeRawUnsafe("CREATE TRIGGER fail_bulk BEFORE UPDATE ON Product WHEN OLD.id = 'z-failing' BEGIN SELECT RAISE(ABORT, 'forced test failure'); END");
    try {
      await expect(applyBulkSafetyAction(preview.token)).rejects.toThrow();
      expect((await prisma.product.findUniqueOrThrow({ where: { id: 'known' } })).safetyText).toBe('Původní');
      expect((await prisma.product.findUniqueOrThrow({ where: { id: 'z-failing' } })).safetyText).toBe('Další původní');
    } finally { await prisma.$executeRawUnsafe('DROP TRIGGER fail_bulk'); }
  });
  it('requires administrator authentication for preview and apply', async () => {
    vi.mocked(assertAuthenticated).mockRejectedValue(new Error('Unauthorized'));
    await expect(previewBulkSafetyAction()).rejects.toThrow('Unauthorized');
    await expect(applyBulkSafetyAction('token')).rejects.toThrow('Unauthorized');
    await expect(createSafetyCategoryAction({ name: 'Test', safetyText: 'Text výrobce.' })).rejects.toThrow('Unauthorized');
    expect(assertAuthenticated).toHaveBeenCalledWith(true);
    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe('custom safety categories', () => {
  it('creates a persistent category available in rules, dropdown, bulk update and saved selection', async () => {
    const created = await createSafetyCategoryAction({ name: 'Kosmetická zrcátka', safetyText: 'Vlastní text podle podkladů výrobce.', keywords: 'zrcátko, zrcadlo, mirror' });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error(created.error);
    expect(await prisma.customSafetyCategory.count()).toBe(1);
    await prisma.product.update({ where: { id: 'unknown' }, data: { name: 'Zola zrcátko s pouzdrem' } });
    const suggested = await suggestProductSafetyTextAction({ name: 'Zola zrcátko s pouzdrem' });
    expect(suggested.ok && suggested.code).toBe(created.code);
    expect(suggested.ok && suggested.categories.some(c => c.code === created.code)).toBe(true);
    const preview = await previewBulkSafetyAction();
    expect(preview.sample.some(p => p.code === created.code)).toBe(true);
    const { storeSafetySelection } = await import('../safetySelection');
    await prisma.$transaction(async tx => {
      const product = await tx.product.update({ where: { id: 'unknown' }, data: { safetyText: created.safetyText } });
      await storeSafetySelection(tx, product, created.code);
    });
    const saved = await suggestProductSafetyTextAction({ productId: 'unknown', name: 'Zola zrcátko s pouzdrem', description: '', currentSafetyText: created.safetyText });
    expect(saved.ok && saved.source).toBe('saved');
    expect(saved.ok && saved.code).toBe(created.code);
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ message: { content: JSON.stringify({ code: created.code }) } }), { status: 200 }));
    try {
      const aiResult = await suggestProductSafetyTextAction({ name: 'Zola zrcátko s pouzdrem', mode: 'ai' });
      expect(aiResult.ok && aiResult.code).toBe(created.code);
      expect(aiResult.ok && aiResult.safetyText).toBe(created.safetyText);
    } finally { fetch.mockRestore(); }

  });
  it('rejects duplicate normalized names and invalid input', async () => {
    await createSafetyCategoryAction({ name: 'Zrcátka', safetyText: 'Text dodaný výrobcem.' });
    const duplicate = await createSafetyCategoryAction({ name: 'ZRCATKA', safetyText: 'Jiný text výrobce.' });
    expect(duplicate.ok).toBe(false);
    expect((await createSafetyCategoryAction({ name: '', safetyText: '' })).ok).toBe(false);
    expect(await prisma.customSafetyCategory.count()).toBe(1);
  });
  it('does not change the product merely by creating a category', async () => {
    const category = await createSafetyCategoryAction({ name: 'Zrcátka', safetyText: 'Text dodaný výrobcem.' });
    expect(category.ok).toBe(true);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: 'unknown' } })).safetyText).toBe('Výchozí');
    const suggested = await suggestProductSafetyTextAction({ name: 'Zola zrcátko s pouzdrem' });
    expect(suggested.ok && suggested.code).toBe('NEURCENO');
  });
});

describe('category workbook API', () => {
  async function request(mode: string, bytes: Uint8Array, token?: string) {
    const { POST } = await import('@/app/api/safety-categories/route');
    const form = new FormData();
    form.set('file', new File([new Uint8Array(bytes)], 'categories.xlsx'));
    form.set('mode', mode);
    if (token) form.set('token', token);
    return POST(new Request('http://localhost/api/safety-categories', { method: 'POST', body: form }));
  }
  it('exports custom categories, previews without writes, imports atomically and preserves product texts', async () => {
    const created = await createSafetyCategoryAction({ name: 'Zrcátka', safetyText: 'Původní vlastní text zrcátek.', keywords: 'zrcátko' });
    if (!created.ok) throw new Error(created.error);
    const { GET } = await import('@/app/api/safety-categories/route');
    const response = await GET(); expect(response.status).toBe(200);
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets['Šablony']);
    const row = rows.findIndex(r => r['Kód pro AI'] === created.code) + 2;
    expect(row).toBeGreaterThan(1);
    workbook.Sheets['Šablony'][`D${row}`].v = 'Nový text zrcátek podle výrobce.';
    const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const previewResponse = await request('preview', bytes);
    expect(previewResponse.status).toBe(200);
    const preview = await previewResponse.json(); expect(preview.updated).toBe(1);
    expect(await prisma.safetyCatalogState.count()).toBe(0);
    expect((await request('apply', bytes, preview.token)).status).toBe(200);
    expect(await prisma.safetyCatalogImport.count()).toBe(1);
    const { loadApplicationSafetyCatalog } = await import('../customSafetyCatalog');
    expect((await loadApplicationSafetyCatalog()).byCode.get(created.code)?.safetyText).toBe('Nový text zrcátek podle výrobce.');
    expect((await prisma.product.findUniqueOrThrow({ where: { id: 'unknown' } })).safetyText).toBe('Výchozí');
    expect((await GET()).status).toBe(200);
  });
  it('rejects stale imports and unauthorized export/import without writing', async () => {
    const { GET } = await import('@/app/api/safety-categories/route');
    const bytes = new Uint8Array(await (await GET()).arrayBuffer());
    const preview = await (await request('preview', bytes)).json();
    await createSafetyCategoryAction({ name: 'Nová kategorie', safetyText: 'Text podle výrobce.' });
    expect((await request('apply', bytes, preview.token)).status).toBe(400);
    expect(await prisma.safetyCatalogState.count()).toBe(0);
    expect(await prisma.safetyCatalogImport.count()).toBe(0);
    vi.mocked(assertAuthenticated).mockRejectedValue(new Error('Unauthorized'));
    expect((await GET()).status).toBe(403);
    expect((await request('apply', bytes, preview.token)).status).toBe(403);
  });
});
