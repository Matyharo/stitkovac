import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { execSync } from 'child_process';
import { prisma } from '../db';
import * as ShoptetFeedParser from '../importers/ShoptetFeedParser';
import {
  syncProductsFromFeed,
  approvePendingProduct,
  approveAllPendingProducts,
} from '../feedSync';
import { analyzeImportedProducts, saveImportedProducts } from '@/app/actions';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: () => ({ value: 'authenticated_true' }),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

const TEST_SKU_PREFIX = 'VITEST-SAFETY-SYNC-';

async function cleanupTestRecords() {
  await prisma.pendingProductApproval.deleteMany({
    where: { sku: { startsWith: TEST_SKU_PREFIX } },
  });
  await prisma.product.deleteMany({
    where: { sku: { startsWith: TEST_SKU_PREFIX } },
  });
  await prisma.syncLog.deleteMany({
    where: { totalFetched: 2 },
  });
}

describe('Product Description & Safety Text Concurrency in Feed Sync and Import', () => {
  beforeAll(async () => {
    try {
      await prisma.product.count();
    } catch {
      execSync('npx prisma db push --skip-generate', { stdio: 'ignore' });
    }
  });

  beforeEach(async () => {
    await cleanupTestRecords();
  });

  afterAll(async () => {
    await cleanupTestRecords();
    vi.restoreAllMocks();
  });

  it('saves description from feed even when description is the ONLY change, and preserves description when missing in feed', async () => {
    const sku1 = `${TEST_SKU_PREFIX}DESC-ONLY`;
    const sku2 = `${TEST_SKU_PREFIX}DESC-KEEP`;

    // Vytvoříme výchozí produkty v DB
    await prisma.product.createMany({
      data: [
        {
          sku: sku1,
          name: 'Hydratační sérum 50 ml',
          description: null,
          brand: 'Ella Baché',
          price: 890,
          ean: '8590001112223',
          safetyText: 'Stávající bezpečnostní text 1',
        },
        {
          sku: sku2,
          name: 'Čisticí pěna 150 ml',
          description: 'Původní popis v databázi',
          brand: 'Ella Baché',
          price: 490,
          ean: '8590001112224',
          safetyText: 'Stávající bezpečnostní text 2',
        },
      ],
    });

    // Nasimulujeme odpověď parseru feedu (u sku1 se změnil pouze popis, u sku2 popis ve feedu chybí)
    const spy = vi.spyOn(ShoptetFeedParser, 'fetchAndParseShoptetFeed').mockResolvedValue({
      success: true,
      format: 'xml',
      products: [
        {
          sku: sku1,
          name: 'Hydratační sérum 50 ml',
          brand: 'Ella Baché',
          price: 890,
          ean: '8590001112223',
          description: 'Nový popis produktu ze Shoptet feedu pro salonní ošetření.',
          rawDescription: 'Nový popis produktu ze Shoptet feedu pro salonní ošetření.',
        },
        {
          sku: sku2,
          name: 'Čisticí pěna 150 ml',
          brand: 'Ella Baché',
          price: 495, // drobná bezpečná změna ceny bez popisu
          ean: '8590001112224',
        },
      ],
    });

    const syncRes = await syncProductsFromFeed('https://example.com/feed.xml');
    expect(syncRes.success).toBe(true);

    const updated1 = await prisma.product.findUnique({ where: { sku: sku1 } });
    expect(updated1?.description).toBe(
      'Nový popis produktu ze Shoptet feedu pro salonní ošetření.'
    );
    expect(updated1?.safetyText).toBe('Stávající bezpečnostní text 1');

    const updated2 = await prisma.product.findUnique({ where: { sku: sku2 } });
    expect(updated2?.description).toBe('Původní popis v databázi');
    expect(updated2?.safetyText).toBe('Stávající bezpečnostní text 2');

    spy.mockRestore();
  });

  it('passes description through PendingProductApproval and does NOT overwrite newer manual safetyText when approved later', async () => {
    const skuSingle = `${TEST_SKU_PREFIX}APPROVE-SINGLE`;
    const skuBulk = `${TEST_SKU_PREFIX}APPROVE-BULK`;

    // 1. Produkty v DB se starším bezpečnostním textem
    await prisma.product.createMany({
      data: [
        {
          sku: skuSingle,
          name: 'Maxymova Mini Wax Heater',
          description: 'Starý popis',
          brand: 'Maxymova',
          price: 500,
          ean: '8590009998881',
          safetyText: 'Starý obecný bezpečnostní text',
        },
        {
          sku: skuBulk,
          name: 'Wax Equipment Cleaner',
          description: 'Starý popis čističe',
          brand: 'Italwax',
          price: 200,
          ean: '8590009998882',
          safetyText: 'Starý bezpečnostní text čističe',
        },
      ],
    });

    // 2. Synchronizace feedu detekuje cenový skok (>30 %) a zařadí položky do PendingProductApproval
    const spy = vi.spyOn(ShoptetFeedParser, 'fetchAndParseShoptetFeed').mockResolvedValue({
      success: true,
      format: 'xml',
      products: [
        {
          sku: skuSingle,
          name: 'Maxymova Mini Wax Heater',
          brand: 'Maxymova',
          price: 950, // skok +90 % -> jde do schvalování
          ean: '8590009998881',
          description: 'Elektrický přístroj na rozehřátí depilačního vosku.',
          rawDescription: 'Elektrický přístroj na rozehřátí depilačního vosku.',
        },
        {
          sku: skuBulk,
          name: 'Wax Equipment Cleaner',
          brand: 'Italwax',
          price: 400, // skok +100 % -> jde do schvalování
          ean: '8590009998882',
          description: 'Přípravek na čištění vybavení od vosku.',
          rawDescription: 'Přípravek na čištění vybavení od vosku.',
        },
      ],
    });

    await syncProductsFromFeed('https://example.com/feed.xml');
    spy.mockRestore();

    const pendingSingle = await prisma.pendingProductApproval.findUnique({
      where: { sku: skuSingle },
    });
    const pendingBulk = await prisma.pendingProductApproval.findUnique({
      where: { sku: skuBulk },
    });
    expect(pendingSingle).not.toBeNull();
    expect(pendingSingle?.description).toBe(
      'Elektrický přístroj na rozehřátí depilačního vosku.'
    );
    expect(pendingBulk).not.toBeNull();

    // Nasimulujeme i případ, kdy by v PendingProductApproval byla uložena stará kopie safetyText
    await prisma.pendingProductApproval.update({
      where: { id: pendingSingle!.id },
      data: { safetyText: 'Starý obecný bezpečnostní text' },
    });

    // 3. Mezitím uživatel v katalogu ručně upraví a uloží nový bezpečnostní text (např. z AI návrhu)
    const manualSafetySingle =
      'Před použitím si přečtěte návod k obsluze. Elektrické zařízení připojujte pouze k odpovídajícímu zdroji napájení.';
    const manualSafetyBulk =
      'Pouze pro profesionální použití. Používejte výhradně k čištění zařízení a povrchů od vosku, neaplikujte na pokožku.';

    await prisma.product.update({
      where: { sku: skuSingle },
      data: { safetyText: manualSafetySingle },
    });
    await prisma.product.update({
      where: { sku: skuBulk },
      data: { safetyText: manualSafetyBulk },
    });

    // 4. Pozdější individuální i hromadné schválení položky z fronty
    const resSingle = await approvePendingProduct(pendingSingle!.id);
    expect(resSingle.success).toBe(true);

    const resBulk = await approveAllPendingProducts([pendingBulk!.id]);
    expect(resBulk.success).toBe(true);

    // 5. Ověříme, že se propsala nová cena i nový popis z feedu, ale novější ruční safetyText ZŮSTAL ZACHOVÁN!
    const afterSingle = await prisma.product.findUnique({ where: { sku: skuSingle } });
    expect(afterSingle?.price).toBe(950);
    expect(afterSingle?.description).toBe(
      'Elektrický přístroj na rozehřátí depilačního vosku.'
    );
    expect(afterSingle?.safetyText).toBe(manualSafetySingle);

    const afterBulk = await prisma.product.findUnique({ where: { sku: skuBulk } });
    expect(afterBulk?.price).toBe(400);
    expect(afterBulk?.description).toBe('Přípravek na čištění vybavení od vosku.');
    expect(afterBulk?.safetyText).toBe(manualSafetyBulk);
  });

  it('handles description mapping, change preview, and existing text preservation in manual CSV/XLSX import', async () => {
    const skuImport = `${TEST_SKU_PREFIX}MANUAL-IMP`;

    await prisma.product.create({
      data: {
        sku: skuImport,
        name: 'Brow Wax',
        description: 'Původní popis stylingového vosku',
        brand: 'Maxymova',
        price: 390,
        safetyText: 'Dříve uložený bezpečnostní text na obočí',
      },
    });

    // 1. Analýza změny popisu
    const analysis = await analyzeImportedProducts([
      {
        sku: skuImport,
        name: 'Brow Wax',
        description: 'Aktualizovaný popis stylingového vosku pro fixaci chloupků',
        brand: 'Maxymova',
        price: 390,
      },
    ]);
    expect(analysis.success).toBe(true);
    expect(analysis.updatedProducts).toHaveLength(1);
    expect(analysis.updatedProducts?.[0].changes).toEqual(
      expect.arrayContaining([
        {
          field: 'Popis',
          from: 'Původní popis stylingového vosku',
          to: 'Aktualizovaný popis stylingového vosku pro fixaci chloupků',
        },
      ])
    );

    // 2. Uložení změny popisu při zachování existujícího safetyText (když safetyText v importu chybí)
    const saveRes1 = await saveImportedProducts(
      [
        {
          sku: skuImport,
          name: 'Brow Wax',
          description: 'Aktualizovaný popis stylingového vosku pro fixaci chloupků',
          brand: 'Maxymova',
          price: 390,
        },
      ],
      {
        name: true,
        description: true,
        brand: true,
        price: true,
        safetyText: true,
        contactText: true,
        ean: true,
        note: true,
      }
    );
    expect(saveRes1.success).toBe(true);

    const afterSave1 = await prisma.product.findUnique({ where: { sku: skuImport } });
    expect(afterSave1?.description).toBe(
      'Aktualizovaný popis stylingového vosku pro fixaci chloupků'
    );
    expect(afterSave1?.safetyText).toBe('Dříve uložený bezpečnostní text na obočí');

    // 3. Pokud v dalším importu sloupec nebo hodnota popisu chybí, zachová se existující popis
    await saveImportedProducts([
      {
        sku: skuImport,
        name: 'Brow Wax',
        description: '',
        brand: 'Maxymova',
        price: 410,
      },
    ]);

    const afterSave2 = await prisma.product.findUnique({ where: { sku: skuImport } });
    expect(afterSave2?.price).toBe(410);
    expect(afterSave2?.description).toBe(
      'Aktualizovaný popis stylingového vosku pro fixaci chloupků'
    );
  });
});

