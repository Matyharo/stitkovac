import { describe, expect, it, vi } from 'vitest';
import { planBulkSafety, type BulkProduct } from '../bulkSafety';
import { loadSafetyTemplates } from '../safetyTemplates';
const catalog = loadSafetyTemplates();
function product(id: string, name: string, safetyText: string | null = 'Původní výchozí text'): BulkProduct {
  return { id, sku: id, name, shortName: null, description: '', brand: null, price: null, safetyText, contactText: null, ean: null, note: null, createdAt: new Date(0), updatedAt: new Date(0), safetySelection: null };
}
describe('bulk safety plan', () => {
  it('updates recognized names and preserves unknown products including empty texts', () => {
    const products = [product('1', 'Silikonové natáčky na lash lifting'), product('2', 'Neznámý výrobek'), product('3', 'Jiný výrobek', null)];
    const original = JSON.stringify(products);
    const plan = planBulkSafety(products, catalog);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]).toMatchObject({ id: '1', code: 'LASH_NAT', before: 'Původní výchozí text', after: catalog.byCode.get('LASH_NAT')!.safetyText });
    expect(plan.unknown).toBe(2);
    expect(JSON.stringify(products)).toBe(original);
  });
  it('leaves review, skip and manual categories unchanged', () => {
    const names = ['Sada pro lash lifting', 'Online kurz lash lifting'];
    const plan = planBulkSafety(names.map((name, i) => product(String(i), name)), catalog);
    expect(plan.changes).toHaveLength(0);
    expect(plan.review).toBe(2);
  });
  it('is idempotent and does not call Ollama', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const plan = planBulkSafety([product('1', 'Natáčky na řasy', catalog.byCode.get('LASH_NAT')!.safetyText)], catalog);
    expect(plan.changes).toHaveLength(0);
    expect(plan.unchanged).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
  it('prefers valid saved category over a conflicting name rule', () => {
    const p = product('1', 'Natáčky na řasy');
    p.safetySelection = { productId: p.id, code: 'DEP_FILM', name: p.name, description: '', safetyText: p.safetyText!, confirmedAt: new Date(0) };
    expect(planBulkSafety([p], catalog).changes[0]).toMatchObject({ code: 'DEP_FILM', source: 'saved' });
    p.safetySelection.name = 'Starý název';
    expect(planBulkSafety([p], catalog).changes[0]).toMatchObject({ code: 'LASH_NAT', source: 'rule' });
  });
  it('invalidates preview on product or workbook changes', () => {
    const p = product('1', 'Natáčky na řasy');
    const token = planBulkSafety([p], catalog).token;
    expect(planBulkSafety([p], catalog).token).toBe(token);
    expect(planBulkSafety([{ ...p, safetyText: 'Ruční změna' }], catalog).token).not.toBe(token);
    const byCode = new Map(catalog.byCode);
    byCode.set('LASH_NAT', { ...byCode.get('LASH_NAT')!, safetyText: 'Nový text v tabulce' });
    expect(planBulkSafety([p], { ...catalog, byCode }).token).not.toBe(token);
  });
  it('skips conflicting category rules rather than overwriting with a guess', () => {
    const nameRules = ['LASH_NAT', 'DEP_FILM'].map(code => ({ id: code, code, priority: 1, groups: [['test']], exclude: [] }));
    const plan = planBulkSafety([product('1', 'test')], { ...catalog, nameRules });
    expect(plan.unknown).toBe(1);
    expect(plan.changes).toEqual([]);
  });
});
