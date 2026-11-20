import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  generateLabelsPdf,
  detectSafetyTextOverflows,
  findOptimalFontSizes,
  setRobotoFontBytesCache,
} from '../pdfGenerator';
import { loadSafetyTemplates } from '../safetyTemplates';

/**
 * Grid calculation helper for A4 3x7 label layouts (e.g. Avery L7160 63.5 x 38.1 mm).
 */
export function calculateGridPosition(index: number, cols: number = 3) {
  const row = Math.floor(index / cols);
  const col = index % cols;
  return { row, col };
}

/**
 * Calculates start index (0-based) from 1-based user input.
 */
export function getStartIndex(startPosition: number, totalSlots: number = 21): number {
  const clamped = Math.max(1, Math.min(startPosition, totalSlots));
  return clamped - 1;
}

describe('A4 Label Grid & Page Calculations', () => {
  it('correctly maps 1-based start position to grid row and column', () => {
    expect(calculateGridPosition(getStartIndex(1))).toEqual({ row: 0, col: 0 });
    expect(calculateGridPosition(getStartIndex(4))).toEqual({ row: 1, col: 0 });
    expect(calculateGridPosition(getStartIndex(21))).toEqual({ row: 6, col: 2 });
  });

  it('clamps start position outside valid range [1..21]', () => {
    expect(getStartIndex(0)).toBe(0);
    expect(getStartIndex(99)).toBe(20);
  });

  it('calculates page count correctly for single and multi-page print jobs', () => {
    const labelsPerPage = 21;
    const totalSlots1 = getStartIndex(1) + 5;
    expect(Math.ceil(totalSlots1 / labelsPerPage)).toBe(1);

    const totalSlots2 = getStartIndex(5) + 20;
    expect(Math.ceil(totalSlots2 / labelsPerPage)).toBe(2);
  });
});

describe('PDF Generation with Czech Diacritics & Safety Text Overflow Detection', () => {
  beforeAll(() => {
    const regularBytes = fs.readFileSync(
      path.resolve(process.cwd(), 'public/fonts/Roboto-Regular.ttf')
    );
    const boldBytes = fs.readFileSync(
      path.resolve(process.cwd(), 'public/fonts/Roboto-Bold.ttf')
    );
    setRobotoFontBytesCache(regularBytes, boldBytes);
  });

  const standardTemplate = {
    fieldsConfig: JSON.stringify({
      showName: true,
      showSku: true,
      showBrand: true,
      showPrice: true,
      showSafetyText: true,
      showContactText: true,
      showEan: false,
      showSafetyIcon: true,
      showContactIcon: true,
    }),
    fontConfig: JSON.stringify({
      fontFamily: 'Roboto',
      nameFontSize: 9.5,
      skuFontSize: 6.5,
      brandFontSize: 7,
      priceFontSize: 11,
      bodyFontSize: 6,
      textAlignment: 'left',
    }),
    layoutConfig: JSON.stringify({
      labelWidth: 63.5,
      labelHeight: 38.1,
      topMargin: 15.15,
      leftMargin: 7.25,
      horizontalGap: 2.5,
      verticalGap: 0,
      columns: 3,
      rows: 7,
      dualLayout: false,
      labelRotation: 0,
    }),
  };

  it('generates valid PDF with long Czech safety text from Excel and Roboto font', async () => {
    const catalog = loadSafetyTemplates();
    const lashLep = catalog.byCode.get('LASH_LEP')!;

    await expect(generateLabelsPdf(
      [
        {
          id: 'p1',
          sku: 'LASH-001',
          name: 'Profesionální lepidlo na řasy Extreme Hold 5 ml',
          brand: 'Maxymova',
          price: 690,
          safetyText: lashLep.safetyText,
          contactText: 'Evolution Beauty Institut s. r. o.\nIČO: 07996811\n5. května 70, Praha 4',
          ean: '8590001234567',
          quantity: 2,
        },
      ],
      standardTemplate,
      1
    )).rejects.toThrow("nevejde");

    const pdfBytes = await generateLabelsPdf(
      [
        {
          id: 'p1',
          sku: 'LASH-001',
          name: 'Profesionální lepidlo na řasy Extreme Hold 5 ml',
          brand: 'Maxymova',
          price: 690,
          safetyText: lashLep.safetyText,
          contactText: 'Evolution Beauty Institut s. r. o.\nIČO: 07996811\n5. května 70, Praha 4',
          ean: '8590001234567',
          quantity: 2,
        },
      ],
      { ...standardTemplate, layoutConfig: JSON.stringify({ ...JSON.parse(standardTemplate.layoutConfig), labelWidth: 190, labelHeight: 85, columns: 1, rows: 3 }) },
      1
    );

    expect(pdfBytes.byteLength).toBeGreaterThan(5000);
    const header = Buffer.from(pdfBytes.subarray(0, 5)).toString('ascii');
    expect(header).toBe('%PDF-');
  });

  it('accurately detects which SKU overflows the template based on actual dimensions, font size, and PDF line wrapping', async () => {
    const catalog = loadSafetyTemplates();
    const browOxbar = catalog.byCode.get('BROW_OXBAR')!;

    const shortItem = {
      id: 'ok-1',
      sku: 'SKU-OK',
      name: 'Pinzeta',
      brand: 'Maxymova',
      price: 250,
      safetyText: 'Uchovávejte mimo dosah dětí.',
      contactText: 'Evolution Beauty Institut s. r. o.',
    };

    const longItem = {
      id: 'ov-1',
      sku: 'SKU-OVERFLOW',
      name: 'Profesionální oxidační barva na obočí a řasy s velmi dlouhým názvem',
      brand: 'Maxymova',
      price: 390,
      safetyText: browOxbar.safetyText,
      contactText:
        'Evolution Beauty Institut s. r. o.\nIČO: 07996811\n5. května 70, 140 00 Praha 4\nwww.depilujeme.cz',
    };

    // Při zvětšeném písmu (nebo menším štítku) se dlouhý bezpečnostní text a kontakt nevejdou, zatímco krátký ano
    const overflows = await detectSafetyTextOverflows(
      [shortItem, longItem],
      standardTemplate,
      { bodyFontSize: 7.5, nameFontSize: 10.5 }
    );

    expect(overflows.map((o) => o.sku)).toEqual(['SKU-OVERFLOW']);
    expect(overflows[0].overflows).toBe(true);
    expect(overflows[0].totalSafetyLines).toBeGreaterThan(3);
    expect(overflows[0].clippedFields.length).toBeGreaterThan(0);

    // Při zmenšení písma na 4 pt se tentýž produkt do šablony 63,5 × 38,1 mm vejde celý
    const overflowsSmallFont = await detectSafetyTextOverflows(
      [shortItem, longItem],
      standardTemplate,
      { bodyFontSize: 4, nameFontSize: 7, priceFontSize: 8 }
    );
    expect(overflowsSmallFont).toHaveLength(0);
  });

  it('detects product names exceeding 2 lines and resolves them when shortName is set', async () => {
    const longNameItem = {
      id: 'p-long-name',
      sku: 'SKU-LONG-NAME',
      name: 'Extrémně dlouhý profesionální název kosmetického produktu pro hloubkovou regeneraci a hydrataci pleti 500 ml',
      brand: 'MAXYMOVA',
      price: null,
      ean: null,
      safetyText: null,
      contactText: null,
    };

    const overflows = await detectSafetyTextOverflows([longNameItem], standardTemplate, {
      nameFontSize: 10,
    });
    expect(overflows).toHaveLength(1);
    expect(overflows[0].nameExceedsTwoLines).toBe(true);
    expect(overflows[0].nameWrappedLines).toBeGreaterThan(2);

    const withShortName = {
      ...longNameItem,
      shortName: 'Hydratační sérum na pleť 500 ml',
    };
    const overflowsWithShortName = await detectSafetyTextOverflows([withShortName], standardTemplate, {
      nameFontSize: 10,
    });
    expect(overflowsWithShortName).toHaveLength(0);
  });

  it('wraps hyphenated product names after hyphens just like browser preview', async () => {
    const dualTemplate = {
      fieldsConfig: JSON.stringify({
        showName: true,
        showSku: false,
        showBrand: false,
        showPrice: true,
        showSafetyText: true,
        showContactText: true,
        showEan: false,
      }),
      fontConfig: JSON.stringify({
        fontFamily: 'Roboto',
        nameFontSize: 5,
        priceFontSize: 5,
        bodyFontSize: 3.5,
        skuFontSize: 4,
        brandFontSize: 4,
      }),
      layoutConfig: JSON.stringify({
        labelWidth: 63.5,
        labelHeight: 38.1,
        topMargin: 15.15,
        leftMargin: 7.25,
        horizontalGap: 2.5,
        verticalGap: 0,
        columns: 3,
        rows: 7,
        dualLayout: true,
        labelRotation: 90,
      }),
    };

    const item = {
      id: 'ke25007',
      sku: 'KE25007',
      name: 'ELLA BACHÉ REJUVENIUM PRO-REGENERATIVE biocelulózová maska 5 ks',
      brand: 'ELLA BACHÉ',
      price: 1800,
      ean: null,
      safetyText:
        'Zevní použití. Po každém použití dobře uzavřete. Skladujte v chladu a vyhněte se slunečnímu záření.',
      contactText: 'Evolution Beauty Institut s. r. o.\nIČO: 07996811\nwww.ellabache.cz',
    };

    const overflows = await detectSafetyTextOverflows([item], dualTemplate);
    expect(overflows).toHaveLength(0);
  });

  it('findOptimalFontSizes reduces font sizes so overflowing labels fit without clipping', async () => {
    const catalog = loadSafetyTemplates();
    const waxRollTemplate = catalog.byCode.get('DEP_ROLL');
    expect(waxRollTemplate).toBeDefined();

    const item = {
      id: 'p-autofit',
      sku: 'SKU-AUTOFIT',
      name: 'Roll-on vosk Azulene 100 ml',
      brand: 'ITALWAX',
      price: 89,
      ean: null,
      safetyText: waxRollTemplate!.safetyText,
      contactText:
        'Evolution Beauty Institut s. r. o.\nIČO: 07996811\n5. května 70, 140 00 Praha 4',
    };

    const result = await findOptimalFontSizes([item], standardTemplate, {
      nameFontSize: 10,
      bodyFontSize: 7.5,
      priceFontSize: 11,
      skuFontSize: 7,
      brandFontSize: 7,
    });

    expect(result.fitted).toBe(true);
    expect(result.remainingOverflows).toHaveLength(0);
    expect(result.fontSizes.bodyFontSize).toBeLessThan(7.5);
    expect(result.fontSizes.bodyFontSize).toBeGreaterThanOrEqual(3.0);
  });

  it('generateLabelsPdf renders shortName when present and produces valid PDF', async () => {
    const pdfBytes = await generateLabelsPdf(
      [
        {
          id: 'p-shortname',
          sku: 'SKU-SHORTNAME',
          name: 'Velmi dlouhý původní název produktu z Shoptet feedu včetně varianty a objemu',
          shortName: 'Krátký název produktu',
          brand: 'TEST',
          price: 199,
          ean: null,
          safetyText: null,
          contactText: null,
          quantity: 1,
        },
      ],
      standardTemplate,
      1
    );

    const header = new TextDecoder().decode(pdfBytes.slice(0, 8));
    expect(header).toContain('%PDF-');
    expect(pdfBytes.length).toBeGreaterThan(2000);
  });
});
