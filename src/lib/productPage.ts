import { prisma } from './db';
import type { Product } from '@prisma/client';
export async function queryProductPage(input: { search?: string; page?: number; pageSize?: number; filters?: string[]; sort?: string }) {
  const pageSize = Math.max(1, Math.min(500, Math.floor(input.pageSize || 50)));
  const expressions: Record<string, string> = { missing_price: '(price IS NULL OR price <= 0)', missing_ean: "(ean IS NULL OR trim(ean) = '')", missing_safety: "(safetyText IS NULL OR trim(safetyText) = '')", missing_contact: "(contactText IS NULL OR trim(contactText) = '')" };
  const sorts: Record<string, string> = { name_asc: 'name COLLATE NOCASE ASC', name_desc: 'name COLLATE NOCASE DESC', brand_asc: 'brand COLLATE NOCASE ASC', brand_desc: 'brand COLLATE NOCASE DESC', sku_asc: 'sku COLLATE NOCASE ASC', price_asc: 'price IS NULL, price ASC', price_desc: 'price DESC', updatedAt_desc: 'updatedAt DESC' };
  const search = (input.search || '').trim().slice(0, 200);
  const args = search ? Array(5).fill(`%${search}%`) : [];
  const base = search ? '(name LIKE ? OR sku LIKE ? OR brand LIKE ? OR ean LIKE ? OR description LIKE ?)' : '1=1';
  const conditions = (input.filters || []).filter(f => f in expressions).map(f => expressions[f]);
  const where = `${base}${conditions.length ? ` AND (${conditions.join(' OR ')})` : ''}`;
  return prisma.$transaction(async tx => {
    const [stats] = await tx.$queryRawUnsafe<{ total: bigint; price: bigint; ean: bigint; safety: bigint; contact: bigint }[]>(`SELECT COUNT(*) total, SUM(${expressions.missing_price}) price, SUM(${expressions.missing_ean}) ean, SUM(${expressions.missing_safety}) safety, SUM(${expressions.missing_contact}) contact FROM Product WHERE ${base}`, ...args);
    const [count] = await tx.$queryRawUnsafe<{ total: bigint }[]>(`SELECT COUNT(*) total FROM Product WHERE ${where}`, ...args);
    const total = Number(count.total);
    const page = Math.max(1, Math.min(Math.ceil(total / pageSize) || 1, Math.floor(input.page || 1)));
    const items = await tx.$queryRawUnsafe<Product[]>(`SELECT * FROM Product WHERE ${where} ORDER BY ${sorts[input.sort || ''] || sorts.updatedAt_desc}, id ASC LIMIT ? OFFSET ?`, ...args, pageSize, (page - 1) * pageSize);
    return { items, total, page, stats: { total: Number(stats.total), price: Number(stats.price || 0), ean: Number(stats.ean || 0), safety: Number(stats.safety || 0), contact: Number(stats.contact || 0) } };
  });
}
