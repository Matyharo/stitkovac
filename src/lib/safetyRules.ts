import { loadSafetyTemplates, type SafetyTemplatesCatalog } from './safetyTemplates';
import type { ClassificationSuccess } from './safetyClassifier';

export function normalizeRuleText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function matchesTerm(text: string, term: string): boolean {
  const prefix = term.endsWith('*');
  const normalized = normalizeRuleText(prefix ? term.slice(0, -1) : term);
  if (!normalized) return false;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^| )${escaped}${prefix ? '' : '(?: |$)'}`, 'u').test(text);
}

export function matchSafetyRules(name: string, catalog: SafetyTemplatesCatalog): { code: string | null; candidates: string[] } {
  const text = normalizeRuleText(name);
  const matches = (catalog.nameRules || []).filter(rule =>
    rule.groups.every(group => group.some(term => matchesTerm(text, term))) &&
    !rule.exclude.some(term => matchesTerm(text, term))
  );
  if (!matches.length) return { code: null, candidates: [] };
  const priority = Math.max(...matches.map(rule => rule.priority));
  const candidates = [...new Set(matches.filter(rule => rule.priority === priority).map(rule => rule.code))];
  return { code: candidates.length === 1 ? candidates[0] : null, candidates };
}

export function safetyProposal(
  code: string,
  source: NonNullable<ClassificationSuccess['source']>,
  catalog: SafetyTemplatesCatalog,
  reason?: string
): ClassificationSuccess {
  const entry = catalog.byCode.get(code) || catalog.byCode.get('NEURCENO');
  if (!entry) throw new Error('Chybí kategorie NEURCENO.');
  return {
    ok: true, code: entry.code, rawModelCode: null, usedFallback: entry.code === 'NEURCENO',
    area: entry.area, productType: entry.productType, safetyText: entry.safetyText,
    mode: entry.mode, checkNote: entry.checkNote, clues: entry.clues,
    model: source, source, reason,
    categories: catalog.templates.map(({ code, area, productType, safetyText, mode, checkNote, clues }) =>
      ({ code, area, productType, safetyText, mode, checkNote, clues })),
  };
}

export function suggestSafetyWithoutAI(name: string, catalog = loadSafetyTemplates()): ClassificationSuccess {
  const match = matchSafetyRules(name, catalog);
  if (match.code) return safetyProposal(match.code, 'rule', catalog, 'Kategorie rozpoznaná z názvu podle pravidla.');
  const reason = match.candidates.length > 1
    ? 'Název odpovídá více kategoriím. Vyberte správnou kategorii ručně nebo požádejte AI.'
    : 'Název nemá jednoznačnou shodu. Vyberte kategorii ručně nebo požádejte AI.';
  return safetyProposal('NEURCENO', 'manual', catalog, reason);
}
