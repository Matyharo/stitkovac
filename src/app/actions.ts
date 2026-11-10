'use strict';
'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import crypto from 'crypto';

// --- AUTH UTILS ---
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return verifyHash === hash;
}

export async function logActivity(action: string, details: string) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('auth_session')?.value;
    let username = 'neznámý';

    if (sessionCookie) {
      try {
        const decoded = JSON.parse(sessionCookie);
        if (decoded.username) {
          username = decoded.username;
        }
      } catch {
        if (sessionCookie === 'authenticated_true') {
          username = 'admin';
        }
      }
    }

    await prisma.activityLog.create({
      data: {
        username,
        action,
        details,
      },
    });
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
}

// --- PRODUCTS ACTIONS ---

export async function getProducts(search?: string) {
  try {
    if (!search || search.trim() === '') {
      return await prisma.product.findMany({
        orderBy: { updatedAt: 'desc' },
      });
    }

    const query = `%${search.trim()}%`;
    return await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "Product" WHERE "name" LIKE ? OR "sku" LIKE ? OR "brand" LIKE ? OR "ean" LIKE ? ORDER BY "updatedAt" DESC`,
      query, query, query, query
    );
  } catch (error) {
    console.error('Error fetching products:', error);
    return [];
  }
}

export async function getProductById(id: string) {
  try {
    return await prisma.product.findUnique({
      where: { id },
    });
  } catch (error) {
    console.error(`Error fetching product by ID ${id}:`, error);
    return null;
  }
}

export async function updateProduct(id: string, data: {
  sku: string;
  name: string;
  brand?: string | null;
  price?: number | null;
  safetyText?: string | null;
  contactText?: string | null;
  ean?: string | null;
  note?: string | null;
}) {
  try {
    const rules = await getContactRules();
    const contactText = data.contactText?.trim()
      ? data.contactText
      : resolveContactTextForBrand(data.brand, rules);

    const existingProduct = await prisma.product.findUnique({ where: { id } });
    let safetyText = data.safetyText?.trim();
    if (!safetyText) {
      if (!existingProduct?.safetyText?.trim()) {
        safetyText = resolveSafetyTextForBrand(data.brand, rules);
      } else {
        safetyText = existingProduct.safetyText;
      }
    }

    const updated = await prisma.product.update({
      where: { id },
      data: {
        ...data,
        contactText,
        safetyText,
      },
    });
    await logActivity('PRODUCT_UPDATE', `Upraven produkt SKU: ${updated.sku} (Název: ${updated.name})`);
    revalidatePath('/products');
    revalidatePath('/');
    return { success: true, product: updated };
  } catch (error: any) {
    console.error(`Error updating product ${id}:`, error);
    return { success: false, error: error.message || 'Nepodařilo se aktualizovat produkt.' };
  }
}

export async function deleteProduct(id: string) {
  try {
    const product = await prisma.product.findUnique({ where: { id } });
    await prisma.product.delete({
      where: { id },
    });
    if (product) {
      await logActivity('PRODUCT_DELETE', `Smazán produkt SKU: ${product.sku} (Název: ${product.name})`);
    } else {
      await logActivity('PRODUCT_DELETE', `Smazán produkt ID: ${id}`);
    }
    revalidatePath('/products');
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error(`Error deleting product ${id}:`, error);
    return { success: false, error: error.message || 'Nepodařilo se smazat produkt.' };
  }
}

export async function deleteProducts(ids: string[]) {
  try {
    const products = await prisma.product.findMany({ where: { id: { in: ids } } });
    await prisma.product.deleteMany({
      where: {
        id: { in: ids },
      },
    });
    const skus = products.map(p => p.sku).join(', ');
    await logActivity('PRODUCT_DELETE_MANY', `Hromadně smazány produkty SKU: ${skus}`);
    revalidatePath('/products');
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error(`Error deleting products:`, error);
    return { success: false, error: error.message || 'Nepodařilo se smazat vybrané produkty.' };
  }
}

export async function createProduct(data: {
  sku: string;
  name: string;
  brand?: string | null;
  price?: number | null;
  safetyText?: string | null;
  contactText?: string | null;
  ean?: string | null;
  note?: string | null;
}) {
  try {
    const rules = await getContactRules();
    const contactText = data.contactText?.trim()
      ? data.contactText
      : resolveContactTextForBrand(data.brand, rules);

    const safetyText = data.safetyText?.trim()
      ? data.safetyText
      : resolveSafetyTextForBrand(data.brand, rules);

    const created = await prisma.product.create({
      data: {
        ...data,
        contactText,
        safetyText,
      },
    });
    await logActivity('PRODUCT_CREATE', `Vytvořen produkt SKU: ${created.sku} (Název: ${created.name})`);
    revalidatePath('/products');
    revalidatePath('/');
    return { success: true, product: created };
  } catch (error: any) {
    console.error('Error creating product:', error);
    if (error.code === 'P2002') {
      return { success: false, error: 'Produkt s tímto SKU již existuje.' };
    }
    return { success: false, error: error.message || 'Nepodařilo se vytvořit produkt.' };
  }
}
function isValEmpty(val: any): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string' && val.trim() === '') return true;
  if (typeof val === 'number' && isNaN(val)) return true;
  return false;
}

function getMergedValue<T>(newVal: T, existingVal: T): T {
  if (isValEmpty(newVal)) {
    return existingVal;
  }
  return newVal;
}

export async function saveImportedProducts(
  products: {
    sku: string;
    name: string;
    brand?: string;
    price?: number;
    safetyText?: string;
    contactText?: string;
    ean?: string;
    note?: string;
  }[],
  overwriteConfig?: {
    name?: boolean;
    brand?: boolean;
    price?: boolean;
    safetyText?: boolean;
    contactText?: boolean;
    ean?: boolean;
    note?: boolean;
  }
) {
  try {
    let importedCount = 0;
    let updatedCount = 0;
    const rules = await getContactRules();

    // Fetch all products that match imported SKUs in one query (to be fast)
    const skus = products.map(p => p.sku).filter(Boolean);
    const existingProducts = await prisma.product.findMany({
      where: { sku: { in: skus } }
    });

    const existingMap = new Map(existingProducts.map(p => [p.sku, p]));

    // Use a transaction or single operations to upsert
    for (const p of products) {
      if (!p.sku || !p.name) continue; // Skip invalid rows

      const existing = existingMap.get(p.sku);

      if (existing) {
        const shouldOverwriteName = overwriteConfig?.name !== false;
        const shouldOverwriteBrand = overwriteConfig?.brand !== false;
        const shouldOverwritePrice = overwriteConfig?.price !== false;
        const shouldOverwriteSafety = overwriteConfig?.safetyText !== false;
        const shouldOverwriteContact = overwriteConfig?.contactText !== false;
        const shouldOverwriteEan = overwriteConfig?.ean !== false;
        const shouldOverwriteNote = overwriteConfig?.note !== false;

        const name = shouldOverwriteName ? getMergedValue(p.name, existing.name) : existing.name;
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
          brand !== existing.brand ||
          price !== existing.price ||
          safetyText !== existing.safetyText ||
          contactText !== existing.contactText ||
          ean !== existing.ean ||
          note !== existing.note;

        if (hasChanges) {
          await prisma.product.update({
            where: { sku: p.sku },
            data: {
              name,
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

        await prisma.product.create({
          data: {
            sku: p.sku,
            name: p.name,
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

    await logActivity('PRODUCT_IMPORT', `Importováno/aktualizováno ${importedCount + updatedCount} produktů (Nové: ${importedCount}, Upravené: ${updatedCount})`);
    revalidatePath('/products');
    revalidatePath('/');
    return { success: true, importedCount, updatedCount };
  } catch (error: any) {
    console.error('Error saving imported products:', error);
    return { success: false, error: error.message || 'Chyba při ukládání importovaných produktů do databáze.' };
  }
}

export async function clearAllProducts() {
  try {
    await prisma.product.deleteMany({});
    await logActivity('PRODUCT_CLEAR_ALL', 'Smazána celá databáze produktů');
    revalidatePath('/products');
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error('Error clearing products database:', error);
    return { success: false, error: error.message };
  }
}


// --- TEMPLATE ACTIONS ---

export async function getTemplates() {
  try {
    let templates = await prisma.labelTemplate.findMany({
      orderBy: [
        { sortOrder: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    if (templates.length === 0) {
      // Auto-seed výchozí šablona Spoko S060630380
      const defaultFields = {
        showName: true,
        showSku: true,
        showBrand: true,
        showPrice: true,
        showSafetyText: true,
        showContactText: true,
        showEan: false,
        showNote: false,
        showSkuIcon: true,
        showSafetyIcon: true,
        showContactIcon: true,
      };

      const defaultFonts = {
        fontFamily: 'Roboto',
        nameFontSize: 9.5,
        skuFontSize: 6.5,
        brandFontSize: 7,
        priceFontSize: 11,
        bodyFontSize: 6,
        nameFontBold: true,
        priceFontBold: true,
        textAlignment: 'left',
        brandColor: '#64748b',
        nameColor: '#0f172a',
        priceColor: '#dc2626',
        bodyColor: '#334155',
      };

      const defaultLayout = {
        labelWidth: 63.5,
        labelHeight: 38.1,
        topMargin: 15.15,
        leftMargin: 7.25,
        horizontalGap: 2.5,
        verticalGap: 0,
        columns: 3,
        rows: 7,
        dualLayout: false,
        labelRotation: 0,
        customIcons: [],
      };

      const seeded = await prisma.labelTemplate.create({
        data: {
          name: 'Standardní 3×7 – 63,5×38,1 mm (výchozí)',
          fieldsConfig: JSON.stringify(defaultFields),
          fontConfig: JSON.stringify(defaultFonts),
          layoutConfig: JSON.stringify(defaultLayout),
        },
      });
      templates = [seeded];
    } else {
      // Doplnit chybějící klíče u starých šablon (zpětná kompatibilita)
      const fontDefaults: Record<string, unknown> = {
        textAlignment: 'left',
        brandColor: '#64748b',
        nameColor: '#0f172a',
        priceColor: '#dc2626',
        bodyColor: '#334155',
      };
      const fieldDefaults: Record<string, unknown> = {
        showSkuIcon: true,
        showSafetyIcon: true,
        showContactIcon: true,
      };
      const layoutDefaults: Record<string, unknown> = {
        dualLayout: false,
        labelRotation: 0,
        customIcons: [],
      };

      for (const t of templates) {
        const fonts = JSON.parse(t.fontConfig);
        const fields = JSON.parse(t.fieldsConfig);
        const layout = JSON.parse(t.layoutConfig);
        let needsUpdate = false;

        for (const [k, v] of Object.entries(fontDefaults)) {
          if (!(k in fonts)) { fonts[k] = v; needsUpdate = true; }
        }
        for (const [k, v] of Object.entries(fieldDefaults)) {
          if (!(k in fields)) { fields[k] = v; needsUpdate = true; }
        }
        for (const [k, v] of Object.entries(layoutDefaults)) {
          if (!(k in layout)) { layout[k] = v; needsUpdate = true; }
        }

        if (needsUpdate) {
          await prisma.labelTemplate.update({
            where: { id: t.id },
            data: {
              fontConfig: JSON.stringify(fonts),
              fieldsConfig: JSON.stringify(fields),
              layoutConfig: JSON.stringify(layout),
            },
          });
          t.fontConfig = JSON.stringify(fonts);
          t.fieldsConfig = JSON.stringify(fields);
          t.layoutConfig = JSON.stringify(layout);
        }
      }
    }

    return templates;
  } catch (error) {
    console.error('Error fetching templates:', error);
    return [];
  }
}

export async function getTemplateById(id: string) {
  try {
    return await prisma.labelTemplate.findUnique({
      where: { id },
    });
  } catch (error) {
    console.error(`Error fetching template by ID ${id}:`, error);
    return null;
  }
}

export async function saveTemplate(
  id: string | null,
  name: string,
  fieldsConfig: object,
  fontConfig: object,
  layoutConfig: object
) {
  try {
    const fieldsStr = JSON.stringify(fieldsConfig);
    const fontStr = JSON.stringify(fontConfig);
    const layoutStr = JSON.stringify(layoutConfig);

    let template;
    let actionType = 'TEMPLATE_CREATE';
    let detailMsg = '';
    if (id) {
      actionType = 'TEMPLATE_UPDATE';
      template = await prisma.labelTemplate.update({
        where: { id },
        data: {
          name,
          fieldsConfig: fieldsStr,
          fontConfig: fontStr,
          layoutConfig: layoutStr,
        },
      });
      detailMsg = `Upravena šablona: ${name}`;
    } else {
      template = await prisma.labelTemplate.create({
        data: {
          name,
          fieldsConfig: fieldsStr,
          fontConfig: fontStr,
          layoutConfig: layoutStr,
        },
      });
      detailMsg = `Vytvořena šablona: ${name}`;
    }

    await logActivity(actionType, detailMsg);
    revalidatePath('/templates');
    revalidatePath('/print');
    revalidatePath('/');
    return { success: true, template };
  } catch (error: any) {
    console.error('Error saving template:', error);
    return { success: false, error: error.message || 'Nepodařilo se uložit šablonu.' };
  }
}

export async function deleteTemplate(id: string) {
  try {
    const template = await prisma.labelTemplate.findUnique({ where: { id } });
    await prisma.labelTemplate.delete({
      where: { id },
    });
    if (template) {
      await logActivity('TEMPLATE_DELETE', `Smazána šablona: ${template.name}`);
    }
    revalidatePath('/templates');
    revalidatePath('/print');
    revalidatePath('/');
    return { success: true };
  } catch (error: any) {
    console.error(`Error deleting template ${id}:`, error);
    return { success: false, error: error.message || 'Nepodařilo se smazat šablonu.' };
  }
}

export async function duplicateTemplate(id: string) {
  try {
    const original = await prisma.labelTemplate.findUnique({
      where: { id },
    });
    if (!original) {
      return { success: false, error: 'Šablona nebyla nalezena.' };
    }

    const duplicated = await prisma.labelTemplate.create({
      data: {
        name: `${original.name} - kopie`,
        fieldsConfig: original.fieldsConfig,
        fontConfig: original.fontConfig,
        layoutConfig: original.layoutConfig,
      },
    });

    await logActivity('TEMPLATE_DUPLICATE', `Duplikována šablona ${original.name} jako ${duplicated.name}`);
    revalidatePath('/templates');
    revalidatePath('/print');
    revalidatePath('/');
    return { success: true, template: duplicated };
  } catch (error: any) {
    console.error('Error duplicating template:', error);
    return { success: false, error: error.message || 'Nepodařilo se duplikovat šablonu.' };
  }
}

export async function updateTemplateOrder(orderedIds: string[]) {
  try {
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.labelTemplate.update({
          where: { id },
          data: { sortOrder: index },
        })
      )
    );
    revalidatePath('/templates');
    revalidatePath('/print');
    return { success: true };
  } catch (error: any) {
    console.error('Error updating template order:', error);
    return { success: false, error: error.message || 'Nepodařilo se uložit pořadí šablon.' };
  }
}

export async function setDefaultTemplate(id: string) {
  try {
    await prisma.$transaction([
      prisma.labelTemplate.updateMany({
        data: { isDefault: false },
      }),
      prisma.labelTemplate.update({
        where: { id },
        data: { isDefault: true },
      }),
    ]);
    revalidatePath('/templates');
    revalidatePath('/print');
    return { success: true };
  } catch (error: any) {
    console.error('Error setting default template:', error);
    return { success: false, error: error.message || 'Nepodařilo se nastavit výchozí šablonu.' };
  }
}



// --- PRINT JOBS ACTIONS ---

export async function getPrintJobs() {
  try {
    return await prisma.printJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20, // Limit to last 20 jobs for display
    });
  } catch (error) {
    console.error('Error fetching print jobs:', error);
    return [];
  }
}

export async function savePrintJob(
  products: { productId: string; sku: string; name: string; price: number | null; quantity: number }[],
  startPosition: number
) {
  try {
    const job = await prisma.printJob.create({
      data: {
        products: JSON.stringify(products),
        startPosition,
      },
    });
    const totalQty = products.reduce((sum, p) => sum + p.quantity, 0);
    await logActivity('PRINT_JOB_CREATE', `Vytištěno ${totalQty} etiket, počáteční pozice: ${startPosition}`);
    revalidatePath('/');
    return { success: true, job };
  } catch (error: any) {
    console.error('Error saving print job:', error);
    return { success: false, error: error.message || 'Nepodařilo se uložit tiskovou úlohu.' };
  }
}

export async function getPrintJobById(id: string) {
  try {
    return await prisma.printJob.findUnique({
      where: { id },
    });
  } catch (error) {
    console.error(`Error fetching print job by ID ${id}:`, error);
    return null;
  }
}

export async function seedSampleProducts() {
  try {
    const samples = [
      {
        sku: 'PRD-UT-001',
        name: 'Čisticí utěrky z mikrovlákna Premium (sada 5ks)',
        brand: 'EcoClean',
        price: 189,
        safetyText: 'Nepoužívejte na horké povrchy. Udržujte mimo dosah přímého plamene.',
        contactText: 'Distributor s.r.o., Dlouhá 12, Praha',
        ean: '8594001230012',
        note: 'Bestseller'
      },
      {
        sku: 'PRD-SP-002',
        name: 'Ekologický čisticí sprej na okna a zrcadla 500ml',
        brand: 'EcoGreen',
        price: 129,
        safetyText: 'Při zasažení očí okamžitě důkladně vypláchněte vodou. Chraňte před dětmi.',
        contactText: 'Distributor s.r.o., Dlouhá 12, Praha',
        ean: '8594001230029',
        note: 'Eko produkt'
      },
      {
        sku: 'PRD-DE-003',
        name: 'Dezinfekční gel na ruce s Aloe Vera 100ml',
        brand: 'EcoCare',
        price: 59,
        safetyText: 'Hořlavá kapalina. Zamezte kontaktu s otevřeným ohněm. Pouze pro vnější použití.',
        contactText: 'Distributor s.r.o., Dlouhá 12, Praha',
        ean: '8594001230036',
        note: 'Kapesní balení'
      },
      {
        sku: 'PRD-RO-004',
        name: 'Papírové kuchyňské role 3-vrstvé (balení 4ks)',
        brand: 'EcoPaper',
        price: 79,
        safetyText: 'Skladujte v suchu. Obal zlikvidujte v rámci tříděného odpadu.',
        contactText: 'Distributor s.r.o., Dlouhá 12, Praha',
        ean: '8594001230043',
        note: 'Objemné zboží'
      },
      {
        sku: 'PRD-ME-005',
        name: 'Melaminové čistící nanohoubičky (balení 10ks)',
        brand: 'EcoClean',
        price: 99,
        safetyText: 'Nepoužívejte na kůži nebo leštěné povrchy. Může způsobit oděrky.',
        contactText: 'Distributor s.r.o., Dlouhá 12, Praha',
        ean: '8594001230050',
        note: 'Bez chemie'
      }
    ];

    let count = 0;
    for (const p of samples) {
      await prisma.product.upsert({
        where: { sku: p.sku },
        update: p,
        create: p
      });
      count++;
    }

    revalidatePath('/products');
    revalidatePath('/');
    return { success: true, count };
  } catch (error: any) {
    console.error('Error seeding sample products:', error);
    return { success: false, error: error.message || 'Nepodařilo se nahrát vzorová data.' };
  }
}

function formatContactText(companyName: string, ico: string, address: string, website: string) {
  const parts = [];
  if (companyName) parts.push(companyName.trim());
  if (ico) {
    const trimmedIco = ico.trim();
    const icoStr = trimmedIco.toLowerCase().startsWith('ičo:') ? trimmedIco : `IČO: ${trimmedIco}`;
    parts.push(icoStr);
  }
  if (address) parts.push(address.trim());
  if (website) parts.push(website.trim());
  return parts.join('\n');
}

function resolveContactTextForBrand(brand: string | null | undefined, rules: any[]) {
  const cleanBrand = (brand || '').trim().toLowerCase();
  
  const defaultRule = rules.find(r => r.isDefault);
  const brandRules = rules.filter(r => !r.isDefault && r.brandPattern.trim() !== '');
  
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
  
  // Fallback to default rule
  if (defaultRule) {
    return formatContactText(defaultRule.companyName, defaultRule.ico, defaultRule.address, defaultRule.website);
  }
  
  // Absolute fallback
  return '';
}

function resolveSafetyTextForBrand(brand: string | null | undefined, rules: any[]) {
  const cleanBrand = (brand || '').trim().toLowerCase();
  
  const defaultRule = rules.find(r => r.isDefault);
  const brandRules = rules.filter(r => !r.isDefault && r.brandPattern.trim() !== '');
  
  for (const rule of brandRules) {
    const pattern = rule.brandPattern.trim().toLowerCase();
    if (pattern && cleanBrand.includes(pattern)) {
      return rule.safetyText?.trim() || defaultRule?.safetyText || '';
    }
  }
  
  // Fallback to default rule
  if (defaultRule) {
    return defaultRule.safetyText || '';
  }
  
  // Absolute fallback
  return '';
}

export async function getContactRules() {
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
  return applyContactRulesToAllProducts();
}

export async function getProductIds() {
  try {
    const products = await prisma.product.findMany({
      select: { id: true }
    });
    return { success: true, ids: products.map(p => p.id) };
  } catch (error: any) {
    console.error('Error fetching product IDs:', error);
    return { success: false, error: error.message || 'Nepodařilo se načíst ID produktů.', ids: [] };
  }
}

export async function applyContactRulesToBatch(
  productIds: string[],
  options?: { overwriteContacts?: boolean; overwriteSafety?: boolean }
) {
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

export interface ImportProductInput {
  sku: string;
  name: string;
  brand?: string;
  price?: number;
  safetyText?: string;
  contactText?: string;
  ean?: string;
  note?: string;
}

export async function analyzeImportedProducts(products: ImportProductInput[]) {
  try {
    const newProducts: ImportProductInput[] = [];
    const updatedProducts: {
      sku: string;
      name: string;
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

    // Fetch all products that match imported SKUs in one query (to be fast)
    const skus = products.map(p => p.sku).filter(Boolean);
    const existingProducts = await prisma.product.findMany({
      where: { sku: { in: skus } }
    });

    const existingMap = new Map(existingProducts.map(p => [p.sku, p]));

    for (const p of products) {
      if (!p.sku || !p.name) continue;

      const existing = existingMap.get(p.sku);

      if (!existing) {
        newProducts.push(p);
        
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

// --- AUTH ACTIONS ---

export async function login(username: string, password: string) {
  try {
    // Normalizace stávajících uživatelských jmen v DB na malá písmena
    const allUsers = await prisma.user.findMany();
    for (const u of allUsers) {
      if (u.username !== u.username.toLowerCase()) {
        try {
          await prisma.user.update({
            where: { id: u.id },
            data: { username: u.username.toLowerCase() },
          });
        } catch (e) {
          console.error(`Failed to normalize username for ${u.username}`, e);
        }
      }
    }

    // Auto-seed default admin if table is empty
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      const defaultUsername = (process.env.BASIC_AUTH_USER || 'admin').toLowerCase().trim();
      const defaultPassword = process.env.BASIC_AUTH_PASSWORD || 'stitkovac2026';
      const hashed = await hashPassword(defaultPassword);
      await prisma.user.create({
        data: {
          username: defaultUsername,
          passwordHash: hashed,
          name: 'Administrátor',
          role: 'admin',
        },
      });
    }

    const normalizedUsername = username.toLowerCase().trim();
    const user = await prisma.user.findUnique({
      where: { username: normalizedUsername },
    });

    if (user && await verifyPassword(password, user.passwordHash)) {
      const cookieStore = await cookies();
      const sessionData = {
        username: user.username,
        name: user.name,
        role: user.role,
      };
      cookieStore.set('auth_session', JSON.stringify(sessionData), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/',
      });

      await logActivity('LOGIN', `Uživatel se úspěšně přihlásil: ${user.username} (${user.name})`);
      return { success: true };
    }

    return { success: false, error: 'Nesprávné přihlašovací údaje.' };
  } catch (error: any) {
    console.error('Error in login action:', error);
    return { success: false, error: 'Chyba při přihlašování.' };
  }
}

export async function logout() {
  try {
    await logActivity('LOGOUT', 'Uživatel se odhlásil');
    const cookieStore = await cookies();
    cookieStore.delete('auth_session');
    return { success: true };
  } catch (error: any) {
    console.error('Error in logout action:', error);
    return { success: false, error: 'Chyba při odhlašování.' };
  }
}

export async function getActivityLogs(page: number = 1, limit: number = 50, search?: string) {
  try {
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search && search.trim() !== '') {
      const term = search.trim();
      where.OR = [
        { username: { contains: term } },
        { action: { contains: term } },
        { details: { contains: term } },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.activityLog.count({ where }),
    ]);

    return {
      success: true,
      logs,
      total,
      totalPages: Math.ceil(total / limit),
    };
  } catch (error: any) {
    console.error('Error fetching activity logs:', error);
    return { success: false, logs: [], total: 0, totalPages: 0, error: error.message };
  }
}

export async function getUsers() {
  try {
    const users = await prisma.user.findMany({
      orderBy: { username: 'asc' },
    });
    return users.map(u => ({ id: u.id, username: u.username, name: u.name, role: u.role, createdAt: u.createdAt }));
  } catch (error) {
    console.error('Error fetching users:', error);
    return [];
  }
}

export async function createUser(data: { username: string; password: string; name: string; role?: string }) {
  try {
    const existing = await prisma.user.findUnique({
      where: { username: data.username },
    });
    if (existing) {
      return { success: false, error: 'Uživatelské jméno již existuje.' };
    }

    const passwordHash = await hashPassword(data.password);
    await prisma.user.create({
      data: {
        username: data.username,
        passwordHash,
        name: data.name,
        role: data.role || 'user',
      },
    });

    await logActivity('USER_CREATE', `Vytvořen nový uživatel: ${data.username} (${data.name})`);
    return { success: true };
  } catch (error: any) {
    console.error('Error creating user:', error);
    return { success: false, error: error.message || 'Nepodařilo se vytvořit uživatele.' };
  }
}

export async function deleteUser(id: string) {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return { success: false, error: 'Uživatel nenalezen.' };

    if (user.username === 'admin') {
      return { success: false, error: 'Hlavního administrátora "admin" nelze smazat.' };
    }

    await prisma.user.delete({ where: { id } });
    await logActivity('USER_DELETE', `Smazán uživatel: ${user.username}`);
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting user:', error);
    return { success: false, error: error.message || 'Nepodařilo se smazat uživatele.' };
  }
}

export async function changeUserPassword(id: string, newPassword: string) {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return { success: false, error: 'Uživatel nenalezen.' };

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    await logActivity('USER_PASSWORD_CHANGE', `Změněno heslo pro uživatele: ${user.username}`);
    return { success: true };
  } catch (error: any) {
    console.error('Error changing password:', error);
    return { success: false, error: error.message || 'Nepodařilo se změnit heslo.' };
  }
}

// ---------------------------------------------------------------------------
// FEED SYNCHRONIZATION & PRODUCT APPROVAL ACTIONS
// ---------------------------------------------------------------------------

export async function getFeedConfigAction() {
  const { getFeedConfig } = await import('@/lib/feedSync');
  return await getFeedConfig();
}

export async function saveFeedConfigAction(data: {
  url: string;
  autoApplySafe: boolean;
  priceThresholdPercent: number;
  checkEanValidity: boolean;
  cronSecret?: string;
}) {
  const { saveFeedConfig } = await import('@/lib/feedSync');
  const res = await saveFeedConfig(data);
  revalidatePath('/import');
  revalidatePath('/settings');
  return res;
}

export async function triggerFeedSyncAction(overrideUrl?: string) {
  const { syncProductsFromFeed } = await import('@/lib/feedSync');
  const result = await syncProductsFromFeed(overrideUrl);
  revalidatePath('/import');
  revalidatePath('/products');
  revalidatePath('/');
  return result;
}

export async function getPendingApprovalsAction() {
  const { getPendingApprovals } = await import('@/lib/feedSync');
  return await getPendingApprovals();
}

export async function getPendingApprovalsCountAction() {
  const { getPendingApprovalsCount } = await import('@/lib/feedSync');
  return await getPendingApprovalsCount();
}

export async function approvePendingProductAction(
  id: string,
  overrides?: {
    name?: string;
    brand?: string;
    price?: number;
    ean?: string;
  }
) {
  const { approvePendingProduct } = await import('@/lib/feedSync');
  const res = await approvePendingProduct(id, overrides);
  revalidatePath('/import');
  revalidatePath('/products');
  revalidatePath('/');
  return res;
}

export async function rejectPendingProductAction(id: string) {
  const { rejectPendingProduct } = await import('@/lib/feedSync');
  const res = await rejectPendingProduct(id);
  revalidatePath('/import');
  return res;
}

export async function approveAllPendingProductsAction(ids?: string[]) {
  const { approveAllPendingProducts } = await import('@/lib/feedSync');
  const res = await approveAllPendingProducts(ids);
  revalidatePath('/import');
  revalidatePath('/products');
  revalidatePath('/');
  return res;
}

export async function rejectAllPendingProductsAction(ids?: string[]) {
  const { rejectAllPendingProducts } = await import('@/lib/feedSync');
  const res = await rejectAllPendingProducts(ids);
  revalidatePath('/import');
  return res;
}

export async function getSyncLogsAction(limit: number = 10) {
  const { getSyncLogs } = await import('@/lib/feedSync');
  return await getSyncLogs(limit);
}




