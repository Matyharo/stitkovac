import type { Prisma } from '@prisma/client';
import { loadSafetyTemplates } from './safetyTemplates';

type Input = { name: string; description?: string | null; safetyText?: string | null };
type Selection = { code: string; name: string; description: string; safetyText: string };

export function selectionMatches(selection: Selection, input: Input): boolean {
  return selection.name === input.name.trim() &&
    selection.description === (input.description || '').trim() &&
    selection.safetyText === (input.safetyText || '').trim();
}

export async function storeSafetySelection(
  tx: Prisma.TransactionClient,
  product: Input & { id: string },
  confirmedCode?: string | null
) {
  const previous = await tx.productSafetySelection.findUnique({ where: { productId: product.id } });
  if (confirmedCode) {
    const entry = loadSafetyTemplates().byCode.get(confirmedCode);
    if (!entry || !['Návrh ke schválení', 'Ověřit konkrétní výrobek'].includes(entry.mode) || entry.safetyText !== (product.safetyText || '').trim()) {
      throw new Error('Vybraná kategorie neodpovídá potvrzenému textu. Vyberte návrh znovu.');
    }
    const data = { code: entry.code, name: product.name.trim(), description: (product.description || '').trim(), safetyText: entry.safetyText, confirmedAt: new Date() };
    await tx.productSafetySelection.upsert({ where: { productId: product.id }, create: { productId: product.id, ...data }, update: data });
  } else if (previous && !selectionMatches(previous, product)) {
    await tx.productSafetySelection.delete({ where: { productId: product.id } });
  }
}
