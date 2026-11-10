import { prisma } from '@/lib/db';
import { Product, ContactRule, PendingProductApproval } from '@prisma/client';
import { fetchAndParseShoptetFeed, FeedProductItem } from './importers/ShoptetFeedParser';
import { logActivity } from '@/app/actions';

const DEFAULT_FEED_URL =
  'https://www.depilujeme.cz/export/products.xls?patternId=177&stripTags=1&partnerId=8&hash=bd7ec2786770a3a07fbc0289e88b5bd42a24c36accfad326881f45d72ecbc724';

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
        cronSecret: 'shoptet-feed-sync-secret',
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

function resolveContactTextForBrand(brand: string | null | undefined, rules: any[]) {
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

function resolveSafetyTextForBrand(brand: string | null | undefined, rules: any[]) {
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

  // Nastavíme status na running
  await prisma.feedConfig.update({
    where: { id: config.id },
    data: { syncStatus: 'running', syncMessage: 'Probíhá stahování a zpracování feedu...' },
  });

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

      const existing = existingMap.get(item.sku);
      const isEanInvalid =
        config.checkEanValidity && item.ean && item.ean.length !== 13 && !/^\d{8}$/.test(item.ean);

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
        const changes: { field: string; from: any; to: any }[] = [];
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

        if (config.autoApplySafe && !isSuspicious) {
          // Bezpečná aktualizace -> rovnou aplikujeme
          const newBrand = item.brand ?? existing.brand;
          const contactText = existing.contactText || resolveContactTextForBrand(newBrand, rules);
          const safetyText = existing.safetyText || resolveSafetyTextForBrand(newBrand, rules);

          productsToUpdate.push({
            id: existing.id,
            data: {
              name: item.name,
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
            brand: item.brand ?? existing.brand,
            price: item.price ?? existing.price,
            ean: item.ean ?? existing.ean,
            note: item.note ?? existing.note,
            oldData: JSON.stringify({
              name: existing.name,
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

    // Provedeme zápisy do databáze v bezpečných dávkách (SQLite parametr limit)
    const CHUNK_SIZE = 100;
    for (let i = 0; i < productsToCreate.length; i += CHUNK_SIZE) {
      const chunk = productsToCreate.slice(i, i + CHUNK_SIZE);
      await prisma.product.createMany({
        data: chunk,
      });
    }

    // Aktualizace v menších paralelních dávkách pro maximální rychlost
    const UPDATE_BATCH = 50;
    for (let i = 0; i < productsToUpdate.length; i += UPDATE_BATCH) {
      const batch = productsToUpdate.slice(i, i + UPDATE_BATCH);
      await Promise.all(
        batch.map((updateItem) =>
          prisma.product.update({
            where: { id: updateItem.id },
            data: updateItem.data,
          })
        )
      );
    }

    // Uložíme položky ke schválení v dávkách
    for (let i = 0; i < approvalsToUpsert.length; i += UPDATE_BATCH) {
      const batch = approvalsToUpsert.slice(i, i + UPDATE_BATCH);
      await Promise.all(
        batch.map((app) =>
          prisma.pendingProductApproval.upsert({
            where: { sku: app.sku },
            update: {
              name: app.name,
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
 * Schválí konkrétní položku z fronty a zapíše ji do tabulky Product.
 * Umožňuje volitelně předat upravené hodnoty (overrides).
 */
export async function approvePendingProduct(
  id: string,
  overrides?: {
    name?: string;
    brand?: string;
    price?: number;
    ean?: string;
  }
) {
  try {
    const item = await prisma.pendingProductApproval.findUnique({
      where: { id },
    });
    if (!item) {
      return { success: false, error: 'Položka ke schválení nebyla nalezena.' };
    }

    const rules = await prisma.contactRule.findMany();
    const finalName = overrides?.name?.trim() || item.name;
    const finalBrand = overrides?.brand !== undefined ? overrides.brand.trim() || null : item.brand;
    const finalPrice = overrides?.price !== undefined ? overrides.price : item.price;
    const finalEan = overrides?.ean !== undefined ? overrides.ean.trim() || null : item.ean;

    const contactText = item.contactText || resolveContactTextForBrand(finalBrand, rules);
    const safetyText = item.safetyText || resolveSafetyTextForBrand(finalBrand, rules);

    await prisma.product.upsert({
      where: { sku: item.sku },
      update: {
        name: finalName,
        brand: finalBrand,
        price: finalPrice,
        ean: finalEan,
        note: item.note,
        contactText: contactText || undefined,
        safetyText: safetyText || undefined,
      },
      create: {
        sku: item.sku,
        name: finalName,
        brand: finalBrand,
        price: finalPrice,
        ean: finalEan,
        note: item.note,
        contactText: contactText || null,
        safetyText: safetyText || null,
      },
    });

    // Odstraníme položku ze schvalovací fronty
    await prisma.pendingProductApproval.delete({
      where: { id },
    });

    // Zkontrolujeme, zda nezůstala fronta prázdná - pokud ano, aktualizujeme status feedu na success
    const remainingCount = await prisma.pendingProductApproval.count({ where: { status: 'pending' } });
    if (remainingCount === 0) {
      const cfg = await getFeedConfig();
      await prisma.feedConfig.update({
        where: { id: cfg.id },
        data: {
          syncStatus: 'success',
          syncMessage: 'Všechny změny z feedu byly schváleny a zpracovány.',
        },
      });
    }

    await logActivity('APPROVAL_APPROVED', `Schválen produkt SKU: ${item.sku} (${finalName})`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Chyba při schvalování položky.' };
  }
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
    const where = ids && ids.length > 0 ? { id: { in: ids }, status: 'pending' } : { status: 'pending' };
    const items = await prisma.pendingProductApproval.findMany({ where });

    if (items.length === 0) {
      return { success: true, count: 0 };
    }

    const rules = await prisma.contactRule.findMany();

    for (const item of items) {
      const contactText = item.contactText || resolveContactTextForBrand(item.brand, rules);
      const safetyText = item.safetyText || resolveSafetyTextForBrand(item.brand, rules);

      await prisma.product.upsert({
        where: { sku: item.sku },
        update: {
          name: item.name,
          brand: item.brand,
          price: item.price,
          ean: item.ean,
          note: item.note,
          contactText: contactText || undefined,
          safetyText: safetyText || undefined,
        },
        create: {
          sku: item.sku,
          name: item.name,
          brand: item.brand,
          price: item.price,
          ean: item.ean,
          note: item.note,
          contactText: contactText || null,
          safetyText: safetyText || null,
        },
      });
    }

    await prisma.pendingProductApproval.deleteMany({
      where: { id: { in: items.map((i: PendingProductApproval) => i.id) } },
    });

    const remainingCount = await prisma.pendingProductApproval.count({ where: { status: 'pending' } });
    if (remainingCount === 0) {
      const cfg = await getFeedConfig();
      await prisma.feedConfig.update({
        where: { id: cfg.id },
        data: {
          syncStatus: 'success',
          syncMessage: 'Všechny čekající položky byly schváleny a zapsány do katalogu.',
        },
      });
    }

    await logActivity('APPROVAL_BULK_APPROVED', `Hromadně schváleno ${items.length} produktů`);
    return { success: true, count: items.length };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Chyba při hromadném schvalování.' };
  }
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
