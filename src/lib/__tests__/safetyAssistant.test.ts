import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';
import {
  loadSafetyTemplates,
  parseAndValidateSafetyWorkbook,
  getSafetyTemplateByCode,
  SAFETY_EXCEL_RELATIVE_PATH,
  REQUIRED_TEMPLATE_COLUMNS,
} from '../safetyTemplates';
import {
  stripHtmlToPlainText,
  buildClassifierSystemPrompt,
  classifyProductSafety,
} from '../safetyClassifier';

describe('Safety Templates Excel Loader & Validator', () => {
  it('loads the real Excel workbook and validates all templates and usage rules', () => {
    const catalog = loadSafetyTemplates();
    expect(catalog.sourcePath).toBe(SAFETY_EXCEL_RELATIVE_PATH);
    expect(catalog.templates.length).toBe(45);
    expect(catalog.byCode.has('NEURCENO')).toBe(true);
    expect(catalog.usageRules.length).toBeGreaterThan(0);

    // Přesné české znění a diakritika u nabídnutelných textů
    const depRoll = catalog.byCode.get('DEP_ROLL');
    expect(depRoll).toBeDefined();
    expect(depRoll?.mode).toBe('Návrh ke schválení');
    expect(depRoll?.safetyText).toBe(
      'Patronu zahřejte v ohřívači určeném pro roll-on vosky. Před depilací vyzkoušejte teplotu na malé ploše pokožky. Válečkem nepřejíždějte přes poraněnou, podrážděnou nebo sluncem spálenou kůži. Patronu nesdílejte mezi klienty.'
    );

    const depOhrivac = catalog.byCode.get('DEP_OHRIVAC');
    expect(depOhrivac).toBeDefined();
    expect(depOhrivac?.mode).toBe('Ověřit konkrétní výrobek');
    expect(depOhrivac?.checkNote).toBe('Ověřit postup čištění v návodu konkrétního modelu.');

    // Prázdné návrhy u ručního posouzení a přeskočení
    const neurceno = catalog.byCode.get('NEURCENO');
    expect(neurceno?.mode).toBe('Ruční posouzení');
    expect(neurceno?.safetyText).toBe('');

    const sada = catalog.byCode.get('SADA');
    expect(sada?.mode).toBe('Ruční posouzení');
    expect(sada?.safetyText).toBe('');

    const bezEtikety = catalog.byCode.get('BEZ_ETIKETY');
    expect(bezEtikety?.mode).toBe('Přeskočit');
    expect(bezEtikety?.safetyText).toBe('');
  });

  it('returns exact template for known code and NEURCENO fallback for unknown code', () => {
    const catalog = loadSafetyTemplates();

    const known = getSafetyTemplateByCode('BROW_STYL', catalog);
    expect(known.isFallback).toBe(false);
    expect(known.entry.code).toBe('BROW_STYL');
    expect(known.entry.safetyText).toContain('Nanášejte čistým kartáčkem na chloupky obočí.');

    const unknown = getSafetyTemplateByCode('NEZNAMY_KOD_XYZ', catalog);
    expect(unknown.isFallback).toBe(true);
    expect(unknown.entry.code).toBe('NEURCENO');
    expect(unknown.entry.mode).toBe('Ruční posouzení');
    expect(unknown.entry.safetyText).toBe('');
  });

  it('throws error with expected file path when Excel file is missing', () => {
    expect(() => loadSafetyTemplates('data/safety/neexistujici_soubor.xlsx')).toThrowError(
      new RegExp(SAFETY_EXCEL_RELATIVE_PATH.replace(/\//g, '\\/'))
    );
  });

  it('rejects workbook with missing required columns', () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([{ 'Kód pro AI': 'TEST', Oblast: 'Depilace' }]);
    XLSX.utils.book_append_sheet(wb, ws, 'Šablony');

    expect(() => parseAndValidateSafetyWorkbook(wb)).toThrowError(/chybí povinné sloupce/i);
  });

  it('rejects workbook with duplicate or empty codes, unknown mode, or missing NEURCENO', () => {
    const makeRow = (overrides: Record<string, string>) => {
      const base: Record<string, string> = {};
      for (const col of REQUIRED_TEMPLATE_COLUMNS) base[col] = 'hodnota';
      base['Kód pro AI'] = 'DEP_ROLL';
      base['Režim'] = 'Návrh ke schválení';
      base['Návrh textu na etiketu'] = 'Platný bezpečnostní text.';
      return { ...base, ...overrides };
    };

    // Duplicitní kód
    const wbDup = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wbDup,
      XLSX.utils.json_to_sheet([
        makeRow({ 'Kód pro AI': 'DEP_ROLL' }),
        makeRow({ 'Kód pro AI': 'DEP_ROLL' }),
      ]),
      'Šablony'
    );
    expect(() => parseAndValidateSafetyWorkbook(wbDup)).toThrowError(/duplicitní kód/i);

    // Prázdný kód
    const wbEmptyCode = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wbEmptyCode,
      XLSX.utils.json_to_sheet([makeRow({ 'Kód pro AI': '' })]),
      'Šablony'
    );
    expect(() => parseAndValidateSafetyWorkbook(wbEmptyCode)).toThrowError(/prázdný "Kód pro AI"/i);

    // Neznámý režim
    const wbBadMode = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wbBadMode,
      XLSX.utils.json_to_sheet([makeRow({ 'Režim': 'Automaticky schválit' })]),
      'Šablony'
    );
    expect(() => parseAndValidateSafetyWorkbook(wbBadMode)).toThrowError(/neznámý režim/i);

    // Chybějící NEURCENO
    const wbNoNeurceno = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wbNoNeurceno,
      XLSX.utils.json_to_sheet([makeRow({ 'Kód pro AI': 'DEP_ROLL' })]),
      'Šablony'
    );
    expect(() => parseAndValidateSafetyWorkbook(wbNoNeurceno)).toThrowError(/NEURCENO/);
  });
});

describe('Safety Classifier (Simulated Ollama Responses - Offline)', () => {
  it('converts HTML descriptions to safe plain text without scripts or tags', () => {
    const html = `
      <div class="desc">
        <p>Profesionální <strong>hydratační sérum</strong>&nbsp;pro salonní péči.</p>
        <script>alert("xss")</script>
        <ul><li>Kyselina hyaluronová</li><li>Panthenol &amp; allantoin</li></ul>
      </div>
    `;
    const cleaned = stripHtmlToPlainText(html);
    expect(cleaned).not.toContain('<');
    expect(cleaned).not.toContain('alert');
    expect(cleaned).toContain('Profesionální hydratační sérum pro salonní péči.');
    expect(cleaned).toContain('• Kyselina hyaluronová');
    expect(cleaned).toContain('Panthenol & allantoin');
  });

  it('strips Shoptet embedded procedure guide widget and leftover stripTags=1 JavaScript', () => {
    const shoptetStripTagsPollution =
      "Průvodce procedurou Fáze procedury a zařazení produktu Lash Lifting 16 kroků Array.from(el.querySelectorAll(s)):[];var on=(el,ev,fn)=>{if(el)el.addEventListener(ev,fn)};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',I);else I()})(); ZOLA degreaser – odmašťovač na obočí 250 ml &nbsp; Počet aplikací Odmašťovač o objemu 250 ml.";
    const cleaned = stripHtmlToPlainText(shoptetStripTagsPollution);
    expect(cleaned).not.toContain('Průvodce procedurou');
    expect(cleaned).not.toContain('querySelectorAll');
    expect(cleaned).not.toContain('&nbsp;');
    expect(cleaned).toContain('ZOLA degreaser – odmašťovač na obočí 250 ml');
  });

  it('does not include full safety texts or source URLs in the system prompt sent to Ollama', () => {
    const catalog = loadSafetyTemplates();
    const prompt = buildClassifierSystemPrompt(catalog);

    expect(prompt).toContain('DEP_OHRIVAC');
    expect(prompt).toContain('KOS_PROCEDURA');
    // Nesmí obsahovat URL zdrojů ani kompletní bezpečnostní texty
    expect(prompt).not.toContain('https://www.depilujeme.cz');
    expect(prompt).not.toContain(
      'Patronu zahřejte v ohřívači určeném pro roll-on vosky.'
    );
  });

  it('resolves exact Czech safety text from Excel when model returns a valid code', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        message: { content: JSON.stringify({ code: 'BROW_STYL' }) },
      }),
    });

    const res = await classifyProductSafety(
      { name: 'Brow Wax', description: '<p>Stylingový vosk pro fixaci chloupků</p>' },
      { fetchImpl: mockFetch as unknown as typeof fetch }
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.code).toBe('BROW_STYL');
      expect(res.usedFallback).toBe(false);
      expect(res.mode).toBe('Návrh ke schválení');
      expect(res.safetyText).toBe(
        'Nanášejte čistým kartáčkem na chloupky obočí. Při práci v salonu použitý kartáček nevracejte do společného balení. Zabraňte vniknutí do očí. Při podráždění přípravek odstraňte a přestaňte jej používat.'
      );
      expect(res.categories.length).toBe(45);
      expect(res.categories.some((c) => c.code === 'LASH_NAT' && c.safetyText.length > 0)).toBe(true);
    }
  });

  it('falls back to NEURCENO when model returns an unknown code or invalid JSON', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        message: { content: JSON.stringify({ code: 'VYMYSLE_KATEGORIE_999' }) },
      }),
    });

    const res = await classifyProductSafety(
      { name: 'Nejasný produkt' },
      { fetchImpl: mockFetch as unknown as typeof fetch }
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.code).toBe('NEURCENO');
      expect(res.usedFallback).toBe(true);
      expect(res.mode).toBe('Ruční posouzení');
      expect(res.safetyText).toBe('');
    }
  });

  it('distinguishes technical errors (unavailable, missing model, timeout) from NEURCENO classification', async () => {
    // 1. Nedostupná Ollama
    const failFetch = vi.fn().mockRejectedValue(new Error('fetch failed: ECONNREFUSED'));
    const resUnavailable = await classifyProductSafety(
      { name: 'Maxymova Mini Wax Heater' },
      { fetchImpl: failFetch as unknown as typeof fetch }
    );
    expect(resUnavailable.ok).toBe(false);
    if (!resUnavailable.ok) {
      expect(resUnavailable.errorType).toBe('unavailable');
      expect(resUnavailable.error).toContain('Nepodařilo se připojit k lokální Ollamě');
    }

    // 2. Chybějící model (404)
    const notFoundFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'model "qwen3:4b" not found' }),
    });
    const resNotFound = await classifyProductSafety(
      { name: 'Maxymova Mini Wax Heater' },
      { fetchImpl: notFoundFetch as unknown as typeof fetch }
    );
    expect(resNotFound.ok).toBe(false);
    if (!resNotFound.ok) {
      expect(resNotFound.errorType).toBe('model_not_found');
      expect(resNotFound.error).toContain('ollama pull');
    }
  });
});
