'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import crypto from 'crypto';
import { logActivity } from '@/lib/activity';
import { assertAuthenticated } from '@/lib/auth';
import { selectionMatches } from '@/lib/safetySelection';
import { loadApplicationSafetyCatalog, validateCustomCategory } from '@/lib/customSafetyCatalog';
import { safetyProposal, suggestSafetyWithoutAI } from '@/lib/safetyRules';
import { requireAuthenticatedSession } from './auth';

// ---------------------------------------------------------------------------
// AI SAFETY TEXT SUGGESTION ACTION (LOCAL OLLAMA)
// ---------------------------------------------------------------------------

export async function suggestProductSafetyTextAction(input: {
  name: string;
  description?: string | null;
  productId?: string;
  currentSafetyText?: string | null;
  mode?: 'rules' | 'ai';
}) {
  await assertAuthenticated();
  try {
    if (!input?.name?.trim()) return { ok: false as const, errorType: 'validation' as const, error: 'Zadejte název produktu.' };
    const catalog = await loadApplicationSafetyCatalog();
    if (input.mode !== 'ai') {
      if (input.productId) {
        const product = await prisma.product.findUnique({ where: { id: input.productId }, include: { safetySelection: true } });
        const saved = product?.safetySelection;
        const draft = { name: input.name, description: input.description, safetyText: input.currentSafetyText ?? product?.safetyText };
        if (saved && product && selectionMatches(saved, product) && selectionMatches(saved, draft) && catalog.byCode.has(saved.code)) {
          return safetyProposal(saved.code, 'saved', catalog, 'Použita dříve potvrzená kategorie tohoto produktu.');
        }
      }
      return suggestSafetyWithoutAI(input.name, catalog);
    }
    const { classifyProductSafety } = await import('@/lib/safetyClassifier');
    const result = await classifyProductSafety({ name: input.name, description: input.description }, { catalog, skipNameRules: true });
    if (result.ok) {
      await logActivity('AI_SAFETY_SUGGEST', `AI návrh pro "${input.name.slice(0, 50)}": ${result.code}`);
      return { ...result, source: 'ai' as const, reason: 'Návrh AI. Před použitím zkontrolujte kategorii a text.' };
    }
    return result;
  } catch (error: unknown) {
    return { ok: false as const, errorType: 'validation' as const, error: error instanceof Error ? error.message : 'Nepodařilo se načíst pravidla.' };
  }
}

export async function shortenAndSaveProductNameAction(input: {
  productId: string;
  name: string;
  brand?: string | null;
  maxChars?: number;
}) {
  await assertAuthenticated();
  const auth = await requireAuthenticatedSession();
  if (!auth.authenticated) {
    return {
      ok: false as const,
      errorType: 'unauthorized' as const,
      error: 'Pro použití AI asistenta musíte být přihlášeni v aplikaci.',
    };
  }

  const { shortenProductNameForLabel } = await import('@/lib/safetyClassifier');
  const res = await shortenProductNameForLabel({
    name: input.name,
    brand: input.brand,
    maxChars: input.maxChars,
  });

  if (!res.ok) {
    return res;
  }

  await logActivity('AI_NAME_SUGGEST', `Návrh zkrácení názvu produktu ${input.productId}`);
  return {
    ok: true as const,
    shortName: res.shortName,
    model: res.model,
  };
}

export async function updateProductShortNameAction(productId: string, shortName: string | null) {
  await assertAuthenticated();
  const auth = await requireAuthenticatedSession();
  if (!auth.authenticated) {
    return { success: false, error: 'Pro úpravu produktu musíte být přihlášeni.' };
  }

  try {
    const clean = shortName?.trim() || null;
    if (clean && clean.length > 120) throw new Error('Zkrácený název může mít nejvýše 120 znaků.');
    const updated = await prisma.product.update({
      where: { id: productId },
      data: { shortName: clean },
    });
    revalidatePath('/products');
    revalidatePath('/print');
    return { success: true, shortName: updated.shortName };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Nepodařilo se uložit zkrácený název.',
    };
  }
}

export async function previewBulkSafetyAction() {
  await assertAuthenticated(true);
  const { planBulkSafety } = await import('@/lib/bulkSafety');
  const products = await prisma.product.findMany({ include: { safetySelection: true }, orderBy: { id: 'asc' } });
  const plan = planBulkSafety(products, await loadApplicationSafetyCatalog());
  return { token: plan.token, total: plan.total, changed: plan.changes.length, unknown: plan.unknown, review: plan.review, unchanged: plan.unchanged,
    sample: plan.changes.slice(0, 20).map(({ sku, name, code, before, after }) => ({ sku, name, code, before, after })) };
}

export async function applyBulkSafetyAction(token: string) {
  await assertAuthenticated(true);
  const { planBulkSafety } = await import('@/lib/bulkSafety');
  const { mkdir, writeFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const result = await prisma.$transaction(async tx => {
    const products = await tx.product.findMany({ include: { safetySelection: true }, orderBy: { id: 'asc' } });
    const plan = planBulkSafety(products, await loadApplicationSafetyCatalog(tx));
    if (!token || token !== plan.token) throw new Error('Produkty nebo pravidla se od náhledu změnily. Načtěte nový náhled.');
    if (!plan.changes.length) return { changed: 0, backup: null };
    const directory = path.join(process.cwd(), 'prisma', 'safety-backups');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const filename = `safety-${Date.now()}-${crypto.randomUUID()}.json`;
    await writeFile(path.join(directory, filename), JSON.stringify({ createdAt: new Date().toISOString(), changes: plan.changes }, null, 2), { mode: 0o600, flag: 'wx' });
    for (const change of plan.changes) {
      await tx.product.update({ where: { id: change.id }, data: { safetyText: change.after } });
      // Rule matches are proposals, not individually confirmed categories.
      if (change.source === 'saved') {
        await tx.productSafetySelection.update({ where: { productId: change.id }, data: { safetyText: change.after } });
      } else {
        await tx.productSafetySelection.deleteMany({ where: { productId: change.id } });
      }
    }
    return { changed: plan.changes.length, backup: filename };
  }, { timeout: 120000 });
  await logActivity('BULK_SAFETY_UPDATE', `Aktualizováno ${result.changed} textů; záloha: ${result.backup || 'beze změn'}`);
  revalidatePath('/products');
  revalidatePath('/print');
  return result;
}

export async function createSafetyCategoryAction(input: { name: string; area?: string; safetyText: string; keywords?: string }) {
  const user = await assertAuthenticated();
  try {
    const data = validateCustomCategory(input);
    const catalog = await loadApplicationSafetyCatalog();
    const { normalizeRuleText } = await import('@/lib/safetyRules');
    if (catalog.templates.some(entry => normalizeRuleText(entry.productType) === data.nameKey)) {
      throw new Error('Kategorie s tímto názvem již existuje. Vyberte ji ze seznamu.');
    }
    const code = `CUSTOM_${crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
    await prisma.customSafetyCategory.create({ data: { ...data, code, createdBy: user.username } });
    const updatedCatalog = await loadApplicationSafetyCatalog();
    await logActivity('SAFETY_CATEGORY_CREATE', `Vytvořena kategorie ${data.name} (${code})`);
    return { ...safetyProposal(code, 'manual', updatedCatalog, 'Nová vlastní kategorie. Použijte návrh a uložte produkt.'), manuallySelected: true };
  } catch (error) {
    const duplicate = error instanceof Error && 'code' in error && error.code === 'P2002';
    return { ok: false as const, error: duplicate ? 'Kategorie s tímto názvem již existuje.' : error instanceof Error ? error.message : 'Kategorii se nepodařilo vytvořit.' };
  }
}
