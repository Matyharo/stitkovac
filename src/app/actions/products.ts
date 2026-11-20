'use server';

import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { validateProductInput } from '@/lib/inputValidation';
import { logActivity } from '@/lib/activity';
import { assertAuthenticated } from '@/lib/auth';
import { storeSafetySelection } from '@/lib/safetySelection';
import { getContactRules } from './contacts';
import { resolveContactTextForBrand, resolveSafetyTextForBrand } from '@/lib/productText';

// --- PRODUCTS ACTIONS ---

export async function getProducts(search?: string) {
  await assertAuthenticated();
  try {
    if (!search || search.trim() === '') {
      return await prisma.product.findMany({
        orderBy: { updatedAt: 'desc' },
      });
    }

    const query = `%${search.trim()}%`;
    return await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "Product" WHERE "name" LIKE ? OR "sku" LIKE ? OR "brand" LIKE ? OR "ean" LIKE ? OR "description" LIKE ? ORDER BY "updatedAt" DESC`,
      query, query, query, query, query
    );
  } catch (error) {
    console.error('Error fetching products:', error);
    throw new Error('Data se nepodařilo načíst. Zkuste to znovu.');
  }
}

export async function getProductById(id: string) {
  await assertAuthenticated();
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
  shortName?: string | null;
  description?: string | null;
  brand?: string | null;
  price?: number | null;
  safetyText?: string | null;
  confirmedSafetyCode?: string | null;
  expectedUpdatedAt?: string;
  contactText?: string | null;
  ean?: string | null;
  note?: string | null;
}) {
  await assertAuthenticated();
  try {
    data = validateProductInput(data);
    const { confirmedSafetyCode, expectedUpdatedAt, ...productData } = data;
    const allowed = new Set(['sku','name','shortName','description','brand','price','safetyText','contactText','ean','note']);
    for (const key of Object.keys(productData)) if (!allowed.has(key)) throw new Error('Neplatné pole produktu.');
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

    const description =
      data.description !== undefined
        ? data.description?.trim() || null
        : existingProduct?.description ?? null;

    const shortName =
      data.shortName !== undefined
        ? data.shortName?.trim() || null
        : existingProduct?.shortName ?? null;

    const updated = await prisma.$transaction(async tx => {
      const product = await tx.product.update({
      where: { id, updatedAt: new Date(expectedUpdatedAt || existingProduct!.updatedAt.toISOString()) },
      data: {
        ...productData,
        shortName,
        description,
        contactText,
        safetyText,
      },
    });
      await storeSafetySelection(tx, product, confirmedSafetyCode);
      return product;
    });
    await logActivity('PRODUCT_UPDATE', `Upraven produkt SKU: ${updated.sku} (Název: ${updated.name})`);
    revalidatePath('/products');
    revalidatePath('/');
    return { success: true, product: updated };
  } catch (error: any) {
    console.error(`Error updating product ${id}:`, error);
    return { success: false, error: (error.code === 'P2025' ? 'Produkt mezitím změnil jiný uživatel. Načtěte jej znovu.' : error.message) || 'Nepodařilo se aktualizovat produkt.' };
  }
}

export async function deleteProduct(id: string) {
  await assertAuthenticated();
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
  await assertAuthenticated();
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
  shortName?: string | null;
  description?: string | null;
  brand?: string | null;
  price?: number | null;
  safetyText?: string | null;
  confirmedSafetyCode?: string | null;
  expectedUpdatedAt?: string;
  contactText?: string | null;
  ean?: string | null;
  note?: string | null;
}) {
  await assertAuthenticated();
  try {
    data = validateProductInput(data);
    const { confirmedSafetyCode, expectedUpdatedAt, ...productData } = data;
    void expectedUpdatedAt;
    const allowed = new Set(['sku','name','shortName','description','brand','price','safetyText','contactText','ean','note']);
    for (const key of Object.keys(productData)) if (!allowed.has(key)) throw new Error('Neplatné pole produktu.');
    const rules = await getContactRules();
    const contactText = data.contactText?.trim()
      ? data.contactText
      : resolveContactTextForBrand(data.brand, rules);

    const safetyText = data.safetyText?.trim()
      ? data.safetyText
      : resolveSafetyTextForBrand(data.brand, rules);

    const description = data.description?.trim() ? data.description.trim() : null;
    const shortName = data.shortName?.trim() ? data.shortName.trim() : null;

    const created = await prisma.$transaction(async tx => {
      const product = await tx.product.create({
      data: {
        ...productData,
        shortName,
        description,
        contactText,
        safetyText,
      },
    });
      await storeSafetySelection(tx, product, confirmedSafetyCode);
      return product;
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

export async function clearAllProducts() {
  await assertAuthenticated(true);
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

export async function seedSampleProducts() {
  await assertAuthenticated(true);
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

export async function getProductIds() {
  await assertAuthenticated();
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

export async function getProductPage(input: { search?: string; page?: number; pageSize?: number; filters?: string[]; sort?: string }) {
  await assertAuthenticated();
  const { queryProductPage } = await import('@/lib/productPage');
  return queryProductPage(input);
}
