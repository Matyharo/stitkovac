import { describe, expect, it, vi } from 'vitest';
import { loadSafetyTemplates } from '../safetyTemplates';
import { matchSafetyRules, suggestSafetyWithoutAI } from '../safetyRules';
import { selectionMatches, storeSafetySelection } from '../safetySelection';
import type { Prisma } from '@prisma/client';

const catalog = loadSafetyTemplates();
describe('deterministic safety selection', () => {
  it.each([
    ['Lamitta silikonové natáčky na lash lifting 1 pár', 'LASH_NAT'],
    ['Noemi Flat Jelly ploché silikonové natáčky na korejský Lash lifting 1 pár', 'LASH_NAT'],
    ['Italwax samostržný vosk granule', 'DEP_FILM'],
    ['Ohřívač vosku', 'DEP_OHRIVAC'],
    ['Cukrová pasta', 'DEP_CUKR'],
    ['Papírový kompenzátor na lash lifting', 'LASH_KOMP'],
    ['Henna na obočí', 'BROW_HENNA'],
    ['Hydratační krém', 'KOS_PROCEDURA'],
    ['Dezinfekce silikonových natáček', 'CHEM_SIL'],
    ['Sada pro lash lifting s natáčkami', 'SADA'],
    ['Online kurz lash lifting', 'BEZ_ETIKETY'],
  ])('resolves %s from workbook rules', (name, code) => {
    const result = suggestSafetyWithoutAI(name, catalog);
    expect(result.code).toBe(code);
    expect(result.safetyText).toBe(catalog.byCode.get(code)?.safetyText);
  });
  it.each(['Čistič natáček na řasy', 'Pouzdro na natáčky na lash lifting', 'Monoi 800 g', 'Nekrémový výrobek'])('leaves uncertain names for manual selection: %s', name => {
    expect(suggestSafetyWithoutAI(name, catalog).code).toBe('NEURCENO');
  });
  it('does not call fetch even for unknown names', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    suggestSafetyWithoutAI('Neznámý výrobek', catalog);
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
  it('requires manual selection for conflicting top-priority rules', () => {
    const rules = ['LASH_NAT', 'LASH_KOMP'].map((code, i) => ({ id: String(i), code, priority: 10, groups: [['test']], exclude: [] }));
    expect(matchSafetyRules('test', { ...catalog, nameRules: rules }).code).toBeNull();
  });
  it('accepts workbooks without rules without inventing a category', () => {
    expect(suggestSafetyWithoutAI('Hydratační krém', { ...catalog, nameRules: [] }).code).toBe('NEURCENO');
  });
  it('invalidates saved selection after name, description or safety text changes', () => {
    const selection = { code: 'LASH_NAT', name: 'Natáčky', description: 'Popis', safetyText: 'Text' };
    expect(selectionMatches(selection, selection)).toBe(true);
    for (const key of ['name', 'description', 'safetyText']) expect(selectionMatches(selection, { ...selection, [key]: 'změna' })).toBe(false);
  });
  it('persists only a confirmed code with its exact workbook text', async () => {
    const upsert = vi.fn();
    const tx = { productSafetySelection: { findUnique: vi.fn().mockResolvedValue(null), upsert } } as unknown as Prisma.TransactionClient;
    const product = { id: 'test', name: 'Natáčky', safetyText: catalog.byCode.get('LASH_NAT')!.safetyText };
    await storeSafetySelection(tx, product, 'LASH_NAT');
    expect(upsert).toHaveBeenCalledOnce();
    await expect(storeSafetySelection(tx, { ...product, safetyText: 'Jiný text' }, 'LASH_NAT')).rejects.toThrow();
  });
  it('removes stale confirmation without changing product text', async () => {
    const remove = vi.fn();
    const tx = { productSafetySelection: { findUnique: vi.fn().mockResolvedValue({ code: 'LASH_NAT', name: 'Původní název', description: '', safetyText: 'Text' }), delete: remove } } as unknown as Prisma.TransactionClient;
    await storeSafetySelection(tx, { id: 'test', name: 'Nový název', safetyText: 'Text' });
    expect(remove).toHaveBeenCalledWith({ where: { productId: 'test' } });
  });
});
