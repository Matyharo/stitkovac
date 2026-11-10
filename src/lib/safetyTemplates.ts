import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

export const SAFETY_EXCEL_RELATIVE_PATH = 'data/safety/Depilujeme_bezpecnostni_texty.xlsx';

export const VALID_SAFETY_MODES = [
  'Návrh ke schválení',
  'Ověřit konkrétní výrobek',
  'Ruční posouzení',
  'Přeskočit',
] as const;

export type SafetyMode = (typeof VALID_SAFETY_MODES)[number];

export const REQUIRED_TEMPLATE_COLUMNS = [
  'Kód pro AI',
  'Oblast',
  'Typ výrobku',
  'Návrh textu na etiketu',
  'Režim',
  'Vodítka v názvu a popisu',
  'Co zkontrolovat',
  'Zdroj v katalogu',
  'Podklad k návrhu',
] as const;

export interface SafetyTemplateEntry {
  code: string;
  area: string;
  productType: string;
  safetyText: string;
  mode: SafetyMode;
  clues: string;
  checkNote: string;
  catalogSource: string;
  referenceBasis: string;
}

export interface SafetyUsageRule {
  step: string;
  rule: string;
}

export interface SafetyTemplatesCatalog {
  sourcePath: string;
  templates: SafetyTemplateEntry[];
  byCode: Map<string, SafetyTemplateEntry>;
  usageRules: SafetyUsageRule[];
}

interface CacheState {
  filePath: string;
  mtimeMs: number;
  catalog: SafetyTemplatesCatalog;
}

let cachedCatalog: CacheState | null = null;

function isValidSafetyMode(val: string): val is SafetyMode {
  return (VALID_SAFETY_MODES as readonly string[]).includes(val);
}

/**
 * Validuje a parsuje načtený XLSX sešit s bezpečnostními texty.
 * Neprovádí žádné vytváření náhradních bezpečnostních textů.
 */
export function parseAndValidateSafetyWorkbook(
  workbook: XLSX.WorkBook,
  sourcePath: string = SAFETY_EXCEL_RELATIVE_PATH
): SafetyTemplatesCatalog {
  const sheetName = 'Šablony';
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(
      `V souboru "${sourcePath}" chybí povinný list "${sheetName}". Nalezené listy: ${
        workbook.SheetNames.join(', ') || '(žádné)'
      }.`
    );
  }

  // Načteme matici řádků pro přesnou kontrolu hlaviček
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
  if (matrix.length === 0) {
    throw new Error(`List "${sheetName}" v souboru "${sourcePath}" je prázdný.`);
  }

  const headerRow = (matrix[0] || []).map((cell) => String(cell ?? '').trim());
  const missingColumns = REQUIRED_TEMPLATE_COLUMNS.filter((col) => !headerRow.includes(col));
  if (missingColumns.length > 0) {
    throw new Error(
      `V listu "${sheetName}" (${sourcePath}) chybí povinné sloupce: ${missingColumns.join(', ')}.`
    );
  }

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (rawRows.length === 0) {
    throw new Error(`List "${sheetName}" v souboru "${sourcePath}" neobsahuje žádné datové řádky.`);
  }

  const templates: SafetyTemplateEntry[] = [];
  const byCode = new Map<string, SafetyTemplateEntry>();

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const rowNum = i + 2; // +1 za 0-index, +1 za hlavičku

    // Přeskočíme zcela prázdné řádky na konci tabulky
    const allValuesEmpty = REQUIRED_TEMPLATE_COLUMNS.every(
      (col) => String(row[col] ?? '').trim() === ''
    );
    if (allValuesEmpty) {
      continue;
    }

    const code = String(row['Kód pro AI'] ?? '').trim();
    const area = String(row['Oblast'] ?? '').trim();
    const productType = String(row['Typ výrobku'] ?? '').trim();
    const safetyText = String(row['Návrh textu na etiketu'] ?? '').trim();
    const rawMode = String(row['Režim'] ?? '').trim();
    const clues = String(row['Vodítka v názvu a popisu'] ?? '').trim();
    const checkNote = String(row['Co zkontrolovat'] ?? '').trim();
    const catalogSource = String(row['Zdroj v katalogu'] ?? '').trim();
    const referenceBasis = String(row['Podklad k návrhu'] ?? '').trim();

    if (!code) {
      throw new Error(`Řádek ${rowNum} v listu "${sheetName}" (${sourcePath}) má prázdný "Kód pro AI".`);
    }

    if (byCode.has(code)) {
      throw new Error(
        `Řádek ${rowNum} v listu "${sheetName}" (${sourcePath}) obsahuje duplicitní kód "${code}".`
      );
    }

    if (!isValidSafetyMode(rawMode)) {
      throw new Error(
        `Řádek ${rowNum} (kód "${code}") v listu "${sheetName}" (${sourcePath}) má neznámý režim "${rawMode}". Povolené režimy: ${VALID_SAFETY_MODES.join(', ')}.`
      );
    }

    if (!productType) {
      throw new Error(
        `Řádek ${rowNum} (kód "${code}") v listu "${sheetName}" (${sourcePath}) má prázdný "Typ výrobku".`
      );
    }

    // Pro "Návrh ke schválení" a "Ověřit konkrétní výrobek" musí existovat nabízený bezpečnostní text.
    // Pro "Ruční posouzení" a "Přeskočit" je prázdný návrh platný.
    if (
      (rawMode === 'Návrh ke schválení' || rawMode === 'Ověřit konkrétní výrobek') &&
      !safetyText
    ) {
      throw new Error(
        `Řádek ${rowNum} (kód "${code}", režim "${rawMode}") v souboru "${sourcePath}" má prázdný "Návrh textu na etiketu".`
      );
    }

    const entry: SafetyTemplateEntry = {
      code,
      area,
      productType,
      safetyText,
      mode: rawMode,
      clues,
      checkNote,
      catalogSource,
      referenceBasis,
    };

    templates.push(entry);
    byCode.set(code, entry);
  }

  if (!byCode.has('NEURCENO')) {
    throw new Error(
      `V číselníku bezpečnostních textů (${sourcePath}) chybí povinný záložní kód "NEURCENO".`
    );
  }

  // Volitelné načtení druhého listu "Použití" s metodickými pokyny
  const usageRules: SafetyUsageRule[] = [];
  const usageSheet = workbook.Sheets['Použití'];
  if (usageSheet) {
    const usageRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(usageSheet, { defval: '' });
    for (const uRow of usageRows) {
      const step = String(uRow['Krok'] ?? '').trim();
      const rule = String(uRow['Pravidlo'] ?? '').trim();
      if (step || rule) {
        usageRules.push({ step, rule });
      }
    }
  }

  return {
    sourcePath,
    templates,
    byCode,
    usageRules,
  };
}

/**
 * Načte a zvaliduje Excel s bezpečnostními šablonami z disku.
 * Využívá cache podle času poslední úpravy souboru (mtimeMs), takže změna v Excelu
 * se okamžitě projeví bez nutnosti restartu nebo rebuildu.
 */
export function loadSafetyTemplates(customFilePath?: string): SafetyTemplatesCatalog {
  const resolvedPath = customFilePath
    ? path.resolve(customFilePath)
    : path.resolve(process.cwd(), SAFETY_EXCEL_RELATIVE_PATH);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `Soubor s bezpečnostními texty nebyl nalezen. Očekávaná cesta: ${SAFETY_EXCEL_RELATIVE_PATH} (${resolvedPath}).`
    );
  }

  const stat = fs.statSync(resolvedPath);
  if (
    cachedCatalog &&
    cachedCatalog.filePath === resolvedPath &&
    cachedCatalog.mtimeMs === stat.mtimeMs
  ) {
    return cachedCatalog.catalog;
  }

  const buffer = fs.readFileSync(resolvedPath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const catalog = parseAndValidateSafetyWorkbook(workbook, SAFETY_EXCEL_RELATIVE_PATH);

  cachedCatalog = {
    filePath: resolvedPath,
    mtimeMs: stat.mtimeMs,
    catalog,
  };

  return catalog;
}

/**
 * Vyhledá záznam podle kódu. Pokud kód neexistuje nebo je prázdný, vrátí položku NEURCENO.
 */
export function getSafetyTemplateByCode(
  code: string | null | undefined,
  catalog?: SafetyTemplatesCatalog
): { entry: SafetyTemplateEntry; isFallback: boolean } {
  const cat = catalog ?? loadSafetyTemplates();
  const normalized = (code || '').trim();
  if (normalized && cat.byCode.has(normalized)) {
    return {
      entry: cat.byCode.get(normalized)!,
      isFallback: false,
    };
  }
  const fallback = cat.byCode.get('NEURCENO');
  if (!fallback) {
    throw new Error('V katalogu bezpečnostních textů chybí kód NEURCENO.');
  }
  return {
    entry: fallback,
    isFallback: true,
  };
}

