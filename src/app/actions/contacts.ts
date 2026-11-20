'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { logActivity } from '@/lib/activity';
import { assertAuthenticated } from '@/lib/auth';
import { isValEmpty, resolveContactTextForBrand, resolveSafetyTextForBrand } from '@/lib/productText';

export async function getContactRules() {
  await assertAuthenticated();
  try {
    let rules = await prisma.contactRule.findMany({
      orderBy: [
        { isDefault: 'desc' },
        { brandPattern: 'asc' }
      ]
    });

    if (rules.length === 0) {
      // Seed default rules based on user requirements
      const defaultRule = await prisma.contactRule.create({
        data: {
          brandPattern: '',
          companyName: 'Evolution Beauty Institut s. r. o.',
          ico: '07996811',
          address: '5. května 70, 140 00 Praha 4',
          website: 'www.depilujeme.cz',
          safetyText: 'Uchovávejte mimo dosah dětí. Pouze pro vnější použití.',
          isDefault: true
        }
      });
      
      const lcpRule = await prisma.contactRule.create({
        data: {
          brandPattern: 'L.C.P.',
          companyName: 'Evolution Beauty Institut s. r. o.',
          ico: '07996811',
          address: '5. května 70, 140 00 Praha 4',
          website: 'www.lcp-paris.cz',
          safetyText: 'Zamezte kontaktu s očima. V případě zasažení očí okamžitě vypláchněte vodou.',
          isDefault: false
        }
      });

      const ellaRule = await prisma.contactRule.create({
        data: {
          brandPattern: 'Ella Baché',
          companyName: 'Evolution Beauty Institut s. r. o.',
          ico: '07996811',
          address: '5. května 70, 140 00 Praha 4',
          website: 'www.ellabache.cz',
          safetyText: 'Pouze pro profesionální použití. Skladujte v suchu a chladu.',
          isDefault: false
        }
      });

      rules = [defaultRule, lcpRule, ellaRule];
    }
    return rules;
  } catch (error) {
    console.error('Error fetching contact rules:', error);
    return [];
  }
}

export async function saveContactRule(data: {
  id?: string;
  brandPattern: string;
  companyName: string;
  ico: string;
  address: string;
  website: string;
  safetyText?: string | null;
  isDefault?: boolean;
}) {
  await assertAuthenticated(true);
  try {
    if (data.id) {
      const updated = await prisma.contactRule.update({
        where: { id: data.id },
        data: {
          brandPattern: data.brandPattern || '',
          companyName: data.companyName,
          ico: data.ico,
          address: data.address,
          website: data.website,
          safetyText: data.safetyText || null,
        }
      });
      await logActivity('RULE_UPDATE', `Upraveno pravidlo pro značku: ${data.brandPattern || 'výchozí'}`);
      revalidatePath('/settings');
      return { success: true, rule: updated };
    } else {
      const created = await prisma.contactRule.create({
        data: {
          brandPattern: data.brandPattern || '',
          companyName: data.companyName,
          ico: data.ico,
          address: data.address,
          website: data.website,
          safetyText: data.safetyText || null,
          isDefault: data.isDefault || false
        }
      });
      await logActivity('RULE_CREATE', `Vytvořeno pravidlo pro značku: ${data.brandPattern || 'výchozí'}`);
      revalidatePath('/settings');
      return { success: true, rule: created };
    }
  } catch (error: any) {
    console.error('Error saving contact rule:', error);
    return { success: false, error: error.message || 'Nepodařilo se uložit pravidlo.' };
  }
}

export async function deleteContactRule(id: string) {
  await assertAuthenticated(true);
  try {
    const rule = await prisma.contactRule.findUnique({ where: { id } });
    if (!rule) {
      return { success: false, error: 'Pravidlo nebylo nalezeno.' };
    }
    if (rule.isDefault) {
      return { success: false, error: 'Výchozí pravidlo nelze smazat.' };
    }
    await prisma.contactRule.delete({ where: { id } });
    await logActivity('RULE_DELETE', `Smazáno pravidlo pro značku: ${rule.brandPattern || 'výchozí'}`);
    revalidatePath('/settings');
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting contact rule:', error);
    return { success: false, error: error.message || 'Nepodařilo se smazat pravidlo.' };
  }
}

export async function applyContactRulesToAllProducts() {
  await assertAuthenticated(true);
  try {
    const rules = await getContactRules();
    const products = await prisma.product.findMany();
    
    let updatedCount = 0;
    for (const product of products) {
      const contactText = resolveContactTextForBrand(product.brand, rules);
      
      let safetyText = product.safetyText;
      if (isValEmpty(safetyText)) {
        safetyText = resolveSafetyTextForBrand(product.brand, rules);
      }

      await prisma.product.update({
        where: { id: product.id },
        data: { 
          contactText,
          safetyText
        }
      });
      updatedCount++;
    }
    
    revalidatePath('/products');
    revalidatePath('/');
    return { success: true, updatedCount };
  } catch (error: any) {
    console.error('Error applying contact rules to all products:', error);
    return { success: false, error: error.message || 'Nepodařilo se uplatnit pravidla na produkty.' };
  }
}

// Keep backward compatibility with old action
export async function updateContactTextByBrand() {
  await assertAuthenticated(true);
  return applyContactRulesToAllProducts();
}

export async function applyContactRulesToBatch(
  productIds: string[],
  options?: { overwriteContacts?: boolean; overwriteSafety?: boolean }
) {
  await assertAuthenticated(true);
  try {
    const rules = await getContactRules();
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } }
    });
    
    for (const product of products) {
      let contactText = product.contactText;
      if (options?.overwriteContacts || isValEmpty(contactText)) {
        contactText = resolveContactTextForBrand(product.brand, rules);
      }
      
      let safetyText = product.safetyText;
      if (options?.overwriteSafety || isValEmpty(safetyText)) {
        safetyText = resolveSafetyTextForBrand(product.brand, rules);
      }

      await prisma.product.update({
        where: { id: product.id },
        data: { 
          contactText,
          safetyText
        }
      });
    }
    
    revalidatePath('/products');
    revalidatePath('/');
    return { success: true, updatedCount: products.length };
  } catch (error: any) {
    console.error('Error applying contact rules to batch:', error);
    return { success: false, error: error.message || 'Nepodařilo se uplatnit pravidla na dávku produktů.', updatedCount: 0 };
  }
}
