import * as XLSX from 'xlsx';
import { createHash } from 'node:crypto';
import { parseAndValidateSafetyWorkbook, REQUIRED_TEMPLATE_COLUMNS, type SafetyTemplatesCatalog } from './safetyTemplates';

export function serializeSafetyCatalog(catalog: SafetyTemplatesCatalog): string {
  return JSON.stringify({ sourcePath: 'Databáze aplikace', templates: catalog.templates, usageRules: catalog.usageRules, nameRules: catalog.nameRules || [] });
}
export function exportSafetyWorkbook(catalog: SafetyTemplatesCatalog): Buffer {
  const workbook = XLSX.utils.book_new();
  const rows = catalog.templates.map(t => [t.code, t.area, t.productType, t.safetyText, t.mode, t.clues, t.checkNote, t.catalogSource, t.referenceBasis]);
  const templates = XLSX.utils.aoa_to_sheet([[...REQUIRED_TEMPLATE_COLUMNS], ...rows]);
  templates['!cols'] = [18, 18, 38, 100, 28, 50, 65, 30, 40].map(wch => ({ wch }));
  templates['!autofilter'] = { ref: `A1:I${rows.length + 1}` };
  XLSX.utils.book_append_sheet(workbook, templates, 'Šablony');
  const rules = (catalog.nameRules || []).map((r, i) => [`R${i + 1}`, r.code, r.priority, r.groups.map(g => g.join('|')).join(';'), r.exclude.join('|'), 'ano']);
  const ruleSheet = XLSX.utils.aoa_to_sheet([['ID', 'Kód kategorie', 'Priorita', 'Všechny skupiny', 'Vyloučit', 'Aktivní'], ...rules]);
  ruleSheet['!cols'] = [12, 26, 12, 90, 70, 12].map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(workbook, ruleSheet, 'Pravidla');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Krok', 'Pravidlo'],
    ...catalog.usageRules.map(r => [r.step, r.rule]),
    ['Import', 'Kategorie se přidávají nebo aktualizují podle Kódu pro AI. Chybějící kategorie se nemažou. Kódy stávajících kategorií neměňte.'],
    ['Rozpoznávání', 'V listu Pravidla odděluje středník povinné skupiny a | alternativy. Hvězdička na konci znamená začátek slova.'],
    ['Bez pravidel', 'Pokud list Pravidla vynecháte, současná pravidla se zachovají. S přítomným listem se pravidla importovaných kategorií nahradí.'],
  ]), 'Použití');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

export function planSafetyWorkbookImport(buffer: Uint8Array, current: SafetyTemplatesCatalog) {
  if (!buffer.length || buffer.length > 2 * 1024 * 1024) throw new Error('Vyberte neprázdný Excel do velikosti 2 MB.');
  const workbook = XLSX.read(buffer, { type: 'array', cellFormula: true });
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    if (range.e.r > 1000 || range.e.c > 30) throw new Error('Soubor může mít nejvýše 1000 řádků a 31 sloupců v každém listu.');
    for (const [key, value] of Object.entries(sheet)) {
      if (!key.startsWith('!') && value && typeof value === 'object' && 'f' in value) throw new Error('Použijte pouze hodnoty, bez excelových vzorců.');
    }
  }
  const incoming = parseAndValidateSafetyWorkbook(workbook, 'Importovaný Excel');
  if (incoming.templates.some(t => !/^[A-Z][A-Z0-9_]{0,63}$/.test(t.code) || Object.values(t).some(v => String(v).length > 8000))) throw new Error('Neplatný kód kategorie nebo příliš dlouhá hodnota.');
  if (incoming.byCode.get('NEURCENO')?.mode !== 'Ruční posouzení') throw new Error('Kategorie NEURCENO musí zůstat v režimu Ruční posouzení.');
  const entries = new Map(current.templates.map(t => [t.code, t]));
  let added = 0, updated = 0, unchanged = 0;
  const sample: { code: string; name: string; change: string }[] = [];
  for (const entry of incoming.templates) {
    const previous = entries.get(entry.code);
    if (!previous) added++;
    else if (JSON.stringify(previous) !== JSON.stringify(entry)) updated++;
    else unchanged++;
    if ((!previous || JSON.stringify(previous) !== JSON.stringify(entry)) && sample.length < 20) sample.push({ code: entry.code, name: entry.productType, change: previous ? 'Aktualizovat' : 'Přidat' });
    entries.set(entry.code, entry);
  }
  const importedCodes = new Set(incoming.templates.map(t => t.code));
  const hasRules = workbook.SheetNames.includes('Pravidla');
  const nameRules = hasRules ? [...(current.nameRules || []).filter(r => !importedCodes.has(r.code)), ...(incoming.nameRules || [])].map((r, i) => ({ ...r, id: `R${i + 1}` })) : current.nameRules || [];
  const merged = { ...current, templates: [...entries.values()], byCode: entries, nameRules };
  const token = createHash('sha256').update(serializeSafetyCatalog(current)).update(buffer).digest('hex');
  return { catalog: merged, token, added, updated, unchanged, kept: current.templates.filter(t => !importedCodes.has(t.code)).length, rules: nameRules.length, rulesReplaced: hasRules, sample };
}
