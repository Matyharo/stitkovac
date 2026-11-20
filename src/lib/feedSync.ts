import { isValidGtin } from './gtin';
import { prisma } from '@/lib/db';
import { Product, ContactRule, PendingProductApproval, Prisma } from '@prisma/client';
import { fetchAndParseShoptetFeed, FeedProductItem } from './importers/ShoptetFeedParser';
import { validateProductInput } from './inputValidation';
import { logActivity } from '@/lib/activity';
import { randomBytes } from 'node:crypto';

const DEFAULT_FEED_URL = process.env.SHOPTET_FEED_URL || '';

export interface FeedConfigData {
  id: string;
  url: string;
  autoApplySafe: boolean;
  priceThresholdPercent: number;
  checkEanValidity: boolean;
  cronSecret: string;
  lastSyncAt: Date | null;
  syncStatus: string | null;
  syncMessage: string | null;
}

export interface SyncResult {
  success: boolean;
  totalFetched: number;
  autoCreated: number;
  autoUpdated: number;
  unchanged: number;
  pendingReview: number;
  durationMs: number;
  error?: string;
}

export async function getFeedConfig(): Promise<FeedConfigData> {
  let config = await prisma.feedConfig.findFirst();
  if (!config) {
    config = await prisma.feedConfig.create({
      data: {
        url: DEFAULT_FEED_URL,
        autoApplySafe: true,
        priceThresholdPercent: 30.0,
        checkEanValidity: true,
        cronSecret: randomBytes(32).toString('hex'),
        syncStatus: 'idle',
      },
    });
  }
  return config;
}

export async function saveFeedConfig(data: {
  url: string;
  autoApplySafe: boolean;
  priceThresholdPercent: number;
  checkEanValidity: boolean;
  cronSecret?: string;
}) {
  if (data.cronSecret && !/^[A-Za-z0-9_-]{32,128}$/.test(data.cronSecret.trim())) throw new Error('Tajný klíč musí mít 32 až 128 písmen, číslic, pomlček nebo podtržítek.');
  const current = await getFeedConfig();
  const updated = await prisma.feedConfig.update({
    where: { id: current.id },
    data: {
      url: data.url.trim() || DEFAULT_FEED_URL,
      autoApplySafe: data.autoApplySafe,
      priceThresholdPercent: Number(data.priceThresholdPercent) || 30.0,
      checkEanValidity: data.checkEanValidity,
      cronSecret: data.cronSecret?.trim() || current.cronSecret,
    },
  });

  await logActivity('FEED_CONFIG_UPDATE', `Upraveno nastavení automatického feedu (URL: ${updated.url.substring(0, 40)}...)`);
  return { success: true, config: updated };
}

// Pomocné funkce pro formátování a vyhodnocení kontaktních pravidel
function formatContactText(companyName: string, ico: string, address: string, website: string) {
  const parts: string[] = [];
  if (companyName) parts.push(companyName);
  if (ico) parts.push(`IČ: ${ico}`);
  if (address) parts.push(address);
  if (website) parts.push(website);
  return parts.join('\n');
}

function resolveContactTextForBrand(brand: string | null | undefined, rules: ContactRule[]) {
  const cleanBrand = (brand || '').trim().toLowerCase();
  const defaultRule = rules.find((r) => r.isDefault);
  const brandRules = rules.filter((r) => !r.isDefault && r.brandPattern.trim() !== '');

  for (const rule of brandRules) {
    const pattern = rule.brandPattern.trim().toLowerCase();
    if (pattern && cleanBrand.includes(pattern)) {
      const companyName = rule.companyName?.trim() || defaultRule?.companyName || '';
      const ico = rule.ico?.trim() || defaultRule?.ico || '';
      const address = rule.address?.trim() || defaultRule?.address || '';
      const website = rule.website?.trim() || defaultRule?.website || '';
      return formatContactText(companyName, ico, address, website);
    }
  }

  if (defaultRule) {
    return formatContactText(defaultRule.companyName, defaultRule.ico, defaultRule.address, defaultRule.website);
  }
  return '';
}

function resolveSafetyTextForBrand(brand: string | null | undefined, rules: ContactRule[]) {
  const cleanBrand = (brand || '').trim().toLowerCase();
  const defaultRule = rules.find((r) => r.isDefault);
  const brandRules = rules.filter((r) => !r.isDefault && r.brandPattern.trim() !== '');

  for (const rule of brandRules) {
    const pattern = rule.brandPattern.trim().toLowerCase();
    if (pattern && cleanBrand.includes(pattern)) {
      return rule.safetyText?.trim() || defaultRule?.safetyText || '';
    }
  }

  if (defaultRule) {
    return defaultRule.safetyText || '';
  }
  return '';
}

/**
 * Provede synchronizaci produktů z feedu.
 */
export async function syncProductsFromFeed(overrideUrl?: string): Promise<SyncResult> {
  const startTime = Date.now();
  const config = await getFeedConfig();
  const feedUrl = overrideUrl?.trim() || config.url;

  const lockId = randomBytes(16).toString('hex');
  const lock = await prisma.feedConfig.updateMany({ where: { id: config.id, OR: [{ lockExpiresAt: null }, { lockExpiresAt: { lt: new Date() } }] }, data: { lockId, lockExpiresAt: new Date(Date.now() + 5 * 60000), syncStatus: 'running', syncMessage: 'Probíhá synchronizace...' } });
  if (!lock.count) return { success: false, totalFetched: 0, autoCreated: 0, autoUpdated: 0, unchanged: 0, pendingReview: 0, durationMs: 0, error: 'Jiná synchronizace již běží.' };

  try {
    const parsed = await fetchAndParseShoptetFeed(feedUrl);
    if (!parsed.success || parsed.products.length === 0) {
      const err = parsed.error || 'Feed neobsahuje žádné platné produkty.';
      await prisma.feedConfig.update({
        where: { id: config.id },
        data: {
          lastSyncAt: new Date(),
          syncStatus: 'error',
          syncMessage: err,
        },
      });
      await prisma.syncLog.create({
        data: {
          status: 'error',
          errorMessage: err,
          durationMs: Date.now() - startTime,
        },
      });
      return {
        success: false,
        totalFetched: 0,
        autoCreated: 0,
        autoUpdated: 0,
        unchanged: 0,
        pendingReview: 0,
        durationMs: Date.now() - startTime,
        error: err,
      };
    }

    const fetchedProducts = parsed.products;
    if (fetchedProducts.length > 10000 || new Set(fetchedProducts.map(p => p.sku)).size !== fetchedProducts.length) throw new Error('Feed má příliš mnoho produktů nebo duplicitní SKU.');
    for (const product of fetchedProducts) validateProductInput(product);
    const rules = await prisma.contactRule.findMany();

    // Načteme všechny existující produkty z DB najednou do mapy podle SKU
    const existingProducts: Product[] = await prisma.product.findMany();
    const existingMap = new Map<string, Product>(existingProducts.map((p) => [p.sku, p]));

    // Načteme existující schválení čekající ve frontě
    const pendingList: PendingProductApproval[] = await prisma.pendingProductApproval.findMany({
      where: { status: 'pending' },
    });
    const pendingMap = new Map<string, PendingProductApproval>(pendingList.map((p) => [p.sku, p]));

    let autoCreated = 0;
    let autoUpdated = 0;
    let unchanged = 0;
    let pendingReview = 0;

    const productsToCreate: any[] = [];
    const productsToUpdate: { id: string; data: any }[] = [];
    const approvalsToUpsert: any[] = [];

    for (const item of fetchedProducts) {
      if (!item.sku || !item.name) continue;

      const itemDescription = (item.description ?? item.rawDescription)?.trim() || undefined;
      const existing = existingMap.get(item.sku);
      const isEanInvalid =
        config.checkEanValidity && item.ean && !isValidGtin(item.ean);

      if (!existing) {
        // NOVÝ PRODUKT
        const warnings: string[] = [];
        if (isEanInvalid) {
          warnings.push(`Neobvyklý EAN kód (${item.ean})`);
        }
        if (item.price === undefined || item.price <= 0) {
          warnings.push('Chybí prodejní cena');
        }

        const isSuspicious = warnings.length > 0;

        if (config.autoApplySafe && !isSuspicious) {
          // Bezpečný nový produkt -> rovnou vytvořit
          const contactText = resolveContactTextForBrand(item.brand, rules);
          const safetyText = resolveSafetyTextForBrand(item.brand, rules);

          productsToCreate.push({
            sku: item.sku,
            name: item.name,
            description: itemDescription || null,
            brand: item.brand || null,
            price: item.price ?? null,
            ean: item.ean || null,
            note: item.note || null,
            contactText: contactText || null,
            safetyText: safetyText || null,
          });
          autoCreated++;
        } else {
          // Vyžaduje schválení
          approvalsToUpsert.push({
            sku: item.sku,
            name: item.name,
            description: itemDescription || null,
            brand: item.brand || null,
            price: item.price ?? null,
            ean: item.ean || null,
            note: item.note || null,
            oldData: null,
            changes: JSON.stringify([{ field: 'Stav', from: 'Nový produkt', to: 'Vytvořit produkt' }]),
            warningType: isSuspicious ? 'suspicious_new' : 'new_product',
            warningMessage: isSuspicious
              ? warnings.join(', ')
              : 'Nový produkt nalezený ve feedu (čeká na schválení)',
            status: 'pending',
          });
          pendingReview++;
        }
      } else {
        // EXISTUJÍCÍ PRODUKT - porovnáme změny
        const changes: { field: string; from: unknown; to: unknown }[] = [];
        const warnings: string[] = [];

        // Kontrola názvu
        if (item.name && item.name.trim() !== existing.name.trim()) {
          changes.push({ field: 'Název', from: existing.name, to: item.name });
          // Změna názvu o víc než 40 % délky
          const lenDiff = Math.abs(item.name.length - existing.name.length);
          if (lenDiff > 15 || Math.min(item.name.length, existing.name.length) < 5) {
            warnings.push('Výrazná změna názvu produktu');
          }
        }

        // Kontrola popisu (uloží se i tehdy, když je popis jedinou změnou; prázdná hodnota ve feedu zachová existující popis)
        if (itemDescription && itemDescription !== (existing.description || '').trim()) {
          changes.push({
            field: 'Popis',
            from: existing.description || '(žádný)',
            to: itemDescription,
          });
        }

        // Kontrola značky
        if (item.brand && item.brand.trim() !== (existing.brand || '').trim()) {
          changes.push({ field: 'Značka', from: existing.brand || '(žádná)', to: item.brand });
        }

        // Kontrola EAN
        if (item.ean && item.ean.trim() !== (existing.ean || '').trim()) {
          changes.push({ field: 'EAN', from: existing.ean || '(žádný)', to: item.ean });
          if (isEanInvalid) {
            warnings.push(`Změněný EAN má neplatný formát (${item.ean})`);
          }
        }

        // Kontrola ceny
        if (item.price !== undefined && item.price !== null) {
          const oldPrice = existing.price || 0;
          const newPrice = item.price;
          if (Math.abs(oldPrice - newPrice) > 0.01) {
            changes.push({ field: 'Cena', from: `${oldPrice} Kč`, to: `${newPrice} Kč` });

            if (oldPrice > 0) {
              const percentDiff = Math.abs((newPrice - oldPrice) / oldPrice) * 100;
              if (percentDiff >= config.priceThresholdPercent) {
                const direction = newPrice > oldPrice ? 'nárůst' : 'pokles';
                warnings.push(`Cenový skok: ${direction} o ${Math.round(percentDiff)} % (z ${oldPrice} Kč na ${newPrice} Kč)`);
              }
            } else if (newPrice <= 0) {
              warnings.push('Nulová nebo záporná cena');
            }
          }
        }

        if (changes.length === 0) {
          unchanged++;
          continue;
        }

        const isSuspicious = warnings.length > 0;
        const mergedDescription = itemDescription || existing.description || null;

        if (config.autoApplySafe && !isSuspicious) {
          // Bezpečná aktualizace -> rovnou aplikujeme
          const newBrand = item.brand ?? existing.brand;
          const contactText = existing.contactText || resolveContactTextForBrand(newBrand, rules);
          const safetyText = existing.safetyText || resolveSafetyTextForBrand(newBrand, rules);

          productsToUpdate.push({
            id: existing.id,
            data: {
              name: item.name,
              description: mergedDescription,
              brand: newBrand || null,
              price: item.price ?? existing.price,
              ean: item.ean ?? existing.ean,
              note: item.note ?? existing.note,
              contactText: contactText || null,
              safetyText: safetyText || null,
            },
          });
          autoUpdated++;
        } else {
          // Podezřelá změna nebo vyžaduje schválení -> uložíme do PendingProductApproval
          approvalsToUpsert.push({
            sku: item.sku,
            name: item.name,
            description: mergedDescription,
            brand: item.brand ?? existing.brand,
            price: item.price ?? existing.price,
            ean: item.ean ?? existing.ean,
            note: item.note ?? existing.note,
            oldData: JSON.stringify({
              name: existing.name,
              description: existing.description,
              brand: existing.brand,
              price: existing.price,
              ean: existing.ean,
              safetyText: existing.safetyText,
              contactText: existing.contactText,
            }),
            changes: JSON.stringify(changes),
            warningType: isSuspicious ? 'price_jump' : 'manual_review',
            warningMessage: isSuspicious
              ? warnings.join(' | ')
              : `Zjištěno ${changes.length} změn k posouzení`,
            status: 'pending',
          });
          pendingReview++;
        }
      }
    }

    await prisma.$transaction(async tx => {
    // Provedeme zápisy do databáze v bezpečných dávkách (SQLite parametr limit)
    const CHUNK_SIZE = 100;
    for (let i = 0; i < productsToCreate.length; i += CHUNK_SIZE) {
      const chunk = productsToCreate.slice(i, i + CHUNK_SIZE);
      await tx.product.createMany({
        data: chunk,
      });
    }

    // Aktualizace v menších paralelních dávkách pro maximální rychlost
    const UPDATE_BATCH = 50;
    for (let i = 0; i < productsToUpdate.length; i += UPDATE_BATCH) {
      const batch = productsToUpdate.slice(i, i + UPDATE_BATCH);
      const results = await Promise.all(
        batch.map((updateItem) =>
          tx.product.updateMany({
            where: { id: updateItem.id, updatedAt: existingProducts.find(p => p.id === updateItem.id)!.updatedAt },
            data: updateItem.data,
          })
        )
      );
      if (results.some(result => !result.count)) throw new Error('Produkt byl během synchronizace upraven. Spusťte nový náhled/synchronizaci.');
    }

    // Uložíme položky ke schválení v dávkách
    for (let i = 0; i < approvalsToUpsert.length; i += UPDATE_BATCH) {
      const batch = approvalsToUpsert.slice(i, i + UPDATE_BATCH);
      await Promise.all(
        batch.map((app) =>
          tx.pendingProductApproval.upsert({
            where: { sku: app.sku },
            update: {
              name: app.name,
              description: app.description,
              brand: app.brand,
              price: app.price,
              ean: app.ean,
              note: app.note,
              oldData: app.oldData,
              changes: app.changes,
              warningType: app.warningType,
              warningMessage: app.warningMessage,
              status: 'pending',
            },
            create: app,
          })
        )
      );
    }

    }, { timeout: 60000 });

    const durationMs = Date.now() - startTime;
    const summaryMsg = `Synchronizace dokončena za ${(durationMs / 1000).toFixed(1)}s: ${autoCreated} nových, ${autoUpdated} aktualizováno, ${pendingReview} vyžaduje schválení, ${unchanged} beze změny (celkem ${fetchedProducts.length}).`;

    await prisma.feedConfig.update({
      where: { id: config.id },
      data: {
        lastSyncAt: new Date(),
        syncStatus: pendingReview > 0 ? 'warning' : 'success',
        syncMessage: summaryMsg,
      },
    });

    await prisma.syncLog.create({
      data: {
        status: pendingReview > 0 ? 'warning' : 'success',
        totalFetched: fetchedProducts.length,
        autoCreated,
        autoUpdated,
        pendingReview,
        unchanged,
        durationMs,
      },
    });

    await logActivity(
      'FEED_SYNC',
      `Synchronizace feedu: +${autoCreated} nových, ↻${autoUpdated} upraveno, ⚠️${pendingReview} ke schválení`
    );

    return {
      success: true,
      totalFetched: fetchedProducts.length,
      autoCreated,
      autoUpdated,
      unchanged,
      pendingReview,
      durationMs,
    };
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    const errMsg = error?.message || 'Neočekávaná chyba při synchronizaci feedu.';

    await prisma.feedConfig.update({
      where: { id: config.id },
      data: {
        lastSyncAt: new Date(),
        syncStatus: 'error',
        syncMessage: errMsg,
      },
    });

    await prisma.syncLog.create({
      data: {
        status: 'error',
        errorMessage: errMsg,
        durationMs,
      },
    });

    return {
      success: false,
      totalFetched: 0,
      autoCreated: 0,
      autoUpdated: 0,
      unchanged: 0,
      pendingReview: 0,
      durationMs,
      error: errMsg,
    };
  } finally {
    await prisma.feedConfig.updateMany({ where: { id: config.id, lockId }, data: { lockId: null, lockExpiresAt: null } });
  }

}

/**
 * Získá položky čekající na schválení.
 */
export async function getPendingApprovals() {
  return await prisma.pendingProductApproval.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Vrátí počet položek čekajících na schválení.
 */
export async function getPendingApprovalsCount(): Promise<number> {
  return await prisma.pendingProductApproval.count({
    where: { status: 'pending' },
  });
}

/**
 * Pomocná funkce pro bezpečné určení safetyText a contactText při schválení položky z fronty.
 * Zabraňuje tomu, aby dříve vytvořená položka ve frontě schvalování při pozdějším schválení
 * přepsala novější ručně uložený bezpečnostní text v tabulce Product starou kopií nebo výchozím pravidlem.
 */
function resolveTextsForApprovedItem(
  item: PendingProductApproval,
  existingProduct: Product | null,
  finalBrand: string | null,
  rules: ContactRule[]
): { safetyText: string | null; contactText: string | null } {
  let oldSafetySnapshot: string | null = null;
  let oldContactSnapshot: string | null = null;
  if (item.oldData) {
    try {
      const parsed = JSON.parse(item.oldData) as { safetyText?: string | null; contactText?: string | null };
      if (parsed && typeof parsed.safetyText === 'string') {
        oldSafetySnapshot = parsed.safetyText;
      }
      if (parsed && typeof parsed.contactText === 'string') {
        oldContactSnapshot = parsed.contactText;
      }
    } catch {
      // ignore invalid JSON in oldData
    }
  }

  const currentDbSafety = existingProduct?.safetyText?.trim() || '';
  const pendingSafety = item.safetyText?.trim() || '';
  let safetyText: string | null;

  if (existingProduct) {
    // Pokud byl safetyText v DB mezitím ručně změněn oproti stavu při zařazení do fronty,
    // nebo pokud již v DB existuje vyplněný safetyText, zachováme hodnotu z DB.
    if (currentDbSafety) {
      safetyText = existingProduct.safetyText;
    } else if (pendingSafety && pendingSafety !== (oldSafetySnapshot || '').trim()) {
      safetyText = pendingSafety;
    } else {
      safetyText = resolveSafetyTextForBrand(finalBrand, rules) || null;
    }
  } else {
    safetyText = pendingSafety || resolveSafetyTextForBrand(finalBrand, rules) || null;
  }

  const currentDbContact = existingProduct?.contactText?.trim() || '';
  const pendingContact = item.contactText?.trim() || '';
  let contactText: string | null;

  if (existingProduct) {
    if (currentDbContact) {
      contactText = existingProduct.contactText;
    } else if (pendingContact && pendingContact !== (oldContactSnapshot || '').trim()) {
      contactText = pendingContact;
    } else {
      contactText = resolveContactTextForBrand(finalBrand, rules) || null;
    }
  } else {
    contactText = pendingContact || resolveContactTextForBrand(finalBrand, rules) || null;
  }

  return { safetyText, contactText };
}

/**
 * Schválí konkrétní položku z fronty a zapíše ji do tabulky Product.
 * Umožňuje volitelně předat upravené hodnoty (overrides).
 */
type ApprovalOverrides = { name?: string; description?: string; brand?: string; price?: number; ean?: string };
async function approveWithinTransaction(tx: Prisma.TransactionClient, id: string, overrides?: ApprovalOverrides) {
  const item = await tx.pendingProductApproval.findUnique({ where: { id } });
  if (!item || item.status !== 'pending') throw new Error('Položka již byla zpracována. Obnovte frontu.');
  const existing = await tx.product.findUnique({ where: { sku: item.sku } });
  const rules = await tx.contactRule.findMany();
  const data = validateProductInput({
    sku: item.sku, name: overrides?.name?.trim() || item.name,
    description: overrides?.description !== undefined ? overrides.description.trim() || null : item.description || existing?.description || null,
    brand: overrides?.brand !== undefined ? overrides.brand.trim() || null : item.brand,
    price: overrides?.price !== undefined ? overrides.price : item.price,
    ean: overrides?.ean !== undefined ? overrides.ean.trim() || null : item.ean,
    note: item.note ?? existing?.note ?? null,
  });
  if (existing && item.oldData) {
    const old = JSON.parse(item.oldData) as Record<string, unknown>;
    for (const field of ['name','description','brand','price','ean'] as const) {
      if (field in old && (existing[field] ?? null) !== (old[field] ?? null) && (data[field] ?? null) !== (existing[field] ?? null)) {
        throw new Error('Produkt byl po vytvoření návrhu ručně upraven. Znovu synchronizujte feed a posuďte aktuální změny.');
      }
    }
  }
  const texts = resolveTextsForApprovedItem(item, existing, data.brand, rules);
  if (existing) await tx.product.update({ where: { id: existing.id, updatedAt: existing.updatedAt }, data: { ...data, ...texts } });
  else await tx.product.create({ data: { ...data, ...texts } });
  await tx.pendingProductApproval.delete({ where: { id, updatedAt: item.updatedAt } });
}
export async function approvePendingProduct(id: string, overrides?: ApprovalOverrides) {
  try {
    await prisma.$transaction(tx => approveWithinTransaction(tx, id, overrides));
    await logActivity('APPROVAL_APPROVED', `Schválena položka ${id}`);
    return { success: true };
  } catch (error: unknown) { return { success: false, error: error instanceof Error ? error.message : 'Schválení se nezdařilo.' }; }
}

/**
 * Odmítne položku z fronty ke schválení.
 */
export async function rejectPendingProduct(id: string) {
  try {
    const item = await prisma.pendingProductApproval.findUnique({
      where: { id },
    });
    if (!item) {
      return { success: false, error: 'Položka nebyla nalezena.' };
    }

    await prisma.pendingProductApproval.delete({
      where: { id },
    });

    const remainingCount = await prisma.pendingProductApproval.count({ where: { status: 'pending' } });
    if (remainingCount === 0) {
      const cfg = await getFeedConfig();
      await prisma.feedConfig.update({
        where: { id: cfg.id },
        data: {
          syncStatus: 'success',
          syncMessage: 'Všechny čekající položky byly zpracovány.',
        },
      });
    }

    await logActivity('APPROVAL_REJECTED', `Odmítnuta změna pro SKU: ${item.sku} (${item.name})`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Chyba při odmítnutí položky.' };
  }
}

/**
 * Hromadné schválení položek.
 */
export async function approveAllPendingProducts(ids?: string[]) {
  try {
    const count = await prisma.$transaction(async tx => {
      const items = await tx.pendingProductApproval.findMany({ where: { status: 'pending', ...(ids?.length ? { id: { in: ids } } : {}) }, select: { id: true } });
      for (const item of items) await approveWithinTransaction(tx, item.id);
      return items.length;
    }, { timeout: 60000 });
    await logActivity('APPROVAL_BULK_APPROVED', `Hromadně schváleno ${count} položek`);
    return { success: true, count };
  } catch (error: unknown) { return { success: false, error: error instanceof Error ? error.message : 'Schválení se nezdařilo.' }; }
}

/**
 * Hromadné odmítnutí položek.
 */
export async function rejectAllPendingProducts(ids?: string[]) {
  try {
    const where = ids && ids.length > 0 ? { id: { in: ids }, status: 'pending' } : { status: 'pending' };
    const res = await prisma.pendingProductApproval.deleteMany({ where });

    const remainingCount = await prisma.pendingProductApproval.count({ where: { status: 'pending' } });
    if (remainingCount === 0) {
      const cfg = await getFeedConfig();
      await prisma.feedConfig.update({
        where: { id: cfg.id },
        data: {
          syncStatus: 'success',
          syncMessage: 'Čekající změny byly odmítnuty.',
        },
      });
    }

    await logActivity('APPROVAL_BULK_REJECTED', `Hromadně odmítnuto ${res.count} položek`);
    return { success: true, count: res.count };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Chyba při hromadném odmítání.' };
  }
}

/**
 * Vrátí historii běhů synchronizací.
 */
export async function getSyncLogs(limit: number = 10) {
  return await prisma.syncLog.findMany({
    take: limit,
    orderBy: { createdAt: 'desc' },
  });
}
