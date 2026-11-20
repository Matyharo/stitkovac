import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { loadSafetyTemplates } from '../safetyTemplates';
import { exportSafetyWorkbook, planSafetyWorkbookImport } from '../safetyWorkbook';
const base = loadSafetyTemplates();
function changeWorkbook(change: (wb: XLSX.WorkBook) => void) {
  const wb = XLSX.read(exportSafetyWorkbook(base), { type: 'buffer' }); change(wb);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
describe('safety category Excel transfer', () => {
  it('round trips templates and name rules including custom categories', () => {
    const custom = { ...base.templates[0], code: 'CUSTOM_MIRROR', productType: 'Zrcátka', safetyText: 'Text zadaný uživatelem.' };
    const catalog = { ...base, templates: [...base.templates, custom], byCode: new Map([...base.byCode, [custom.code, custom] as const]) };
    const plan = planSafetyWorkbookImport(exportSafetyWorkbook(catalog), catalog);
    expect(plan.added).toBe(0); expect(plan.updated).toBe(0);
    expect(plan.catalog.byCode.get('CUSTOM_MIRROR')?.safetyText).toBe(custom.safetyText);
    expect(plan.rules).toBe(base.nameRules!.length);
  });
  it('updates by stable code and preserves categories omitted from the file', () => {
    const bytes = changeWorkbook(wb => {
      wb.Sheets['Šablony']['D2'].v = 'Upravený text podle výrobce.';
    });
    const local = { ...base.templates[0], code: 'CUSTOM_LOCAL', productType: 'Místní kategorie' };
    const current = { ...base, templates: [...base.templates, local], byCode: new Map([...base.byCode, [local.code, local] as const]) };
    const plan = planSafetyWorkbookImport(bytes, current);
    expect(plan.updated).toBe(1); expect(plan.kept).toBe(1);
    expect(plan.catalog.byCode.has('CUSTOM_LOCAL')).toBe(true);
  });
  it('preserves current rules if the optional rules sheet is missing', () => {
    const bytes = changeWorkbook(wb => { wb.SheetNames = wb.SheetNames.filter(n => n !== 'Pravidla'); delete wb.Sheets.Pravidla; });
    const plan = planSafetyWorkbookImport(bytes, base);
    expect(plan.rulesReplaced).toBe(false); expect(plan.catalog.nameRules).toEqual(base.nameRules);
  });
  it('rejects duplicate codes, invalid headers, formulas and empty files', () => {
    expect(() => planSafetyWorkbookImport(new Uint8Array(), base)).toThrow();
    expect(() => planSafetyWorkbookImport(changeWorkbook(wb => { wb.Sheets['Šablony'].A3.v = wb.Sheets['Šablony'].A2.v; }), base)).toThrow('duplicitní');
    expect(() => planSafetyWorkbookImport(changeWorkbook(wb => { wb.Sheets['Šablony'].D1.v = 'Wrong'; }), base)).toThrow();
    expect(() => planSafetyWorkbookImport(changeWorkbook(wb => { wb.Sheets['Šablony'].D2.f = '1+1'; }), base)).toThrow('vzorců');
  });
  it('binds preview to both uploaded bytes and current catalog', () => {
    const bytes = exportSafetyWorkbook(base);
    const token = planSafetyWorkbookImport(bytes, base).token;
    expect(planSafetyWorkbookImport(bytes, base).token).toBe(token);
    expect(planSafetyWorkbookImport(bytes, { ...base, templates: base.templates.slice(1) }).token).not.toBe(token);
  });
});
