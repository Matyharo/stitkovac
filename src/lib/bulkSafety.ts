import { createHash } from 'node:crypto';
import type { Product, ProductSafetySelection } from '@prisma/client';
import type { SafetyTemplatesCatalog } from './safetyTemplates';
import { selectionMatches } from './safetySelection';
import { matchSafetyRules } from './safetyRules';

export type BulkProduct = Product & { safetySelection: ProductSafetySelection | null };
export function planBulkSafety(products: BulkProduct[], catalog: SafetyTemplatesCatalog) {
  const changes: { id: string; sku: string; name: string; code: string; before: string | null; after: string; source: 'saved' | 'rule' }[] = [];
  let unknown = 0, review = 0, unchanged = 0;
  for (const product of products) {
    const saved = product.safetySelection;
    const useSaved = saved && selectionMatches(saved, product) && catalog.byCode.has(saved.code);
    const code = useSaved ? saved.code : matchSafetyRules(product.name, catalog).code;
    const entry = code ? catalog.byCode.get(code) : undefined;
    if (!entry || entry.code === 'NEURCENO') { unknown++; continue; }
    if (entry.mode !== 'Návrh ke schválení' || !entry.safetyText.trim()) { review++; continue; }
    if (product.safetyText === entry.safetyText) { unchanged++; continue; }
    changes.push({ id: product.id, sku: product.sku, name: product.name, code: entry.code, before: product.safetyText, after: entry.safetyText, source: useSaved ? 'saved' : 'rule' });
  }
  // Bind approval to the entire catalog snapshot, including edits that do not change a rule match.
  const token = createHash('sha256').update(JSON.stringify({ products, changes, unknown, review, unchanged })).digest('hex');
  return { token, total: products.length, changes, unknown, review, unchanged };
}
