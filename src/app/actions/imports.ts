'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { validateProductInput } from '@/lib/inputValidation';
import { logActivity } from '@/lib/activity';
import { assertAuthenticated } from '@/lib/auth';
import { getContactRules } from './contacts';
import { isValEmpty, getMergedValue, resolveContactTextForBrand, resolveSafetyTextForBrand } from '@/lib/productText';

export async function saveImportedProducts(
  products: {
    sku: string;
    name: string;
    description?: string;
    brand?: string;
    price?: number;
    safetyText?: string;
    contactText?: string;
    ean?: string;
    note?: string;
  }[],
  overwriteConfig?: {
    name?: boolean;
    description?: boolean;
    brand?: boolean;
    price?: boolean;
    safetyText?: boolean;
    contactText?: boolean;
    ean?: boolean;
    note?: boolean;
  }
) {
  await assertAuthenticated();
  try {
    if (!Array.isArray(products) || products.length > 10000) throw new Error('Import může obsahovat nejvýše 10000 produktů.');
    products = products.map(validateProductInput);
    if (new Set(products.map(p => p.sku)).size !== products.length) throw new Error('Soubor obsahuje duplicitní SKU. Opravte jej před importem.');
    let importedCount = 0;
    let updatedCount = 0;
    const rules = await getContactRules();
    const { stripHtmlToPlainText } = await import('@/lib/safetyClassifier');

    // Fetch all products that match imported SKUs in one query (to be fast)
    const skus = products.map(p => p.sku).filter(Boolean);
    const existingProducts = await prisma.product.findMany({
      where: { sku: { in: skus } }
    });

    const existingMap = new Map(existingProducts.map(p => [p.sku, p]));

    // Use a transaction or single operations to upsert
    await prisma.$transaction(async tx => {
    for (const p of products) {
      if (!p.sku || !p.name) continue; // Skip invalid rows

      const cleanedDesc = p.description ? stripHtmlToPlainText(p.description, 4000) : '';
      const existing = existingMap.get(p.sku);

      if (existing) {
        const shouldOverwriteName = overwriteConfig?.name !== false;
        const shouldOverwriteDescription = overwriteConfig?.description !== false;
        const shouldOverwriteBrand = overwriteConfig?.brand !== false;
        const shouldOverwritePrice = overwriteConfig?.price !== false;
        const shouldOverwriteSafety = overwriteConfig?.safetyText !== false;
        const shouldOverwriteContact = overwriteConfig?.contactText !== false;
        const shouldOverwriteEan = overwriteConfig?.ean !== false;
        const shouldOverwriteNote = overwriteConfig?.note !== false;

        const name = shouldOverwriteName ? getMergedValue(p.name, existing.name) : existing.name;
        const description = shouldOverwriteDescription
          ? getMergedValue(cleanedDesc || null, existing.description)
          : existing.description;
        const brand = shouldOverwriteBrand ? getMergedValue(p.brand, existing.brand) : existing.brand;
        const price = shouldOverwritePrice ? getMergedValue(p.price, existing.price) : existing.price;
        
        let safetyText = existing.safetyText || '';
        if (shouldOverwriteSafety) {
          if (isValEmpty(safetyText)) {
            safetyText = !isValEmpty(p.safetyText)
              ? p.safetyText!
              : resolveSafetyTextForBrand(brand, rules);
          } else {
            if (!isValEmpty(p.safetyText)) {
              safetyText = p.safetyText!;
            }
          }
        }
        
        let contactText = existing.contactText || '';
        if (shouldOverwriteContact) {
          if (isValEmpty(contactText)) {
            contactText = !isValEmpty(p.contactText)
              ? p.contactText!
              : resolveContactTextForBrand(brand, rules);
          } else {
            if (!isValEmpty(p.contactText)) {
              contactText = p.contactText!;
            }
          }
        }

        const ean = shouldOverwriteEan ? getMergedValue(p.ean, existing.ean) : existing.ean;
        const note = shouldOverwriteNote ? getMergedValue(p.note, existing.note) : existing.note;

        // Check if anything actually changed compared to the database record
        const hasChanges = 
          name !== existing.name ||
          (description || null) !== (existing.description || null) ||
          brand !== existing.brand ||
          price !== existing.price ||
          safetyText !== existing.safetyText ||
          contactText !== existing.contactText ||
          ean !== existing.ean ||
          note !== existing.note;

        if (hasChanges) {
          await tx.product.update({
            where: { sku: p.sku, updatedAt: existing.updatedAt },
            data: {
              name,
              description: description || null,
              brand,
              price,
              safetyText,
              contactText,
              ean,
              note,
            },
          });
          updatedCount++;
        }
      } else {
        const brand = p.brand || '';
        const resolvedContact = p.contactText?.trim()
          ? p.contactText
          : resolveContactTextForBrand(brand, rules);

        const resolvedSafety = p.safetyText?.trim()
          ? p.safetyText
          : resolveSafetyTextForBrand(brand, rules);

        await tx.product.create({
          data: {
            sku: p.sku,
            name: p.name,
            description: cleanedDesc || null,
            brand: brand,
            price: p.price || null,
            safetyText: resolvedSafety,
            contactText: resolvedContact,
            ean: p.ean || '',
            note: p.note || '',
          },
        });
        importedCount++;
      }
    }

    }, { timeout: 60000 });

    await logActivity('PRODUCT_IMPORT', `Importováno/aktualizováno ${importedCount + updatedCount} produktů (Nové: ${importedCount}, Upravené: ${updatedCount})`);
    revalidatePath('/products');
    revalidatePath('/');
    return { success: true, importedCount, updatedCount };
  } catch (error: any) {
    console.error('Error saving imported products:', error);
    return { success: false, error: error.message || 'Chyba při ukládání importovaných produktů do databáze.' };
  }
}

export interface ImportProductInput {
  sku: string;
  name: string;
  description?: string;
  brand?: string;
  price?: number;
  safetyText?: string;
  contactText?: string;
  ean?: string;
  note?: string;
}

export async function analyzeImportedProducts(products: ImportProductInput[]) {
  await assertAuthenticated();
  try {
    const newProducts: ImportProductInput[] = [];
    const updatedProducts: {
      sku: string;
      name: string;
      description?: string;
      brand?: string;
      price?: number;
      safetyText?: string;
      contactText?: string;
      ean?: string;
      note?: string;
      existingProduct: any;
      changes: { field: string; from: any; to: any }[];
      isSignificantPriceChange: boolean;
    }[] = [];
    let unchangedCount = 0;
    
    const warnings: {
      sku: string;
      name: string;
      type: 'price_jump' | 'invalid_ean' | 'missing_fields';
      message: string;
    }[] = [];

    // Load contact rules to check auto contact text
    const rules = await getContactRules();
    const { stripHtmlToPlainText } = await import('@/lib/safetyClassifier');

    // Fetch all products that match imported SKUs in one query (to be fast)
    const skus = products.map(p => p.sku).filter(Boolean);
    const existingProducts = await prisma.product.findMany({
      where: { sku: { in: skus } }
    });

    const existingMap = new Map(existingProducts.map(p => [p.sku, p]));

    for (const p of products) {
      if (!p.sku || !p.name) continue;

      const cleanedDesc = p.description ? stripHtmlToPlainText(p.description, 4000) : '';
      const existing = existingMap.get(p.sku);

      if (!existing) {
        newProducts.push({ ...p, description: cleanedDesc || undefined });
        
        // Warnings for new products
        if (p.ean && p.ean.length !== 13) {
          warnings.push({
            sku: p.sku,
            name: p.name,
            type: 'invalid_ean',
            message: `Neplatný formát EAN kódu ("${p.ean}"). EAN-13 by měl mít 13 číslic.`
          });
        }
      } else {
        const description = getMergedValue(cleanedDesc || null, existing.description);
        const brand = getMergedValue(p.brand, existing.brand);
        const price = getMergedValue(p.price, existing.price);
        
        let safetyText = existing.safetyText || '';
        if (isValEmpty(safetyText)) {
          safetyText = !isValEmpty(p.safetyText)
            ? p.safetyText!
            : resolveSafetyTextForBrand(brand, rules);
        } else {
          if (!isValEmpty(p.safetyText)) {
            safetyText = p.safetyText!;
          }
        }
        
        let contactText = existing.contactText || '';
        if (isValEmpty(contactText)) {
          contactText = !isValEmpty(p.contactText)
            ? p.contactText!
            : resolveContactTextForBrand(brand, rules);
        } else {
          if (!isValEmpty(p.contactText)) {
            contactText = p.contactText!;
          }
        }

        const ean = getMergedValue(p.ean, existing.ean);
        const note = getMergedValue(p.note, existing.note);

        const changes: { field: string; from: any; to: any }[] = [];
        
        if (p.name !== existing.name) {
          changes.push({ field: 'Název', from: existing.name, to: p.name });
        }
        if ((description || '') !== (existing.description || '')) {
          changes.push({ field: 'Popis', from: existing.description || '', to: description || '' });
        }
        if (brand !== existing.brand) {
          changes.push({ field: 'Značka', from: existing.brand, to: brand });
        }
        if (price !== existing.price) {
          changes.push({ field: 'Cena', from: existing.price, to: price });
        }
        if (safetyText !== existing.safetyText) {
          changes.push({ field: 'Bezpečnostní text', from: existing.safetyText, to: safetyText });
        }
        if (contactText !== existing.contactText) {
          changes.push({ field: 'Kontaktní údaje', from: existing.contactText, to: contactText });
        }
        if (ean !== existing.ean) {
          changes.push({ field: 'EAN', from: existing.ean, to: ean });
        }
        if (note !== existing.note) {
          changes.push({ field: 'Poznámka', from: existing.note, to: note });
        }

        if (changes.length > 0) {
          let isSignificantPriceChange = false;
          
          // Price anomaly check: if price changes by >50%
          if (price !== null && price !== undefined && existing.price !== null && existing.price > 0) {
            const ratio = price / existing.price;
            if (ratio >= 1.5 || ratio <= 0.5) {
              isSignificantPriceChange = true;
              const percent = Math.round(Math.abs(ratio - 1) * 100);
              const direction = ratio > 1 ? 'zvýšení' : 'snížení';
              warnings.push({
                sku: p.sku,
                name: p.name,
                type: 'price_jump',
                message: `Výrazná změna ceny o ${percent}% (${direction} z ${existing.price} Kč na ${price} Kč).`
              });
            }
          }

          updatedProducts.push({
            ...p,
            existingProduct: existing,
            changes,
            isSignificantPriceChange
          });
        } else {
          unchangedCount++;
        }

        // Warning for invalid EAN on updated products
        const finalEan = ean;
        if (finalEan && finalEan.length !== 13) {
          warnings.push({
            sku: p.sku,
            name: p.name,
            type: 'invalid_ean',
            message: `Neplatný formát EAN kódu ("${finalEan}"). EAN-13 by měl mít 13 číslic.`
          });
        }
      }
    }

    return {
      success: true,
      newProducts,
      updatedProducts,
      unchangedCount,
      warnings
    };
  } catch (error: any) {
    console.error('Error analyzing imported products:', error);
    return {
      success: false,
      error: error.message || 'Nepodařilo se provést analýzu importu.'
    };
  }
}
