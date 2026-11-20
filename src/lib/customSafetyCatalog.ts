import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { loadSafetyTemplates, type SafetyTemplatesCatalog } from './safetyTemplates';
import { normalizeRuleText } from './safetyRules';

type CatalogDb = Pick<Prisma.TransactionClient, 'customSafetyCategory'>;
export function validateCustomCategory(input: { name: string; area?: string; safetyText: string; keywords?: string }) {
  const name = input.name?.trim() || '';
  const area = input.area?.trim() || 'Ostatní';
  const safetyText = input.safetyText?.trim() || '';
  if (name.length < 2 || name.length > 100 || normalizeRuleText(name).length < 2) throw new Error('Název kategorie musí mít 2 až 100 znaků.');
  if (area.length > 80) throw new Error('Oblast může mít nejvýše 80 znaků.');
  if (safetyText.length < 10 || safetyText.length > 4000) throw new Error('Bezpečnostní text musí mít 10 až 4000 znaků.');
  if ((input.keywords || '').length > 2000) throw new Error('Seznam rozpoznávacích slov je příliš dlouhý.');
  const keywords = [...new Set((input.keywords || '').split(/[\n,;]+/).map(normalizeRuleText).filter(Boolean))];
  if (keywords.length > 30 || keywords.some(word => word.length < 3 || word.length > 100)) throw new Error('Zadejte nejvýše 30 slov nebo spojení, každé o délce 3 až 100 znaků.');
  return { name, nameKey: normalizeRuleText(name), area, safetyText, keywords: JSON.stringify(keywords) };
}

export async function loadApplicationSafetyCatalog(db: CatalogDb = prisma): Promise<SafetyTemplatesCatalog> {
  const base = loadSafetyTemplates();
  const custom = await db.customSafetyCategory.findMany({ orderBy: { code: 'asc' } });
  const entries = custom.map(category => ({ code: category.code, area: category.area, productType: category.name, safetyText: category.safetyText,
    mode: 'Návrh ke schválení' as const, clues: (JSON.parse(category.keywords) as string[]).join(', '),
    checkNote: 'Kategorie vytvořená uživatelem v aplikaci. Před použitím ověřte vhodnost pro konkrétní výrobek.',
    catalogSource: 'Vlastní kategorie', referenceBasis: 'Text zadaný uživatelem' }));
  return { ...base, templates: [...base.templates, ...entries], byCode: new Map([...base.byCode, ...entries.map(entry => [entry.code, entry] as const)]),
    nameRules: [...(base.nameRules || []), ...custom.flatMap(category => {
      const keywords = JSON.parse(category.keywords) as string[];
      return keywords.length ? [{ id: category.code, code: category.code, priority: 50, groups: [keywords], exclude: [] }] : [];
    })] };
}
